/**
 * POST /api/onramp/simulate
 * Simulate onramp by transferring mainnet SOL from app wallet to user wallet
 */

import { requireAuth, ensureTwoFa } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { nanoid } from 'nanoid';
import { 
  getSolanaConnection, 
  getAppWallet, 
  getAppWalletAddress,
  solToLamports,
  isValidSolanaAddress 
} from '@/lib/solana';
import { SwapErrors, AuthenticationError, AuthorizationError, ValidationError } from '@/lib/errors';
import { ensureIdempotency } from '@/lib/idempotency';
import { checkRateLimit } from '@/lib/rateLimit';
import { TOKEN_MINTS } from '@/lib/tokens';
import { SystemProgram, Transaction, PublicKey } from '@solana/web3.js';

const MIN_AMOUNT_USDC = 10;
const SOL_PRICE_USDC = 100; // Mock price conversion: 1 SOL = 100 USDC
const MAX_CONFIRMATION_WAIT_MS = 30000; // 30 seconds

export async function POST(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;
  
  try {
    const { user: authUser, sess } = await requireAuth(request);
    user = authUser;
    ensureTwoFa(sess, user);
    
    // Rate limiting
    if (!checkRateLimit(user.id, 5)) {
      throw SwapErrors.NETWORK_ERROR();
    }
    
    const body = await request.json();
    const { goalId, amountUsdc, batchId } = body;
    
    // Validate inputs
    if (!goalId) {
      throw new ValidationError('goalId is required');
    }
    
    if (!amountUsdc || typeof amountUsdc !== 'number' || amountUsdc < MIN_AMOUNT_USDC) {
      throw new ValidationError(`amountUsdc must be at least ${MIN_AMOUNT_USDC} USDC`);
    }
    
    // Generate batchId if not provided
    const finalBatchId = batchId || nanoid();
    
    logger.info('Onramp simulation request', { 
      userId: user.id, 
      goalId, 
      amountUsdc, 
      batchId: finalBatchId,
      requestId 
    });
    
    // Check idempotency
    const existing = await ensureIdempotency(finalBatchId, 'ONRAMP', async () => {
      // This will only be called if transaction doesn't exist
      return null;
    });
    
    if (existing) {
      logger.info('Onramp transaction already exists', { 
        transactionId: existing.id, 
        batchId: finalBatchId,
        requestId 
      });
      
      return Response.json({
        success: true,
        batchId: finalBatchId,
        transaction: {
          id: existing.id,
          type: existing.type,
          txnHash: existing.txnHash,
          amountUsdc: existing.amountInr, // Keep using amountInr in DB for backward compatibility
          amountCrypto: existing.amountCrypto,
          network: existing.network,
        },
        explorerUrl: existing.txnHash 
          ? `https://explorer.solana.com/tx/${existing.txnHash}?cluster=mainnet-beta`
          : null,
      }, { status: 200 });
    }
    
    // Validate goal
    const goal = await prisma.goal.findFirst({
      where: {
        id: goalId,
        userId: user.id,
      },
    });
    
    if (!goal) {
      throw SwapErrors.INVALID_WALLET(); // Reuse error for goal not found
    }
    
    if (goal.status !== 'ACTIVE') {
      throw new ValidationError('Goal must be ACTIVE to simulate onramp');
    }
    
    // Validate user wallet address
    if (!user.walletAddress || !isValidSolanaAddress(user.walletAddress)) {
      throw SwapErrors.INVALID_WALLET();
    }
    
    // Convert USDC to SOL (mock conversion)
    const solAmount = amountUsdc / SOL_PRICE_USDC;
    const lamports = solToLamports(solAmount);
    
    logger.info('Converting USDC to SOL', { amountUsdc, solAmount, lamports, requestId });
    
    // Get Solana connection and wallets
    const connection = getSolanaConnection();
    const appWallet = getAppWallet();
    const appWalletAddress = getAppWalletAddress();
    
    // Check app wallet balance
    const appBalance = await connection.getBalance(appWallet.publicKey);
    if (appBalance < lamports) {
      logger.error('Insufficient app wallet balance', { 
        balance: appBalance, 
        required: lamports,
        requestId 
      });
      throw SwapErrors.INSUFFICIENT_BALANCE();
    }
    
    // Create transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: appWallet.publicKey,
        toPubkey: new PublicKey(user.walletAddress),
        lamports,
      })
    );
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = appWallet.publicKey;
    
    // Sign transaction
    transaction.sign(appWallet);
    
    // Send transaction
    logger.info('Sending SOL transfer transaction', { 
      from: appWalletAddress,
      to: user.walletAddress,
      lamports,
      requestId 
    });
    
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    logger.info('SOL transfer transaction sent', { signature, requestId });
    
    // Wait for confirmation
    const confirmation = await Promise.race([
      connection.confirmTransaction(signature, 'confirmed'),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Confirmation timeout')), MAX_CONFIRMATION_WAIT_MS)
      ),
    ]);
    
    if (confirmation.value.err) {
      logger.error('SOL transfer transaction failed', { 
        signature, 
        error: confirmation.value.err,
        requestId 
      });
      throw SwapErrors.SWAP_EXECUTION_FAILED(JSON.stringify(confirmation.value.err));
    }
    
    logger.info('SOL transfer transaction confirmed', { signature, requestId });
    
    // Record transaction in database (atomic)
    const dbTransaction = await prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.create({
        data: {
          goalId: goal.id,
          batchId: finalBatchId,
          type: 'ONRAMP',
          provider: 'ONMETA',
          network: 'MAINNET',
          txnHash: signature,
          amountInr: amountUsdc, // Store as amountInr in DB for backward compatibility
          amountCrypto: solAmount,
          tokenMint: TOKEN_MINTS.SOL.mint,
          meta: {
            simulation: true,
            source: 'app_wallet',
            appWalletAddress,
            userWalletAddress: user.walletAddress,
          },
        },
      });
      
      return txn;
    });
    
    logger.info('Onramp transaction recorded', { 
      transactionId: dbTransaction.id, 
      batchId: finalBatchId,
      requestId 
    });
    
    return Response.json({
      success: true,
      batchId: finalBatchId,
      transaction: {
        id: dbTransaction.id,
        type: dbTransaction.type,
        txnHash: dbTransaction.txnHash,
        amountUsdc: dbTransaction.amountInr, // Return as amountUsdc for frontend
        amountCrypto: dbTransaction.amountCrypto,
        network: dbTransaction.network,
      },
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`,
    }, { status: 201 });
    
  } catch (error) {
    logger.error('Onramp simulation failed', { 
      error: error.message,
      errorName: error.name,
      userId: user?.id, 
      requestId 
    });
    
    // Check if it's an Authentication or Authorization error
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
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
        message: 'Failed to simulate onramp'
      }
    }, { status: 500 });
  }
}

