/**
 * GET /api/investments/:batchId/status
 * Get investment status for a batch
 */

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { calculateProgress } from '@/lib/goalValidation';
import { getNetwork } from '@/lib/tokens';

/**
 * Determine current state from transactions
 */
function getCurrentState(transactions) {
  const states = [
    'PENDING_ONRAMP',
    'ONRAMP_CONFIRMED',
    'QUOTED',
    'SWAP_SIGNED',
    'SWAP_SUBMITTED',
    'SWAP_CONFIRMED',
    'EXPIRED',
    'FAILED',
    'CANCELED',
  ];

  // Find highest completed state
  for (let i = states.length - 1; i >= 0; i--) {
    const state = states[i];
    const hasState = transactions.some(txn => {
      const txnState = txn.meta?.state;
      return txnState === state;
    });
    if (hasState) {
      return state;
    }
  }

  // Default to first state if no transactions
  return 'PENDING_ONRAMP';
}

/**
 * Check if investment can be canceled
 */
function canCancel(state) {
  const cancelableStates = ['PENDING_ONRAMP', 'ONRAMP_CONFIRMED', 'QUOTED'];
  return cancelableStates.includes(state);
}

export async function GET(request, { params }) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const { batchId } = await params;

  try {
    const { user } = await requireAuth(request);

    if (!batchId) {
      return Response.json({
        success: false,
        error: {
          code: 'INVALID_BATCH_ID',
          message: 'batchId is required'
        }
      }, { status: 400 });
    }

    logger.info('Fetching investment status', { batchId, userId: user.id, requestId });

    // Get all transactions for this batch
    const transactions = await prisma.transaction.findMany({
      where: { batchId },
      orderBy: { timestamp: 'asc' },
    });

    if (transactions.length === 0) {
      return Response.json({
        success: false,
        error: {
          code: 'BATCH_NOT_FOUND',
          message: 'Investment batch not found'
        }
      }, { status: 404 });
    }

    // Get goal to verify ownership
    const goal = await prisma.goal.findFirst({
      where: {
        id: transactions[0].goalId,
        userId: user.id,
      },
    });

    if (!goal) {
      return Response.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authorized to view this investment'
        }
      }, { status: 403 });
    }

    // Determine current state
    const state = getCurrentState(transactions);

    // Get last signature
    const lastTransaction = transactions
      .filter(t => t.txnHash)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    const lastSignature = lastTransaction?.txnHash || null;

    // Get expiresAt from QUOTED transaction
    const quotedTxn = transactions.find(t => t.meta?.state === 'QUOTED');
    const expiresAt = quotedTxn?.meta?.expiresAt || null;

    // Check if expired
    let isExpired = false;
    if (expiresAt && state === 'QUOTED') {
      const now = Date.now();
      const expiryTime = new Date(expiresAt).getTime();
      isExpired = now > expiryTime;
    }

    // Calculate progress if goal exists
    let progress = null;
    if (goal) {
      progress = calculateProgress(goal.investedAmount, goal.targetAmount);
    }

    logger.info('Investment status fetched', {
      batchId,
      state,
      canCancel: canCancel(state),
      requestId
    });

    return Response.json({
      success: true,
      batchId,
      state: isExpired ? 'EXPIRED' : state,
      lastSignature,
      transactions: transactions.map(txn => ({
        id: txn.id,
        type: txn.type,
        provider: txn.provider,
        network: txn.network,
        txnHash: txn.txnHash,
        amountCrypto: txn.amountCrypto,
        tokenMint: txn.tokenMint,
        timestamp: txn.timestamp.toISOString(),
        state: txn.meta?.state || null,
      })),
      canCancel: canCancel(isExpired ? 'EXPIRED' : state),
      expiresAt,
      isExpired,
      progress: progress !== null ? {
        percentage: progress,
        investedAmount: goal.investedAmount,
        targetAmount: goal.targetAmount,
        coin: goal.coin,
      } : null,
      explorerUrl: lastSignature
        ? `https://explorer.solana.com/tx/${lastSignature}?cluster=${getNetwork() === 'devnet' ? 'devnet' : 'mainnet-beta'}`
        : null,
    }, { status: 200 });

  } catch (error) {
    logger.error('Failed to fetch investment status', {
      error: error.message,
      batchId,
      requestId
    });

    if (error.statusCode) {
      return Response.json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      }, { status: error.statusCode });
    }

    return Response.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch investment status'
      }
    }, { status: 500 });
  }
}


