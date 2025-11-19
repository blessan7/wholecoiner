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
  const startTime = Date.now();
  
  logger.info('[INVEST] Starting submitAndConfirm', {
    hasSignedTransaction: !!signedTransaction,
    signedTransactionLength: signedTransaction?.length,
    lastValidBlockHeight,
    requestId,
    timestamp: new Date().toISOString()
  });
  
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
  
  logger.info('[INVEST] Transaction buffer created', {
    bufferLength: txBuffer.length,
    requestId
  });
  
  // Deserialize transaction
  let transaction;
  try {
    transaction = VersionedTransaction.deserialize(txBuffer);
    logger.info('[INVEST] Transaction deserialized', {
      hasTransaction: !!transaction,
      requestId
    });
  } catch (deserializeError) {
    logger.error('[INVEST] Transaction deserialization failed', {
      error: deserializeError.message,
      stack: deserializeError.stack,
      requestId
    });
    throw new ValidationError(`Transaction deserialization failed: ${deserializeError.message}`);
  }
  
  const blockhash = transaction.message.recentBlockhash?.toString() || null;
  
  // Get current block height before submission
  let currentBlockHeight = null;
  try {
    const slot = await connection.getSlot('confirmed');
    currentBlockHeight = slot;
    const blocksRemaining = lastValidBlockHeight ? lastValidBlockHeight - currentBlockHeight : null;
    
    logger.info('[INVEST] Current block height before submission', {
      currentBlockHeight,
      lastValidBlockHeight,
      blocksRemaining,
      blockhash,
      requestId
    });
    
    if (lastValidBlockHeight && currentBlockHeight >= lastValidBlockHeight) {
      logger.error('[INVEST] Block height already exceeded before submission', {
        currentBlockHeight,
        lastValidBlockHeight,
        blocksOver: currentBlockHeight - lastValidBlockHeight,
        requestId
      });
      throw new ValidationError(`Transaction block height expired: current ${currentBlockHeight} >= lastValid ${lastValidBlockHeight}`);
    }
  } catch (blockHeightError) {
    if (blockHeightError instanceof ValidationError) {
      throw blockHeightError;
    }
    logger.warn('[INVEST] Failed to get current block height', {
      error: blockHeightError.message,
      requestId
    });
  }
  
  // Send transaction
  const submitStartTime = Date.now();
  logger.info('[INVEST] Submitting transaction to Solana', {
    blockhash,
    lastValidBlockHeight,
    currentBlockHeight,
    skipPreflight: true,
    maxRetries: 3,
    requestId
  });
  
  const signature = await connection.sendRawTransaction(txBuffer, {
    skipPreflight: true,
    maxRetries: 3,
    preflightCommitment: 'confirmed',
  });
  
  const submitDuration = Date.now() - submitStartTime;
  
  logger.info('Transaction submitted', { 
    signature, 
    blockhash, 
    requestId,
    submitDuration: `${submitDuration}ms`,
    timestamp: new Date().toISOString()
  });
  
  // Confirm transaction
  const confirmStartTime = Date.now();
  logger.info('[INVEST] Starting transaction confirmation', {
    signature,
    blockhash,
    lastValidBlockHeight,
    currentBlockHeight,
    requestId
  });
  
  try {
    if (blockhash && lastValidBlockHeight) {
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
    } else {
      await connection.confirmTransaction(signature, 'confirmed');
    }
    
    const confirmDuration = Date.now() - confirmStartTime;
    const totalDuration = Date.now() - startTime;
    
    logger.info('[INVEST] Transaction confirmed successfully', {
      signature,
      confirmDuration: `${confirmDuration}ms`,
      totalDuration: `${totalDuration}ms`,
      requestId
    });
  } catch (confirmError) {
    const confirmDuration = Date.now() - confirmStartTime;
    logger.error('[INVEST] Transaction confirmation failed', {
      signature,
      error: confirmError.message,
      errorName: confirmError.name,
      confirmDuration: `${confirmDuration}ms`,
      blockhash,
      lastValidBlockHeight,
      currentBlockHeight,
      requestId
    });
    throw confirmError;
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
    
    logger.info('[INVEST] Request parsed', {
      goalId,
      batchId,
      hasSignedTransaction: !!signedTransaction,
      signedTransactionLength: signedTransaction?.length,
      lastValidBlockHeight,
      hasQuoteResponse: !!quoteResponse,
      quoteId: quoteResponse?.quoteId,
      quoteExpiresAt: quoteResponse?.expiresAt,
      requestId
    });
    
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

