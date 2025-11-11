/**
 * POST /api/investments/reconcile
 * Reconciliation endpoint to finalize pending SWAP_SUBMITTED transactions
 * This can be called by a cron job or manually
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getSolanaConnection } from '@/lib/solana';
import { getTokenMint, fromSmallestUnits, getNetwork } from '@/lib/tokens';
import { calculateProgress, shouldAutoComplete } from '@/lib/goalValidation';
import { sendInvestmentNotification } from '@/lib/notifications';

const RECONCILE_OLDER_THAN_MS = 60000; // 1 minute

/**
 * Poll for transaction confirmation
 */
async function pollConfirmation(connection, signature, maxWaitMs = 30000) {
  const startTime = Date.now();
  let backoffMs = 1000;
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const status = await connection.getSignatureStatus(signature);
      
      if (status?.value) {
        if (status.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
        }
        
        if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
          return true;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 4000);
      
    } catch (error) {
      if (error.message.includes('Transaction failed')) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 4000);
    }
  }
  
  return false;
}

export async function POST(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  
  try {
    logger.info('Starting reconciliation job', { requestId });

    // Get all SWAP_SUBMITTED transactions older than 1 minute
    const cutoffTime = new Date(Date.now() - RECONCILE_OLDER_THAN_MS);
    
    const pendingTransactions = await prisma.transaction.findMany({
      where: {
        type: 'SWAP',
        meta: {
          path: ['state'],
          equals: 'SWAP_SUBMITTED',
        },
        timestamp: {
          lt: cutoffTime,
        },
      },
      include: {
        goal: true,
      },
    });

    logger.info('Found pending transactions', {
      count: pendingTransactions.length,
      requestId
    });

    if (pendingTransactions.length === 0) {
      return Response.json({
        success: true,
        reconciled: 0,
        message: 'No pending transactions to reconcile'
      }, { status: 200 });
    }

    const connection = getSolanaConnection();
    let reconciled = 0;
    let failed = 0;

    for (const txn of pendingTransactions) {
      try {
        if (!txn.txnHash) {
          logger.warn('Transaction has no signature', { transactionId: txn.id, requestId });
          continue;
        }

        // Poll for confirmation
        const confirmed = await pollConfirmation(connection, txn.txnHash, 30000);

        if (confirmed) {
          // Update to SWAP_CONFIRMED and update goal
          const result = await prisma.$transaction(async (tx) => {
            // Get the transaction again to ensure we have latest data
            const currentTxn = await tx.transaction.findUnique({
              where: { id: txn.id },
            });

            if (!currentTxn || currentTxn.meta?.state !== 'SWAP_SUBMITTED') {
              // Already processed or state changed
              return null;
            }

            // Get output token info
            const outputTokenInfo = getTokenMint(txn.goal.coin);
            const outAmount = currentTxn.meta?.quoteOutAmountRaw;
            
            if (!outAmount) {
              throw new Error('Missing quote output amount in transaction meta');
            }

            const outAmountSmallestUnits = BigInt(outAmount);
            const outAmountGoalTokenUnits = fromSmallestUnits(
              Number(outAmountSmallestUnits),
              outputTokenInfo.decimals
            );

            // Update transaction
            const updatedTxn = await tx.transaction.update({
              where: { id: txn.id },
              data: {
                meta: {
                  ...currentTxn.meta,
                  state: 'SWAP_CONFIRMED',
                  reconciledAt: new Date().toISOString(),
                },
              },
            });

            // Update goal
            const updatedGoal = await tx.goal.update({
              where: { id: txn.goalId },
              data: {
                investedAmount: {
                  increment: outAmountGoalTokenUnits,
                },
              },
            });

            // Check auto-complete
            if (shouldAutoComplete(updatedGoal.investedAmount, updatedGoal.targetAmount)) {
              await tx.goal.update({
                where: { id: txn.goalId },
                data: { status: 'COMPLETED' },
              });
              updatedGoal.status = 'COMPLETED';
            }

            const progress = calculateProgress(updatedGoal.investedAmount, updatedGoal.targetAmount);

            return {
              transaction: updatedTxn,
              goal: updatedGoal,
              progress,
              outAmountGoalTokenUnits,
            };
          });

          if (result) {
            reconciled++;
            
            // Send notification
            await sendInvestmentNotification(txn.batchId, 'SWAP_CONFIRMED', {
              outputAmount: result.outAmountGoalTokenUnits,
              goalCoin: txn.goal.coin,
              progressPercentage: result.progress,
            });

            logger.info('Transaction reconciled', {
              transactionId: txn.id,
              batchId: txn.batchId,
              requestId
            });
          }
        } else {
          logger.warn('Transaction still pending after reconciliation attempt', {
            transactionId: txn.id,
            batchId: txn.batchId,
            requestId
          });
        }
      } catch (error) {
        failed++;
        logger.error('Reconciliation failed for transaction', {
          transactionId: txn.id,
          batchId: txn.batchId,
          error: error.message,
          requestId
        });

        // Mark as FAILED if transaction failed on-chain
        if (error.message.includes('Transaction failed')) {
          await prisma.transaction.update({
            where: { id: txn.id },
            data: {
              meta: {
                ...txn.meta,
                state: 'FAILED',
                error: error.message,
                reconciledAt: new Date().toISOString(),
              },
            },
          });

          await sendInvestmentNotification(txn.batchId, 'FAILED', {
            reason: error.message,
          });
        }
      }
    }

    logger.info('Reconciliation job completed', {
      reconciled,
      failed,
      total: pendingTransactions.length,
      requestId
    });

    return Response.json({
      success: true,
      reconciled,
      failed,
      total: pendingTransactions.length,
    }, { status: 200 });

  } catch (error) {
    logger.error('Reconciliation job failed', {
      error: error.message,
      requestId
    });

    return Response.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Reconciliation job failed'
      }
    }, { status: 500 });
  }
}











