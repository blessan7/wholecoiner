/**
 * POST /api/invest/execute
 * Execute investment: submit signed transaction and confirm
 * Returns simplified response for user-facing flow
 */

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getSolanaConnection } from '@/lib/solana';
import { VersionedTransaction } from '@solana/web3.js';
import { getTokenMint, fromSmallestUnits, getNetwork } from '@/lib/tokens';
import { SwapErrors, AuthenticationError, ValidationError } from '@/lib/errors';
import { calculateProgress } from '@/lib/goalValidation';
import { sendInvestmentNotification } from '@/lib/notifications';

/**
 * Submit transaction and confirm
 */
async function submitAndConfirm(signedTransaction, connection, lastValidBlockHeight, requestId) {
  // Validate transaction
  if (!signedTransaction || typeof signedTransaction !== 'string') {
    throw new ValidationError('Invalid signed transaction: must be a base64 string');
  }
  
  if (!/^[A-Za-z0-9+/=]+$/.test(signedTransaction)) {
    throw new ValidationError('swapTransaction is not valid base64');
  }
  
  const txBuffer = Buffer.from(signedTransaction, 'base64');
  if (!txBuffer || txBuffer.length === 0) {
    throw new ValidationError('Invalid signed transaction: empty buffer');
  }
  
  // Deserialize transaction
  let transaction;
  try {
    transaction = VersionedTransaction.deserialize(txBuffer);
  } catch (deserializeError) {
    throw new ValidationError(`Transaction deserialization failed: ${deserializeError.message}`);
  }
  
  const blockhash = transaction.message.recentBlockhash?.toString() || null;
  
  // Send transaction
  const signature = await connection.sendRawTransaction(txBuffer, {
    skipPreflight: true,
    maxRetries: 3,
    preflightCommitment: 'confirmed',
  });
  
  logger.info('Transaction submitted', { signature, blockhash, requestId });
  
  // Confirm transaction
  if (blockhash && lastValidBlockHeight) {
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
  } else {
    await connection.confirmTransaction(signature, 'confirmed');
  }
  
  return signature;
}

export async function POST(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;
  
  try {
    logger.info('[INVEST] Executing investment', { requestId });
    
    // Authentication
    const { user: authUser } = await requireAuth(request);
    user = authUser;
    
    // Parse request
    const body = await request.json();
    const { goalId, batchId, signedTransaction, quoteResponse, lastValidBlockHeight } = body;
    
    if (!goalId || !batchId || !signedTransaction || !quoteResponse) {
      throw new ValidationError('Missing required fields: goalId, batchId, signedTransaction, quoteResponse');
    }
    
    // Validate goal
    const goal = await prisma.goal.findFirst({
      where: {
        id: goalId,
        userId: user.id,
      },
    });
    
    if (!goal) {
      throw SwapErrors.INVALID_WALLET();
    }
    
    if (goal.status !== 'ACTIVE') {
      throw new ValidationError('Goal must be ACTIVE to execute investment');
    }
    
    // Get output token info
    const outputTokenInfo = getTokenMint(goal.coin);
    const outputAmount = fromSmallestUnits(quoteResponse.outAmount, outputTokenInfo.decimals);
    
    // Get or create SWAP transaction
    let swapTransaction = await prisma.transaction.findFirst({
      where: {
        batchId,
        type: 'SWAP',
      },
    });
    
    const connection = getSolanaConnection();
    
    // Submit and confirm transaction
    const signature = await submitAndConfirm(signedTransaction, connection, lastValidBlockHeight, requestId);
    
    // Update transaction in database
    if (swapTransaction) {
      swapTransaction = await prisma.transaction.update({
        where: { id: swapTransaction.id },
        data: {
          txnHash: signature,
          amountCrypto: outputAmount,
          tokenMint: outputTokenInfo.mint,
          meta: {
            state: 'SWAP_CONFIRMED',
            quoteId: quoteResponse.quoteId,
          },
        },
      });
    } else {
      swapTransaction = await prisma.transaction.create({
        data: {
          goalId: goal.id,
          batchId,
          type: 'SWAP',
          provider: 'JUPITER',
          network: getNetwork() === 'devnet' ? 'DEVNET' : 'MAINNET',
          txnHash: signature,
          amountCrypto: outputAmount,
          tokenMint: outputTokenInfo.mint,
          meta: {
            state: 'SWAP_CONFIRMED',
            quoteId: quoteResponse.quoteId,
          },
        },
      });
    }
    
    // Update goal invested amount
    const updatedGoal = await prisma.goal.update({
      where: { id: goal.id },
      data: {
        investedAmount: {
          increment: outputAmount,
        },
      },
    });
    
    // Check if goal is completed
    if (updatedGoal.investedAmount >= updatedGoal.targetAmount) {
      await prisma.goal.update({
        where: { id: goal.id },
        data: { status: 'COMPLETED' },
      });
      updatedGoal.status = 'COMPLETED';
    }
    
    const progress = calculateProgress(updatedGoal.investedAmount, updatedGoal.targetAmount);
    
    // Send notification
    await sendInvestmentNotification(batchId, 'SWAP_CONFIRMED', {
      outputAmount,
      goalCoin: goal.coin,
      progressPercentage: progress,
    });
    
    logger.info('[INVEST] Investment executed successfully', {
      batchId,
      signature,
      outputAmount,
      requestId
    });
    
    return Response.json({
      success: true,
      btcAmount: outputAmount, // Note: This is actually the goal coin amount
      transactionHash: signature,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${getNetwork() === 'devnet' ? 'devnet' : 'mainnet-beta'}`,
    }, { status: 200 });
    
  } catch (error) {
    logger.error('[INVEST] Failed to execute investment', {
      error: error.message,
      errorName: error.name,
      userId: user?.id,
      requestId
    });
    
    if (error instanceof AuthenticationError) {
      return Response.json({
        success: false,
        error: {
          code: error.code || 'AUTH_ERROR',
          message: error.message
        }
      }, { status: error.statusCode || 401 });
    }
    
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
        message: 'Failed to execute investment'
      }
    }, { status: 500 });
  }
}

