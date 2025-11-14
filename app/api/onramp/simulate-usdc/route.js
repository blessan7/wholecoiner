/**
 * POST /api/onramp/simulate-usdc
 * Simulate USDC onramp by creating a database record only (no blockchain transaction)
 */

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { nanoid } from 'nanoid';
import { isValidSolanaAddress, getSolanaConnection } from '@/lib/solana';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_MINTS, getNetwork } from '@/lib/tokens';
import { SwapErrors, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/errors';
import { ensureIdempotency } from '@/lib/idempotency';
import { checkRateLimit } from '@/lib/rateLimit';
import { sendInvestmentNotification } from '@/lib/notifications';

const MIN_AMOUNT_USDC = 0.00001; // Allow very small test amounts
const SOL_FEE_BUFFER = 0.01; // Reserve 0.01 SOL for transaction fees and rent
const APPROXIMATE_SOL_PRICE_USD = 100; // Rough estimate for SOL/USD conversion

export async function POST(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;
  
  try {
    logger.info('[ONRAMP] Starting USDC onramp simulation', { requestId });
    
    // Step 1: Authentication
    logger.debug('[ONRAMP] Authenticating user', { requestId });
    const { user: authUser } = await requireAuth(request);
    user = authUser;
    logger.info('[ONRAMP] User authenticated', { userId: user.id, requestId });
    
    // Step 2: Rate limiting
    logger.debug('[ONRAMP] Checking rate limit', { userId: user.id, requestId });
    if (!checkRateLimit(user.id, 5)) {
      logger.warn('[ONRAMP] Rate limit exceeded', { userId: user.id, requestId });
      throw SwapErrors.NETWORK_ERROR();
    }
    logger.debug('[ONRAMP] Rate limit check passed', { userId: user.id, requestId });
    
    // Step 3: Parse and validate request body
    logger.debug('[ONRAMP] Parsing request body', { requestId });
    const body = await request.json();
    const { goalId, amountUsdc, batchId } = body;
    
    logger.info('[ONRAMP] Request parameters received', { 
      userId: user.id, 
      goalId, 
      amountUsdc, 
      batchId,
      requestId 
    });
    
    // Validate inputs
    if (!goalId) {
      logger.error('[ONRAMP] Validation failed: goalId missing', { requestId });
      throw new ValidationError('goalId is required');
    }
    
    if (!amountUsdc || typeof amountUsdc !== 'number' || amountUsdc < MIN_AMOUNT_USDC) {
      logger.error('[ONRAMP] Validation failed: invalid amountUsdc', { 
        amountUsdc, 
        minRequired: MIN_AMOUNT_USDC,
        requestId 
      });
      throw new ValidationError(`amountUsdc must be at least ${MIN_AMOUNT_USDC} USDC`);
    }
    
    logger.debug('[ONRAMP] Input validation passed', { 
      goalId, 
      amountUsdc, 
      requestId 
    });
    
    // Generate batchId if not provided
    const finalBatchId = batchId || nanoid();
    logger.info('[ONRAMP] Using batchId', { batchId: finalBatchId, wasProvided: !!batchId, requestId });
    
    // Step 4: Validate goal (before idempotency check for efficiency)
    logger.debug('[ONRAMP] Fetching goal', { goalId, userId: user.id, requestId });
    const goal = await prisma.goal.findFirst({
      where: {
        id: goalId,
        userId: user.id,
      },
    });
    
    if (!goal) {
      logger.error('[ONRAMP] Goal not found or access denied', { 
        goalId, 
        userId: user.id, 
        requestId 
      });
      throw SwapErrors.INVALID_WALLET();
    }
    
    logger.info('[ONRAMP] Goal found', { 
      goalId: goal.id, 
      goalStatus: goal.status, 
      goalCoin: goal.coin,
      requestId 
    });
    
    if (goal.status !== 'ACTIVE') {
      logger.error('[ONRAMP] Goal not ACTIVE', { 
        goalId: goal.id, 
        goalStatus: goal.status, 
        requestId 
      });
      throw new ValidationError('Goal must be ACTIVE to simulate onramp');
    }
    
    // Step 5: Validate user wallet address
    logger.debug('[ONRAMP] Validating user wallet address', { 
      walletAddress: user.walletAddress, 
      requestId 
    });
    
    if (!user.walletAddress || !isValidSolanaAddress(user.walletAddress)) {
      logger.error('[ONRAMP] Invalid or missing wallet address', { 
        userId: user.id, 
        walletAddress: user.walletAddress,
        requestId 
      });
      throw SwapErrors.INVALID_WALLET();
    }
    
    logger.debug('[ONRAMP] Wallet address validated', { 
      walletAddress: user.walletAddress, 
      requestId 
    });
    
    // Step 5.5: Validate SOL balance (user must have enough SOL to cover swap + fees)
    logger.debug('[ONRAMP] Checking SOL balance', { 
      walletAddress: user.walletAddress, 
      requestId 
    });
    
    const connection = getSolanaConnection();
    const userPublicKey = new PublicKey(user.walletAddress);
    
    try {
      const solBalance = await connection.getBalance(userPublicKey);
      const solBalanceInSol = solBalance / 1e9; // Convert lamports to SOL
      
      // Estimate required SOL: approximate USD amount / SOL price + fee buffer
      const estimatedSolNeeded = (amountUsdc / APPROXIMATE_SOL_PRICE_USD) + SOL_FEE_BUFFER;
      
      logger.info('[ONRAMP] SOL balance check', {
        solBalance: solBalanceInSol,
        estimatedSolNeeded,
        amountUsdc,
        requestId
      });
      
      if (solBalanceInSol < estimatedSolNeeded) {
        const shortfall = estimatedSolNeeded - solBalanceInSol;
        const swapSol = amountUsdc / APPROXIMATE_SOL_PRICE_USD;
        
        logger.error('[ONRAMP] Insufficient SOL balance', {
          solBalance: solBalanceInSol,
          required: estimatedSolNeeded,
          shortfall,
          swapSol,
          feeSol: SOL_FEE_BUFFER,
          requestId
        });
        
        throw new ValidationError(
          `Insufficient SOL balance for this swap.\n\n` +
          `Current balance: ${solBalanceInSol.toFixed(6)} SOL\n` +
          `Required: ${estimatedSolNeeded.toFixed(6)} SOL\n` +
          `Shortfall: ${shortfall.toFixed(6)} SOL\n\n` +
          `Breakdown:\n` +
          `- Swap amount: ~${swapSol.toFixed(6)} SOL (${amountUsdc} USDC)\n` +
          `- Transaction fees: ${SOL_FEE_BUFFER} SOL\n\n` +
          `Please add at least ${shortfall.toFixed(6)} SOL to your wallet before continuing.`
        );
      }
      
      logger.debug('[ONRAMP] SOL balance sufficient', { 
        solBalance: solBalanceInSol,
        requestId 
      });
      
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      
      logger.error('[ONRAMP] Failed to check SOL balance', {
        error: error.message,
        walletAddress: user.walletAddress,
        requestId
      });
      
      throw new ValidationError(
        'Failed to verify SOL balance. Please ensure your wallet is properly connected and try again.'
      );
    }
    
    // Step 6: Get network and USDC mint
    const network = getNetwork();
    const usdcMintInfo = TOKEN_MINTS.USDC;
    logger.debug('[ONRAMP] Network configuration', { 
      network, 
      usdcMint: usdcMintInfo.mint,
      requestId 
    });
    
    // Step 7: Generate simulated transaction signature
    const simulatedSignature = `sim_${crypto.randomUUID().replace(/-/g, '')}`;
    logger.debug('[ONRAMP] Generated simulated signature', { 
      signature: simulatedSignature, 
      requestId 
    });
    
    // Step 8: Check idempotency and create transaction if needed
    logger.info('[ONRAMP] Checking idempotency and creating transaction', { 
      userId: user.id,
      goalId,
      amountUsdc,
      batchId: finalBatchId,
      network,
      requestId 
    });
    
    const dbTransaction = await ensureIdempotency(finalBatchId, 'ONRAMP', async () => {
      // This function only runs if transaction doesn't exist
      logger.debug('[ONRAMP] Transaction does not exist, creating new one', { 
        batchId: finalBatchId, 
        requestId 
      });
      
      return await prisma.$transaction(async (tx) => {
        logger.debug('[ONRAMP] Inside DB transaction, creating record', { 
          batchId: finalBatchId, 
          requestId 
        });
        
        const txn = await tx.transaction.create({
          data: {
            goalId: goal.id,
            batchId: finalBatchId,
            type: 'ONRAMP',
            provider: 'FAUCET',
            network: network === 'devnet' ? 'DEVNET' : 'MAINNET',
            txnHash: simulatedSignature,
            amountUsd: amountUsdc,
            amountCrypto: amountUsdc, // Amount in USDC (not converted)
            tokenMint: usdcMintInfo.mint, // Mainnet USDC mint
            meta: {
              state: 'ONRAMP_CONFIRMED',
              simulation: true,
              simulated: true,
              solValidated: true,
              userWalletAddress: user.walletAddress,
            },
          },
        });
        
        logger.debug('[ONRAMP] Transaction record created in DB', { 
          transactionId: txn.id, 
          requestId 
        });
        
        return txn;
      });
    });
    
    // Check if this was an existing transaction (from idempotency check)
    if (dbTransaction.meta?.state === 'ONRAMP_CONFIRMED' && dbTransaction.meta?.simulated) {
      // Check if we just created it or if it already existed
      // If created, the signature should match what we just generated
      const isNewlyCreated = dbTransaction.txnHash === simulatedSignature;
      
      if (!isNewlyCreated) {
        logger.info('[ONRAMP] Transaction already exists (idempotency)', { 
          transactionId: dbTransaction.id, 
          batchId: finalBatchId,
          state: dbTransaction.meta?.state,
          requestId 
        });
        
        const state = dbTransaction.meta?.state || 'ONRAMP_CONFIRMED';
        
        return Response.json({
          success: true,
          batchId: finalBatchId,
          transaction: {
            id: dbTransaction.id,
            type: dbTransaction.type,
            txnHash: dbTransaction.txnHash,
            amountUsdc: dbTransaction.amountUsd,
            amountCrypto: dbTransaction.amountCrypto,
            network: dbTransaction.network,
            state,
          },
          explorerUrl: dbTransaction.txnHash 
            ? `https://explorer.solana.com/tx/${dbTransaction.txnHash}?cluster=${getNetwork() === 'devnet' ? 'devnet' : 'mainnet-beta'}`
            : null,
        }, { status: 200 });
      }
    }
    
    logger.info('[ONRAMP] Transaction successfully recorded', { 
      transactionId: dbTransaction.id, 
      batchId: finalBatchId,
      requestId 
    });
    
    // Step 9: Send notification (non-critical)
    logger.debug('[ONRAMP] Sending notification', { batchId: finalBatchId, requestId });
    try {
      await sendInvestmentNotification(finalBatchId, 'ONRAMP_CONFIRMED', {
        amountUsdc,
        goalCoin: goal.coin,
      });
      logger.debug('[ONRAMP] Notification sent successfully', { batchId: finalBatchId, requestId });
    } catch (notifError) {
      logger.warn('[ONRAMP] Failed to send notification (non-critical)', { 
        error: notifError.message,
        errorName: notifError.name,
        batchId: finalBatchId, 
        requestId 
      });
      // Don't fail the whole request if notification fails
    }
    
    // Step 10: Return success response
    logger.info('[ONRAMP] USDC onramp simulation completed successfully', { 
      transactionId: dbTransaction.id,
      batchId: finalBatchId,
      userId: user.id,
      requestId 
    });
    
    return Response.json({
      success: true,
      batchId: finalBatchId,
      transaction: {
        id: dbTransaction.id,
        type: dbTransaction.type,
        txnHash: dbTransaction.txnHash,
        amountUsdc: dbTransaction.amountUsd,
        amountCrypto: dbTransaction.amountCrypto,
        network: dbTransaction.network,
        state: dbTransaction.meta?.state || 'ONRAMP_CONFIRMED',
      },
      explorerUrl: null, // No real transaction, so no explorer URL
    }, { status: 201 });
    
  } catch (error) {
    logger.error('[ONRAMP] USDC onramp simulation failed', { 
      error: error.message,
      errorName: error.name,
      errorStack: error.stack,
      errorCode: error.code,
      userId: user?.id,
      requestId,
      // Include additional context if available
      ...(error.body ? { requestBody: error.body } : {}),
    });
    
    // Check if it's an Authentication or Authorization error
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      logger.debug('[ONRAMP] Authentication/Authorization error', { 
        code: error.code,
        statusCode: error.statusCode,
        requestId 
      });
      return Response.json({
        success: false,
        error: {
          code: error.code || 'AUTH_ERROR',
          message: error.message
        }
      }, { status: error.statusCode || 401 });
    }
    
    if (error.statusCode) {
      logger.debug('[ONRAMP] Error with status code', { 
        statusCode: error.statusCode,
        code: error.code,
        requestId 
      });
      return Response.json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      }, { status: error.statusCode });
    }
    
    logger.error('[ONRAMP] Unexpected error, returning generic error response', { requestId });
    return Response.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to simulate USDC onramp'
      }
    }, { status: 500 });
  }
}