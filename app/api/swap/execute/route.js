/**
 * POST /api/swap/execute
 * Execute Jupiter swap: get quote and unsigned transaction, or submit signed transaction
 */

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getSwapQuote, getSwapTransaction, submitSwapTransaction } from '@/lib/jupiter';
import { getSolanaConnection, isValidSolanaAddress, checkATAExists, createATAWithAppWallet, isToken2022 } from '@/lib/solana';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { getTokenMint, toSmallestUnits, fromSmallestUnits, getNetwork, isNativeSOL } from '@/lib/tokens';
import { SwapErrors, AuthenticationError, AuthorizationError, ValidationError, SwapError } from '@/lib/errors';
import { ensureIdempotency } from '@/lib/idempotency';
import { calculateProgress, shouldAutoComplete } from '@/lib/goalValidation';
import { sendInvestmentNotification } from '@/lib/notifications';

const SLIPPAGE_CONFIG = {
  DEFAULT: 50,           // 0.5%
  HIGH_VOLATILITY: 100,  // 1%
  MAX_ALLOWED: 200       // 2%
};

/**
 * Calculate next slippage level for retry attempts
 * Progression: 50 bps (0.5%) → 100 bps (1%) → 150 bps (1.5%) → 200 bps (2% max)
 * @param {number} currentSlippageBps - Current slippage in basis points
 * @returns {number|null} Next slippage level in bps, or null if max reached
 */
function calculateNextSlippage(currentSlippageBps) {
  const current = currentSlippageBps || SLIPPAGE_CONFIG.DEFAULT;
  
  if (current < 50) {
    return 50; // Start at default if below
  } else if (current < 100) {
    return 100; // 0.5% → 1%
  } else if (current < 150) {
    return 150; // 1% → 1.5%
  } else if (current < SLIPPAGE_CONFIG.MAX_ALLOWED) {
    return SLIPPAGE_CONFIG.MAX_ALLOWED; // 1.5% → 2% (max)
  } else {
    return null; // Max reached
  }
}

export async function POST(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;
  
  try {
    const { user: authUser } = await requireAuth(request);
    user = authUser;
    
    const body = await request.json();
    const { 
      goalId, 
      batchId, 
      inputMint, // 'USDC' (default) or 'SOL'
      outputMint, // Goal token: 'BTC', 'ETH', 'SOL'
      amount, // Amount in smallest units (from SwapCard)
      slippageBps,
      signedTransaction, // Optional: if provided, submit instead of getting quote
      quoteResponse, // Required when submitting signed transaction
      lastValidBlockHeight, // Optional: for better confirmation reliability
      mode, // 'quote' or 'execute' (defaults based on signedTransaction presence)
    } = body;
    
    // Determine mode
    const actualMode = mode || (signedTransaction ? 'execute' : 'quote');
    
    // Validate inputs
    if (!goalId) {
      throw new ValidationError('goalId is required');
    }
    
    if (!batchId) {
      throw new ValidationError('batchId is required');
    }
    
    // Validate slippage if provided
    if (slippageBps && slippageBps > SLIPPAGE_CONFIG.MAX_ALLOWED) {
      throw new ValidationError(`Slippage cannot exceed ${SLIPPAGE_CONFIG.MAX_ALLOWED} bps (${SLIPPAGE_CONFIG.MAX_ALLOWED/100}%)`);
    }
    
    // Validate quoteResponse when submitting signed transaction
    if (signedTransaction && !quoteResponse) {
      throw new ValidationError('quoteResponse required when submitting signed transaction');
    }
    
    // If signedTransaction provided, submit it
    if (signedTransaction) {
      return await handleExecuteMode({
        goalId,
        batchId,
        signedTransaction,
        quoteResponse,
        lastValidBlockHeight,
        userId: user.id,
        requestId,
      });
    }
    
    // Quote mode: get quote and return unsigned transaction
    if (actualMode === 'quote') {
    if (!inputMint || !outputMint) {
        throw new ValidationError('inputMint and outputMint are required in quote mode');
    }
    
      return await handleQuoteMode({
      goalId, 
        batchId,
        inputMint: inputMint || 'USDC', // Default to USDC
        outputMint,
        amount,
        slippageBps,
        userId: user.id,
        requestId,
    });
    }
    
    // Execute mode: submit signed transaction
    if (actualMode === 'execute') {
      if (!signedTransaction || !quoteResponse) {
        throw new ValidationError('signedTransaction and quoteResponse are required in execute mode');
      }
      
      return await handleExecuteMode({
        goalId,
        batchId,
        signedTransaction,
        quoteResponse,
        lastValidBlockHeight,
        userId: user.id,
        requestId,
      });
    }
    
    throw new ValidationError(`Invalid mode: ${actualMode}. Must be 'quote' or 'execute'`);
  } catch (error) {
    logger.error('Swap execution failed', { 
      error: error.message,
      errorCode: error.code,
      errorName: error.name,
      statusCode: error.statusCode,
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
    
    // Check if it's a SwapError (includes SLIPPAGE_EXCEEDED, SWAP_EXECUTION_FAILED, etc.)
    if (error instanceof SwapError) {
      return Response.json({
        success: false,
        error: {
          code: error.code || 'SWAP_ERROR',
          message: error.message || 'Swap execution failed',
          ...(error.hint && { hint: error.hint }),
          ...(error.retryable !== undefined && { retryable: error.retryable })
        }
      }, { status: error.statusCode || 400 });
    }
    
    // Handle errors with statusCode (ValidationError, AppError, etc.)
    if (error.statusCode) {
      return Response.json({
        success: false,
        error: {
          code: error.code || 'ERROR',
          message: error.message || 'An error occurred'
        }
      }, { status: error.statusCode });
    }
    
    // Comprehensive error logging with full details
    logger.error('Swap execution failed', {
      error: error?.message,
      code: error?.code,
      name: error?.name,
      stack: error?.stack,
      statusCode: error?.statusCode,
      requestId,
      userId: user?.id,
    });
    
    // Return detailed structured JSON response
    return Response.json({
      success: false,
      error: {
        code: error?.code || 'INTERNAL_ERROR',
        message: error?.message || 'Unexpected error during swap execution',
        name: error?.name,
        ...(process.env.NODE_ENV === 'development' && { 
          stack: error?.stack,
          details: error?.stack 
        })
      }
    }, { status: error?.statusCode || 500 });
  }
}

/**
 * Get quote data (internal helper - returns data object, not Response)
 * Used by both handleQuoteMode and auto-requote logic
 */
async function getQuoteData({ goalId, batchId, inputMint, outputMint, amount, slippageBps, userId, requestId }) {
  try {
    const finalSlippageBps = slippageBps || SLIPPAGE_CONFIG.DEFAULT;
      
    logger.info('Swap quote request', { 
      userId, 
      goalId, 
      batchId, 
      inputMint,
      outputMint,
      slippageBps: finalSlippageBps,
      requestId 
    });
    
    // Early validation
    if (!inputMint || !outputMint) {
      throw new ValidationError('inputMint and outputMint are required');
    }
    
    // Network validation - Jupiter quotes should use mainnet for better liquidity
    const currentNetwork = getNetwork();
    const normalizedOutputMint = outputMint.toUpperCase();
    
    logger.info('Quote network check', { 
      currentNetwork, 
      outputMint: normalizedOutputMint,
      requestId 
    });
    
    if (currentNetwork === 'devnet' && (normalizedOutputMint === 'BTC' || normalizedOutputMint === 'ETH')) {
      logger.warn('BTC/ETH quotes on devnet have limited liquidity', {
        outputMint: normalizedOutputMint,
        currentNetwork,
        requestId
      });
      // Note: We still try, but warn that it may fail
      // getTokenMint will throw error for BTC/ETH on devnet anyway
    }
    
    // Check idempotency (allow re-quoting if previous quote expired)
    const existing = await ensureIdempotency(batchId, 'SWAP', async () => null);
    
    if (existing && existing.meta?.state === 'SWAP_CONFIRMED') {
      logger.info('Swap already confirmed, returning existing', { 
        transactionId: existing.id, 
        batchId,
        requestId 
      });
      
      // Return data object (not Response) for getQuoteData
      return {
        success: true,
        batchId,
        alreadyConfirmed: true,
        transaction: {
          id: existing.id,
          type: existing.type,
          txnHash: existing.txnHash,
          amountCrypto: existing.amountCrypto,
          tokenMint: existing.tokenMint,
          network: existing.network,
          state: existing.meta?.state || 'SWAP_CONFIRMED',
        },
        explorerUrl: existing.txnHash 
          ? `https://explorer.solana.com/tx/${existing.txnHash}?cluster=${getNetwork() === 'devnet' ? 'devnet' : 'mainnet-beta'}`
          : null,
      };
    }
    
    // Validate goal
    const goal = await prisma.goal.findFirst({
      where: {
        id: goalId,
        userId: userId,
      },
    });
    
    if (!goal) {
      throw SwapErrors.INVALID_WALLET();
    }
    
    if (goal.status !== 'ACTIVE') {
      throw new ValidationError('Goal must be ACTIVE to execute swap');
    }
    
    // Get ONRAMP transaction for this batchId
    const onrampTransaction = await prisma.transaction.findFirst({
      where: {
        batchId,
        type: 'ONRAMP',
      },
    });
    
    if (!onrampTransaction) {
      throw new ValidationError('ONRAMP transaction not found for this batchId. Please simulate onramp first.');
    }
    
    // Check if onramp is confirmed
    const onrampState = onrampTransaction.meta?.state || 'ONRAMP_CONFIRMED';
    if (onrampState !== 'ONRAMP_CONFIRMED') {
      throw new ValidationError(`ONRAMP not confirmed. Current state: ${onrampState}`);
    }
    
    // Always use SOL as input (no intermediate swap needed)
    const actualInputMint = 'SOL';
    
    // Get swap amount from request body (user input from SwapCard)
    // If not provided, use a fallback estimate from onramp amount
    let swapAmount;
    if (amount) {
      // Amount provided in request (from SwapCard in smallest units)
      swapAmount = fromSmallestUnits(amount, 9); // SOL has 9 decimals
      logger.info('Using swap amount from request body', {
        amountInSmallestUnits: amount,
        amountInSol: swapAmount,
        batchId,
        requestId
      });
    } else {
      // Fallback: rough estimate from onramp USDC amount (1 USDC ≈ 0.01 SOL)
      swapAmount = onrampTransaction.amountCrypto / 100;
      logger.warn('No amount in request body, using fallback estimate', {
        onrampUsdc: onrampTransaction.amountCrypto,
        estimatedSol: swapAmount,
        batchId,
        requestId
      });
    }
    
    // Get token mint addresses with error handling
    // Use mainnet mints for Jupiter quotes (Jupiter API provides accurate mainnet prices)
    let inputTokenInfo, outputTokenInfo;
    try {
      inputTokenInfo = getTokenMint(actualInputMint, 'mainnet');
      outputTokenInfo = getTokenMint(outputMint, 'mainnet');
    } catch (mintError) {
      logger.error('Invalid token symbol', { 
        inputMint: actualInputMint, 
        outputMint, 
        error: mintError.message,
        requestId 
      });
      throw new ValidationError(`Invalid token symbol: ${mintError.message}`);
    }
    
    const swapAmountInSmallestUnits = toSmallestUnits(swapAmount, inputTokenInfo.decimals);
      
    logger.info('Getting swap quote', { 
      inputMint: inputTokenInfo.mint,
      outputMint: outputTokenInfo.mint,
      amount: swapAmountInSmallestUnits,
      slippageBps: finalSlippageBps,
      requestId 
    });
      
    // Get quote from Jupiter
    const quote = await getSwapQuote(
      inputTokenInfo.mint,
      outputTokenInfo.mint,
      swapAmountInSmallestUnits.toString(),
      finalSlippageBps
    );
      
    // Get user wallet address (needed for swap transaction)
    // Note: We'll get it from the goal's user relation
    const goalWithUser = await prisma.goal.findFirst({
      where: { id: goalId },
      include: { user: true },
    });
    
    if (!goalWithUser?.user?.walletAddress || !isValidSolanaAddress(goalWithUser.user.walletAddress)) {
      throw SwapErrors.INVALID_WALLET();
    }
    
    // SAFETY: Check user wallet balance before swap execution
    const connection = getSolanaConnection();
    const userWalletPubkey = new PublicKey(goalWithUser.user.walletAddress);
    const userBalance = await connection.getBalance(userWalletPubkey);
    const userBalanceSol = userBalance / 1e9;
    
    // Estimate required SOL (rough estimate: swap amount + 0.005 SOL for fees)
    // Note: This is a conservative estimate. Actual swap may need more depending on token and Jupiter fees
    const estimatedRequiredSol = (swapAmount / 100) + 0.005; // Rough estimate assuming 1 SOL ≈ 100 USDC
    const MIN_SOL_FOR_TEST = 0.001; // Minimum 0.001 SOL needed for any transaction
    
    if (userBalanceSol < MIN_SOL_FOR_TEST) {
      throw new ValidationError(
        `User wallet has insufficient SOL balance (${userBalanceSol.toFixed(6)} SOL). ` +
        `Minimum ${MIN_SOL_FOR_TEST} SOL required for swap execution. ` +
        `User needs to fund their wallet first.`
      );
    }
    
    if (userBalanceSol < estimatedRequiredSol) {
      logger.warn('User wallet balance may be insufficient for swap', {
        userBalanceSol,
        estimatedRequiredSol,
        swapAmountUsdc: swapAmount,
        userWallet: goalWithUser.user.walletAddress,
        requestId
      });
      // Continue with warning - actual swap will fail if insufficient, providing better error message
    }
    
    // Check and create ATA for output token if needed (app wallet pays)
    // Skip ATA creation for native SOL - it doesn't use token accounts
    if (isNativeSOL(outputTokenInfo.mint)) {
      logger.info('Skipping ATA check for native SOL', {
        outputMint: outputTokenInfo.mint,
        userWallet: goalWithUser.user.walletAddress,
        requestId
      });
    } else {
      logger.info('Checking ATA for output token', {
        outputMint: outputTokenInfo.mint,
        userWallet: goalWithUser.user.walletAddress,
        requestId
      });
      
      try {
        // Detect if this is a Token-2022 mint
        const isToken2022Mint = await isToken2022(outputTokenInfo.mint);
        
        logger.debug('Token program detected', {
          outputMint: outputTokenInfo.mint,
          isToken2022: isToken2022Mint,
          requestId
        });
        
        // Check if ATA exists
        const { exists: ataExists, address: ataAddress } = await checkATAExists(
          outputTokenInfo.mint,
          goalWithUser.user.walletAddress,
          isToken2022Mint
        );
        
        if (!ataExists) {
          logger.info('ATA does not exist, attempting to create with app wallet', {
            outputMint: outputTokenInfo.mint,
            userWallet: goalWithUser.user.walletAddress,
            ataAddress: ataAddress.toBase58(),
            requestId
          });
          
          try {
            // Try to create ATA using app wallet as payer (optimization - user doesn't pay)
            // If this fails, Jupiter will handle ATA creation in the swap transaction
            const { signature, alreadyExists } = await createATAWithAppWallet(
              outputTokenInfo.mint,
              goalWithUser.user.walletAddress,
              isToken2022Mint
            );
            
            if (!alreadyExists && signature) {
              logger.info('ATA created successfully', {
                signature,
                ataAddress: ataAddress.toBase58(),
                outputMint: outputTokenInfo.mint,
                isToken2022: isToken2022Mint,
                requestId
              });
              
              // Store ATA creation in metadata for tracking
              quote.ataCreated = {
                signature,
                address: ataAddress.toBase58(),
                mint: outputTokenInfo.mint,
                createdAt: new Date().toISOString(),
              };
            }
          } catch (ataCreationError) {
            // If ATA creation fails, log warning but continue
            // Jupiter will automatically handle ATA creation in the swap transaction
            logger.warn('ATA creation failed, but continuing - Jupiter will handle it in swap transaction', {
              error: ataCreationError.message,
              errorName: ataCreationError.name,
              outputMint: outputTokenInfo.mint,
              userWallet: goalWithUser.user.walletAddress,
              ataAddress: ataAddress.toBase58(),
              isToken2022: isToken2022Mint,
              requestId
            });
            
            // Mark that ATA creation was attempted but failed
            quote.ataCreationAttempted = {
              failed: true,
              error: ataCreationError.message,
              willBeCreatedByJupiter: true,
            };
            // Don't throw - let Jupiter handle ATA creation
          }
        } else {
          logger.debug('ATA already exists', {
            ataAddress: ataAddress.toBase58(),
            requestId
          });
        }
      } catch (ataError) {
        // If ATA check fails, log warning but continue
        // Jupiter will automatically handle ATA creation in the swap transaction
        logger.warn('ATA check failed, but continuing - Jupiter will handle ATA creation in swap transaction', {
          error: ataError.message,
          outputMint: outputTokenInfo.mint,
          userWallet: goalWithUser.user.walletAddress,
          requestId
        });
        // Don't throw - let Jupiter handle ATA creation
      }
    }
    
    // Get swap transaction (unsigned)
    const swapData = await getSwapTransaction(
      quote,
      goalWithUser.user.walletAddress,
      finalSlippageBps
    );
      
    // Calculate output amount in human-readable format
    const outputAmount = fromSmallestUnits(quote.outAmount, outputTokenInfo.decimals);
    
    logger.info('Swap transaction prepared', { 
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      outputAmount,
      priceImpact: quote.priceImpactPct,
      expiresAt: quote.expiresAt,
      quoteId: quote.quoteId,
      requestId 
    });
    
    // Record QUOTED state transaction (upsert to handle re-quoting)
    const quotedTxn = await prisma.transaction.upsert({
      where: {
        batchId_type: {
          batchId,
          type: 'SWAP',
        },
      },
    create: {
      goalId,
      batchId,
      type: 'SWAP',
      provider: 'JUPITER',
      network: getNetwork() === 'devnet' ? 'DEVNET' : 'MAINNET',
      tokenMint: outputTokenInfo.mint,
      amountUsd: onrampTransaction.amountUsd,
      amountCrypto: outputAmount,
      meta: {
        state: 'QUOTED',
        expiresAt: quote.expiresAt,
        quoteId: quote.quoteId,
        inputMint: inputTokenInfo.mint,
        outputMint: outputTokenInfo.mint,
        inputAmount: swapAmount,
        outputAmount,
        priceImpactPct: quote.priceImpactPct,
        slippageBps: finalSlippageBps,
      },
    },
    update: {
      meta: {
        state: 'QUOTED',
        expiresAt: quote.expiresAt,
        quoteId: quote.quoteId,
        inputMint: inputTokenInfo.mint,
        outputMint: outputTokenInfo.mint,
        inputAmount: swapAmount,
        outputAmount,
        priceImpactPct: quote.priceImpactPct,
        slippageBps: finalSlippageBps,
      },
    },
    });
    
    // Send notification
    const expiresIn = quote.expiresAt ? 
      Math.round((new Date(quote.expiresAt).getTime() - Date.now()) / 1000) : 30;
    await sendInvestmentNotification(batchId, 'QUOTED', {
      inputAmount: swapAmount,
      outputAmount,
      goalCoin: outputMint,
      expiresIn,
    });
  
    // Return quote data object (not wrapped in Response)
    return {
      success: true,
      batchId,
      quote: {
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        outputAmount,
        inputMint: inputTokenInfo.mint,
        outputMint: outputTokenInfo.mint,
        priceImpactPct: quote.priceImpactPct,
        slippageBps: finalSlippageBps,
        expiresAt: quote.expiresAt,
        quoteId: quote.quoteId,
      },
      swapTransaction: swapData.swapTransaction,
      lastValidBlockHeight: swapData.lastValidBlockHeight,
    };
  } catch (error) {
    // Return structured error response with enhanced context
    const errorCode = error.code || (error instanceof ValidationError ? 'VALIDATION_ERROR' : 'QUOTE_FAILED');
    let errorMessage = error.message || 'Failed to get quote';
    const statusCode = error.statusCode || (error instanceof ValidationError ? 400 : 500);
    
    // Enhance error message with token context if available
    // Try to get resolved mint addresses if error occurred after token resolution
    let inputMintAddress = inputMint;
    let outputMintAddress = outputMint;
    
    try {
      // If we got past token resolution, try to include resolved addresses
      const inputInfo = getTokenMint(inputMint, 'mainnet');
      const outputInfo = getTokenMint(outputMint, 'mainnet');
      inputMintAddress = inputInfo?.mint || inputMint;
      outputMintAddress = outputInfo?.mint || outputMint;
    } catch {
      // If token resolution failed, use symbols as-is
    }
    
    // Add mint addresses to error message for NO_ROUTE_FOUND
    if (errorCode === 'NO_ROUTE_FOUND') {
      errorMessage = `No swap route found for ${inputMint} → ${outputMint} (input: ${inputMintAddress}, output: ${outputMintAddress}). This may be due to limited liquidity or unsupported token pair.`;
    } else if (errorCode === 'JUPITER_API_ERROR' || errorCode === 'QUOTE_FAILED') {
      errorMessage = `${errorMessage} (Input: ${inputMint}/${inputMintAddress}, Output: ${outputMint}/${outputMintAddress})`;
    }
    
    logger.error('Quote failed', { 
      error: errorMessage, 
      code: errorCode, 
      requestId,
      inputMint,
      outputMint,
      inputMintAddress,
      outputMintAddress,
      stack: error.stack
    });
    
    throw error; // Re-throw to be caught by caller
  }
}

/**
 * Handle quote mode (Step A) - wraps getQuoteData in Response
 */
async function handleQuoteMode({ goalId, batchId, inputMint, outputMint, amount, slippageBps, userId, requestId }) {
  try {
    const quoteData = await getQuoteData({ goalId, batchId, inputMint, outputMint, amount, slippageBps, userId, requestId });
    // If already confirmed, return transaction data, otherwise return quote data
    if (quoteData.alreadyConfirmed) {
      return Response.json({
        success: true,
        batchId,
        transaction: quoteData.transaction,
        explorerUrl: quoteData.explorerUrl,
      }, { status: 200 });
    }
    return Response.json(quoteData, { status: 200 });
  } catch (error) {
    // Return structured error response with enhanced context
    const errorCode = error.code || (error instanceof ValidationError ? 'VALIDATION_ERROR' : 'QUOTE_FAILED');
    let errorMessage = error.message || 'Failed to get quote';
    const statusCode = error.statusCode || (error instanceof ValidationError ? 400 : 500);
    
    // Enhance error message with token context if available
    // Try to get resolved mint addresses if error occurred after token resolution
    let inputMintAddress = inputMint;
    let outputMintAddress = outputMint;
    
    try {
      // If we got past token resolution, try to include resolved addresses
      const inputInfo = getTokenMint(inputMint, 'mainnet');
      const outputInfo = getTokenMint(outputMint, 'mainnet');
      inputMintAddress = inputInfo?.mint || inputMint;
      outputMintAddress = outputInfo?.mint || outputMint;
    } catch {
      // If token resolution failed, use symbols as-is
    }
    
    // Add mint addresses to error message for NO_ROUTE_FOUND
    if (errorCode === 'NO_ROUTE_FOUND') {
      errorMessage = `No swap route found for ${inputMint} → ${outputMint} (input: ${inputMintAddress}, output: ${outputMintAddress}). This may be due to limited liquidity or unsupported token pair.`;
    } else if (errorCode === 'JUPITER_API_ERROR' || errorCode === 'QUOTE_FAILED') {
      errorMessage = `${errorMessage} (Input: ${inputMint}/${inputMintAddress}, Output: ${outputMint}/${outputMintAddress})`;
    }
    
    logger.error('Quote failed', { 
      error: errorMessage, 
      code: errorCode, 
      requestId,
      inputMint,
      outputMint,
      inputMintAddress,
      outputMintAddress,
      stack: error.stack
    });
    
    return Response.json({
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        // Include token info for debugging
        ...(errorCode === 'NO_ROUTE_FOUND' && {
          inputMint,
          outputMint,
          inputMintAddress,
          outputMintAddress
        })
      }
    }, { status: statusCode });
  }
}

/**
 * Handle execute mode (Step B)
 */
async function handleExecuteMode({ goalId, batchId, signedTransaction, quoteResponse, lastValidBlockHeight, userId, requestId }) {
  logger.info('Submitting signed swap transaction', { goalId, batchId, lastValidBlockHeight, requestId });
  
  // Get existing SWAP transaction (should be in QUOTED state)
  const existingSwap = await prisma.transaction.findFirst({
    where: {
      batchId,
      type: 'SWAP',
    },
  });
  
  if (existingSwap && existingSwap.meta?.state === 'SWAP_CONFIRMED') {
    logger.info('Swap already confirmed', { 
      transactionId: existingSwap.id, 
      batchId,
      requestId 
    });
    
    const goal = await prisma.goal.findFirst({ where: { id: goalId } });
    const progress = calculateProgress(goal.investedAmount, goal.targetAmount);
    
    return Response.json({
      success: true,
      batchId,
      transaction: {
        id: existingSwap.id,
        type: existingSwap.type,
        txnHash: existingSwap.txnHash,
        amountCrypto: existingSwap.amountCrypto,
        tokenMint: existingSwap.tokenMint,
        network: existingSwap.network,
        state: 'SWAP_CONFIRMED',
      },
      goal: goal ? {
        id: goal.id,
        investedAmount: goal.investedAmount,
        progressPercentage: progress,
        status: goal.status,
      } : null,
      explorerUrl: existingSwap.txnHash 
        ? `https://explorer.solana.com/tx/${existingSwap.txnHash}?cluster=${getNetwork() === 'devnet' ? 'devnet' : 'mainnet-beta'}`
        : null,
    }, { status: 200 });
  }
  
  // Get goal and ONRAMP transaction early (needed for auto-requote)
  const goal = await prisma.goal.findFirst({
    where: {
      id: goalId,
      userId: userId,
    },
  });
  
  if (!goal) {
    throw SwapErrors.INVALID_WALLET();
  }
  
  if (goal.status !== 'ACTIVE') {
    throw new ValidationError('Goal must be ACTIVE to execute swap');
  }
  
  const onrampTransaction = await prisma.transaction.findFirst({
    where: {
      batchId,
      type: 'ONRAMP',
    },
  });
  
  if (!onrampTransaction) {
    throw new ValidationError('ONRAMP transaction not found for this batchId');
  }
  
  // Validate quote expiry with improved handling + AUTO-REQUOTE (Option C from help.txt)
  if (quoteResponse.expiresAt) {
    const now = Date.now();
    const expiresAt = new Date(quoteResponse.expiresAt).getTime();
    const clockSkewMs = 8000; // 8 seconds buffer (increased from 2s for clock skew tolerance)
    const gracePeriodMs = 10000; // 10 seconds grace period after expiry
    const expiredMs = now - expiresAt;
    const remainingMs = expiresAt - now;
    
    // Check if quote is expired or about to expire
    if (now > expiresAt - clockSkewMs) {
      logger.warn('Quote expired or about to expire', { 
        expiresAt: quoteResponse.expiresAt,
        now: new Date(now).toISOString(),
        expiredMs,
        remainingMs,
        batchId,
        requestId 
      });
      
      // AUTO-REQUOTE: If quote expired less than 10s ago, fetch new quote automatically
      if (expiredMs > 0 && expiredMs < gracePeriodMs) {
        logger.info('Quote expired within grace period, attempting auto re-quote', {
          expiredMs,
          batchId,
          requestId
        });
        
        try {
          // Get token info from existing quote or transaction
          const inputMint = quoteResponse.inputMint || existingSwap?.meta?.inputMint || 'USDC';
          const outputMint = quoteResponse.outputMint || existingSwap?.meta?.outputMint || goal.coin;
          const slippageBps = quoteResponse.slippageBps || existingSwap?.meta?.slippageBps || SLIPPAGE_CONFIG.DEFAULT;
          
          // Fetch new quote automatically (like sher-web auto-requote pattern)
          // Use getQuoteData directly to get data object (not Response)
          // Use amount from existing swap metadata if available, otherwise undefined (will use fallback)
          const retryAmount = existingSwap?.meta?.inputAmount ? 
            toSmallestUnits(existingSwap.meta.inputAmount, 9) : undefined;
          const newQuoteData = await getQuoteData({
            goalId,
            batchId,
            inputMint,
            outputMint,
            amount: retryAmount,
            slippageBps,
            userId,
            requestId: `${requestId}-auto-requote`,
          });
          
          if (newQuoteData.success && newQuoteData.quote) {
            logger.info('Auto re-quote successful, returning new quote to frontend', {
              newQuoteId: newQuoteData.quote.quoteId,
              batchId,
              requestId
            });
            
            // Update state to indicate auto-requote occurred
            if (existingSwap) {
              await prisma.transaction.update({
                where: { id: existingSwap.id },
                data: {
                  meta: {
                    ...existingSwap.meta,
                    state: 'EXPIRED',
                    expiredAt: new Date().toISOString(),
                    gracePeriodUsed: true,
                    autoReQuoted: true,
                  },
                },
              });
            }
            
            // Return special response with retryable flag and new quote (Option C from help.txt)
            return Response.json({
              success: false,
              retryable: true,
              error: {
                code: 'QUOTE_EXPIRED',
                message: 'Quote expired. New quote automatically fetched - please re-sign and try again.',
              },
              newQuote: newQuoteData.quote,
              newSwapTransaction: newQuoteData.swapTransaction,
              newLastValidBlockHeight: newQuoteData.lastValidBlockHeight,
            }, { status: 400 });
          } else {
            logger.error('Auto re-quote failed', {
              error: newQuoteData.error,
              batchId,
              requestId
            });
            // Fall through to normal error handling
          }
        } catch (requoteError) {
          logger.error('Auto re-quote exception', {
            error: requoteError.message,
            batchId,
            requestId,
            stack: requoteError.stack
          });
          // Fall through to normal error handling - will return QUOTE_EXPIRED without retryable
        }
      } else if (expiredMs >= gracePeriodMs) {
        // Quote significantly expired (> 10s), hard fail
        logger.error('Quote significantly expired, blocking execution', {
          expiredMs,
          gracePeriodMs,
          batchId,
          requestId
        });
        
        // Update state to EXPIRED
        if (existingSwap) {
          await prisma.transaction.update({
            where: { id: existingSwap.id },
            data: {
              meta: {
                ...existingSwap.meta,
                state: 'EXPIRED',
                expiredAt: new Date().toISOString(),
              },
            },
          });
        }
        
        await sendInvestmentNotification(batchId, 'EXPIRED', {});
        
        return Response.json({
          success: false,
          error: {
            code: 'QUOTE_EXPIRED',
            message: `Quote expired ${Math.round(expiredMs / 1000)}s ago. Please request a new quote.`
          }
        }, { status: 422 });
      } else {
        // Quote about to expire (< 8s remaining), warn but allow
        logger.warn('Quote about to expire, execution may fail', {
          remainingMs,
          batchId,
          requestId
        });
      }
    }
  }
  
  // Validate quoteId idempotency if available
  if (quoteResponse.quoteId && existingSwap) {
    const existingQuoteId = existingSwap.meta?.quoteId;
    if (existingQuoteId && existingQuoteId !== quoteResponse.quoteId) {
      logger.warn('QuoteId mismatch', { 
        existing: existingQuoteId,
        provided: quoteResponse.quoteId,
        batchId 
      });
    }
  }
  
  // Get output token info
  const outputTokenInfo = getTokenMint(goal.coin);

  // Validate quote response
  if (!quoteResponse || !quoteResponse.outAmount) {
    throw new ValidationError('quoteResponse must include outAmount');
  }

  // Submit transaction - validate before submission (per help.txt)
  const connection = getSolanaConnection();
  
  // Step 1: Verify transaction integrity before decoding (per help.txt)
  if (!signedTransaction || typeof signedTransaction !== 'string') {
    throw new ValidationError('Missing or invalid swapTransaction string');
  }
  
  // Validate base64 format (per help.txt)
  if (!/^[A-Za-z0-9+/=]+$/.test(signedTransaction)) {
    throw new ValidationError('swapTransaction is not valid base64');
  }
  
  // Log length for debugging (per help.txt)
  logger.info('Transaction string received', {
    length: signedTransaction.length,
    batchId,
    requestId
  });
  
  // If too short, it's truncated (per help.txt)
  if (signedTransaction.length < 1000) {
    logger.warn('Transaction string seems too short, may be truncated', {
      length: signedTransaction.length,
      batchId,
      requestId
    });
  }
  
  // NOTE: Cannot refresh blockhash of signed transactions - it invalidates signatures
  // Jupiter quotes already include fresh blockhashes, so we submit as-is
  // If blockhash expires, auto-retry will handle it
  
  let signature;
  let blockhash;
  let lastValidBlockHeightFromTx;
  try {
    const result = await submitSwapTransactionImmediate(signedTransaction, connection, lastValidBlockHeight);
    signature = result.signature;
    blockhash = result.blockhash;
    lastValidBlockHeightFromTx = result.lastValidBlockHeight || lastValidBlockHeight;
  } catch (error) {
    // Handle slippage errors during submission with auto-requote (similar to confirmation errors)
    if (error instanceof SwapError && error.code === 'SLIPPAGE_EXCEEDED') {
      logger.warn('Slippage exceeded during submission, attempting auto-requote with increased slippage', {
        batchId,
        requestId,
        currentSlippage: quoteResponse.slippageBps || existingSwap?.meta?.slippageBps || SLIPPAGE_CONFIG.DEFAULT
      });
      
      // Get current slippage from quote or transaction meta
      const currentSlippageBps = quoteResponse.slippageBps || existingSwap?.meta?.slippageBps || SLIPPAGE_CONFIG.DEFAULT;
      const slippageRetryCount = existingSwap?.meta?.slippageRetryCount || 0;
      const maxSlippageRetries = 2; // Limit to 2 retries
      
      // Check if we can retry (haven't exceeded max retries)
      if (slippageRetryCount < maxSlippageRetries) {
        const nextSlippageBps = calculateNextSlippage(currentSlippageBps);
        
        if (nextSlippageBps && nextSlippageBps <= SLIPPAGE_CONFIG.MAX_ALLOWED) {
          logger.info('Attempting auto-requote with increased slippage (submission error)', {
            currentSlippageBps,
            nextSlippageBps,
            slippageRetryCount: slippageRetryCount + 1,
            batchId,
            requestId
          });
          
          try {
            // Get token info from existing quote or transaction meta
            // Handle all coin types: SOL, USDC, BTC, ETH
            const inputMint = quoteResponse.inputMint || existingSwap?.meta?.inputMint || 'USDC';
            const outputMint = quoteResponse.outputMint || existingSwap?.meta?.outputMint || goal.coin;
            
            // Fetch new quote with increased slippage (works for all coins via getQuoteData)
            // Use amount from existing swap metadata if available, otherwise undefined (will use fallback)
            const retryAmount = existingSwap?.meta?.inputAmount ? 
              toSmallestUnits(existingSwap.meta.inputAmount, 9) : undefined;
            const newQuoteData = await getQuoteData({
              goalId,
              batchId,
              inputMint,
              outputMint,
              amount: retryAmount,
              slippageBps: nextSlippageBps,
              userId,
              requestId: `${requestId}-slippage-retry-submission-${slippageRetryCount + 1}`,
            });
            
            if (newQuoteData.success && newQuoteData.quote) {
              logger.info('Auto re-quote with increased slippage successful (submission error)', {
                newSlippageBps: nextSlippageBps,
                newQuoteId: newQuoteData.quote.quoteId,
                inputMint,
                outputMint,
                batchId,
                requestId
              });
              
              // Update transaction meta with slippage retry info
              const swapTxnToUpdate = existingSwap || await prisma.transaction.findFirst({
                where: { batchId, type: 'SWAP' }
              });
              
              if (swapTxnToUpdate) {
                await prisma.transaction.update({
                  where: { id: swapTxnToUpdate.id },
                  data: {
                    meta: {
                      ...swapTxnToUpdate.meta,
                      state: 'FAILED',
                      error: 'Slippage exceeded during submission - auto-requoting with increased slippage',
                      errorCode: 'SLIPPAGE_EXCEEDED',
                      slippageRetryCount: slippageRetryCount + 1,
                      originalSlippageBps: existingSwap?.meta?.originalSlippageBps || currentSlippageBps,
                      currentSlippageBps: nextSlippageBps,
                      autoReQuoted: true,
                    },
                  },
                });
              }
              
              // Return retryable error response with new quote (same format as confirmation handler)
              // This works for all coin types (SOL, USDC, BTC, ETH) since getQuoteData handles them all
              return Response.json({
                success: false,
                retryable: true,
                error: {
                  code: 'SLIPPAGE_EXCEEDED',
                  message: `Slippage exceeded. New quote fetched with ${(nextSlippageBps / 100).toFixed(1)}% slippage tolerance - please re-sign and try again.`,
                },
                newQuote: newQuoteData.quote,
                newSwapTransaction: newQuoteData.swapTransaction,
                newLastValidBlockHeight: newQuoteData.lastValidBlockHeight,
                newSlippageBps: nextSlippageBps,
              }, { status: 400 });
            } else {
              logger.error('Auto re-quote with increased slippage failed (submission error)', {
                error: newQuoteData.error,
                inputMint,
                outputMint,
                batchId,
                requestId
              });
              // Fall through to normal error handling
            }
          } catch (requoteError) {
            logger.error('Auto re-quote with increased slippage exception (submission error)', {
              error: requoteError.message,
              batchId,
              requestId,
              stack: requoteError.stack
            });
            // Fall through to normal error handling
          }
        } else {
          logger.warn('Max slippage reached, cannot auto-requote (submission error)', {
            currentSlippageBps,
            maxSlippage: SLIPPAGE_CONFIG.MAX_ALLOWED,
            batchId,
            requestId
          });
          // Fall through to normal error handling
        }
      } else {
        logger.warn('Max slippage retries reached (submission error)', {
          slippageRetryCount,
          maxSlippageRetries,
          batchId,
          requestId
        });
        // Fall through to normal error handling
      }
    }
    
    // If submission fails (or auto-requote not possible), record as FAILED
    if (existingSwap) {
      await prisma.transaction.update({
        where: { id: existingSwap.id },
        data: {
          meta: {
            ...existingSwap.meta,
            state: 'FAILED',
            error: error.message,
            errorCode: error.code,
          },
        },
      });
    }
    
    await sendInvestmentNotification(batchId, 'FAILED', {
      reason: error.message,
    });
    
    throw error;
  }

  logger.info('Swap transaction submitted', { signature, requestId });

  // Send notification
  await sendInvestmentNotification(batchId, 'SWAP_SUBMITTED', {});

  // Calculate output amount
  const outAmountSmallestUnits = BigInt(quoteResponse.outAmount);
  const outAmountGoalTokenUnits = fromSmallestUnits(Number(outAmountSmallestUnits), outputTokenInfo.decimals);

  // Record SWAP_SUBMITTED state
  const swapTxn = await prisma.transaction.upsert({
    where: {
      batchId_type: {
        batchId,
        type: 'SWAP',
      },
    },
    create: {
        goalId: goal.id,
        batchId,
        type: 'SWAP',
        provider: 'JUPITER',
      network: getNetwork() === 'devnet' ? 'DEVNET' : 'MAINNET',
        txnHash: signature,
        amountUsd: onrampTransaction.amountUsd,
      amountCrypto: outAmountGoalTokenUnits,
        tokenMint: outputTokenInfo.mint,
        meta: {
        state: 'SWAP_SUBMITTED',
        expiresAt: quoteResponse.expiresAt,
        quoteId: quoteResponse.quoteId,
          onrampTransactionId: onrampTransaction.id,
          inputMint: onrampTransaction.tokenMint,
          outputMint: outputTokenInfo.mint,
        quoteOutAmountRaw: quoteResponse.outAmount,
          quoteOutAmountDecimals: outputTokenInfo.decimals,
          slippageBps: quoteResponse.slippageBps || SLIPPAGE_CONFIG.DEFAULT,
          originalSlippageBps: quoteResponse.slippageBps || SLIPPAGE_CONFIG.DEFAULT,
          slippageRetryCount: 0,
      },
    },
    update: {
      txnHash: signature,
      meta: {
        ...existingSwap?.meta,
        state: 'SWAP_SUBMITTED',
        expiresAt: quoteResponse.expiresAt,
        quoteId: quoteResponse.quoteId,
        slippageBps: quoteResponse.slippageBps || existingSwap?.meta?.slippageBps || SLIPPAGE_CONFIG.DEFAULT,
        originalSlippageBps: existingSwap?.meta?.originalSlippageBps || quoteResponse.slippageBps || SLIPPAGE_CONFIG.DEFAULT,
        slippageRetryCount: existingSwap?.meta?.slippageRetryCount || 0,
      },
    },
  });

  // Confirm transaction using blockhash (sher-web approach) - more reliable than polling
  let confirmed = false;
  try {
    // Use blockhash confirmation if available, otherwise fall back to signature confirmation
    if (blockhash && lastValidBlockHeightFromTx) {
      confirmed = await confirmTransactionWithBlockhash(connection, signature, blockhash, lastValidBlockHeightFromTx, requestId);
    } else {
      // Fallback: confirm by signature only (less reliable but works)
      logger.info('Confirming transaction by signature only (no blockhash)', { signature, requestId });
      await connection.confirmTransaction(signature, 'confirmed');
      confirmed = true;
    }
  } catch (error) {
    // Handle slippage errors with auto-requote (similar to quote expiration)
    if (error instanceof SwapError && error.code === 'SLIPPAGE_EXCEEDED') {
      logger.warn('Slippage exceeded during confirmation, attempting auto-requote with increased slippage', {
        batchId,
        requestId,
        currentSlippage: quoteResponse.slippageBps || existingSwap?.meta?.slippageBps || SLIPPAGE_CONFIG.DEFAULT
      });
      
      // Get current slippage from quote or transaction meta
      const currentSlippageBps = quoteResponse.slippageBps || existingSwap?.meta?.slippageBps || SLIPPAGE_CONFIG.DEFAULT;
      const slippageRetryCount = existingSwap?.meta?.slippageRetryCount || 0;
      const maxSlippageRetries = 2; // Limit to 2 retries
      
      // Check if we can retry (haven't exceeded max retries)
      if (slippageRetryCount < maxSlippageRetries) {
        const nextSlippageBps = calculateNextSlippage(currentSlippageBps);
        
        if (nextSlippageBps && nextSlippageBps <= SLIPPAGE_CONFIG.MAX_ALLOWED) {
          logger.info('Attempting auto-requote with increased slippage', {
            currentSlippageBps,
            nextSlippageBps,
            slippageRetryCount: slippageRetryCount + 1,
            batchId,
            requestId
          });
          
          try {
            // Get token info from existing quote or transaction
            const inputMint = quoteResponse.inputMint || existingSwap?.meta?.inputMint || 'USDC';
            const outputMint = quoteResponse.outputMint || existingSwap?.meta?.outputMint || goal.coin;
            
            // Fetch new quote with increased slippage
            // Use amount from existing swap metadata if available, otherwise undefined (will use fallback)
            const retryAmount = existingSwap?.meta?.inputAmount ? 
              toSmallestUnits(existingSwap.meta.inputAmount, 9) : undefined;
            const newQuoteData = await getQuoteData({
              goalId,
              batchId,
              inputMint,
              outputMint,
              amount: retryAmount,
              slippageBps: nextSlippageBps,
              userId,
              requestId: `${requestId}-slippage-retry-${slippageRetryCount + 1}`,
            });
            
            if (newQuoteData.success && newQuoteData.quote) {
              logger.info('Auto re-quote with increased slippage successful', {
                newSlippageBps: nextSlippageBps,
                newQuoteId: newQuoteData.quote.quoteId,
                batchId,
                requestId
              });
              
              // Update transaction meta with slippage retry info
              await prisma.transaction.update({
                where: { id: swapTxn.id },
                data: {
                  meta: {
                    ...swapTxn.meta,
                    state: 'FAILED',
                    error: 'Slippage exceeded - auto-requoting with increased slippage',
                    errorCode: 'SLIPPAGE_EXCEEDED',
                    slippageRetryCount: slippageRetryCount + 1,
                    originalSlippageBps: existingSwap?.meta?.originalSlippageBps || currentSlippageBps,
                    currentSlippageBps: nextSlippageBps,
                    autoReQuoted: true,
                  },
                },
              });
              
              // Return retryable error response with new quote (similar to QUOTE_EXPIRED)
              return Response.json({
                success: false,
                retryable: true,
                error: {
                  code: 'SLIPPAGE_EXCEEDED',
                  message: `Slippage exceeded. New quote fetched with ${(nextSlippageBps / 100).toFixed(1)}% slippage tolerance - please re-sign and try again.`,
                },
                newQuote: newQuoteData.quote,
                newSwapTransaction: newQuoteData.swapTransaction,
                newLastValidBlockHeight: newQuoteData.lastValidBlockHeight,
                newSlippageBps: nextSlippageBps,
              }, { status: 400 });
            } else {
              logger.error('Auto re-quote with increased slippage failed', {
                error: newQuoteData.error,
                batchId,
                requestId
              });
              // Fall through to normal error handling
            }
          } catch (requoteError) {
            logger.error('Auto re-quote with increased slippage exception', {
              error: requoteError.message,
              batchId,
              requestId,
              stack: requoteError.stack
            });
            // Fall through to normal error handling
          }
        } else {
          logger.warn('Max slippage reached, cannot auto-requote', {
            currentSlippageBps,
            maxSlippage: SLIPPAGE_CONFIG.MAX_ALLOWED,
            batchId,
            requestId
          });
          // Fall through to normal error handling
        }
      } else {
        logger.warn('Max slippage retries reached', {
          slippageRetryCount,
          maxSlippageRetries,
          batchId,
          requestId
        });
        // Fall through to normal error handling
      }
    }
    
    // If confirmation fails (or auto-requote not possible), record as FAILED
    await prisma.transaction.update({
      where: { id: swapTxn.id },
      data: {
        meta: {
          ...swapTxn.meta,
          state: 'FAILED',
          error: error.message,
          errorCode: error.code,
        },
      },
    });
    
    await sendInvestmentNotification(batchId, 'FAILED', {
      reason: error.message,
    });
    
    throw error;
  }
  
  if (confirmed) {
    // Update to SWAP_CONFIRMED and update goal
    const result = await prisma.$transaction(async (tx) => {
      const updatedTxn = await tx.transaction.update({
        where: { id: swapTxn.id },
        data: {
          meta: {
            ...swapTxn.meta,
            state: 'SWAP_CONFIRMED',
        },
      },
    });
    
      // Update goal invested amount
    const updatedGoal = await tx.goal.update({
      where: { id: goal.id },
      data: {
        investedAmount: {
          increment: outAmountGoalTokenUnits,
        },
      },
    });
    
    // Check if goal should auto-complete
    if (shouldAutoComplete(updatedGoal.investedAmount, updatedGoal.targetAmount)) {
      await tx.goal.update({
        where: { id: goal.id },
        data: { status: 'COMPLETED' },
      });
      updatedGoal.status = 'COMPLETED';
    }
    
    const progress = calculateProgress(updatedGoal.investedAmount, updatedGoal.targetAmount);
    
    return {
        transaction: updatedTxn,
      goal: updatedGoal,
      progress,
    };
  });
  
    logger.info('Swap transaction confirmed and goal updated', { 
    transactionId: result.transaction.id,
    goalId: result.goal.id,
    progress: result.progress,
    requestId 
  });
    
    // Send success notification
    await sendInvestmentNotification(batchId, 'SWAP_CONFIRMED', {
      outputAmount: outAmountGoalTokenUnits,
      goalCoin: goal.coin,
      progressPercentage: result.progress,
    });
  
    return Response.json({
      success: true,
      batchId,
      transaction: {
        id: result.transaction.id,
        type: result.transaction.type,
        txnHash: result.transaction.txnHash,
        amountCrypto: result.transaction.amountCrypto,
        tokenMint: result.transaction.tokenMint,
        network: result.transaction.network,
        state: 'SWAP_CONFIRMED',
      },
      goal: {
      id: result.goal.id,
      investedAmount: result.goal.investedAmount,
      progressPercentage: result.progress,
      status: result.goal.status,
    },
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${getNetwork() === 'devnet' ? 'devnet' : 'mainnet-beta'}`,
  }, { status: 201 });
  } else {
    // Timeout - return 202 with pending status
    logger.info('Swap transaction pending confirmation', { signature, requestId });
    
    return Response.json({
      success: true,
      pending: true,
      batchId,
      signature,
      state: 'SWAP_SUBMITTED',
      message: 'Transaction submitted. Confirmation pending.',
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${getNetwork() === 'devnet' ? 'devnet' : 'mainnet-beta'}`,
    }, { status: 202 });
  }
}

/**
 * Submit transaction without waiting for confirmation
 * Validates transaction integrity and submits as-is (cannot modify signed transactions)
 * Jupiter quotes include fresh blockhashes, and auto-retry handles expired blockhashes
 */
async function submitSwapTransactionImmediate(signedTransaction, connection, lastValidBlockHeight = null) {
  try {
    // Validate transaction buffer (per help.txt)
    if (!signedTransaction || typeof signedTransaction !== 'string') {
      throw new ValidationError('Invalid signed transaction: must be a base64 string');
    }
    
    // Validate base64 format (per help.txt)
    if (!/^[A-Za-z0-9+/=]+$/.test(signedTransaction)) {
      throw new ValidationError('swapTransaction is not valid base64');
    }
    
    const txBuffer = Buffer.from(signedTransaction, 'base64');
    if (!txBuffer || txBuffer.length === 0) {
      throw new ValidationError('Invalid signed transaction: empty buffer');
    }
    
    logger.info('Submitting transaction to Solana', { 
      bufferLength: txBuffer.length,
      stringLength: signedTransaction.length
    });
    
    // Deserialize transaction (Jupiter returns VersionedTransaction)
    let transaction;
    try {
      transaction = VersionedTransaction.deserialize(txBuffer);
    } catch (deserializeError) {
      logger.error('Transaction deserialization failed', {
        error: deserializeError.message,
        bufferLength: txBuffer.length,
        stringLength: signedTransaction.length,
        errorName: deserializeError.name
      });
      throw new ValidationError(
        `Transaction deserialization failed: ${deserializeError.message}. ` +
        `This usually means the transaction string was corrupted or truncated. ` +
        `Length: ${signedTransaction.length} chars, Buffer: ${txBuffer.length} bytes.`
      );
    }
    
    // NOTE: Cannot modify signed transaction's blockhash - it invalidates the signature
    // Jupiter quotes already include fresh blockhashes when generated
    // If blockhash expires, the auto-retry mechanism will fetch a new quote
    // Extract blockhash from transaction for confirmation
    const blockhash = transaction.message.recentBlockhash?.toString() || null;
    
    // Send transaction as-is (skipPreflight: true like sher-web for faster execution)
    const signature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight: true,
      maxRetries: 3,
      preflightCommitment: 'confirmed',
    });
    
    logger.info('Transaction submitted successfully', { 
      signature, 
      blockhash,
      lastValidBlockHeight,
      bufferLength: txBuffer.length
    });
    
    // Return signature and blockhash info for confirmation
    return { signature, blockhash, lastValidBlockHeight };
  } catch (error) {
    logger.error('Failed to submit swap transaction', {
      error: error.message,
      errorCode: error.code,
      errorName: error.name,
    });
    
    // Handle blockhash-related errors
    if (error.message?.includes('blockhash') || error.message?.includes('not found') || error.message?.includes('expired')) {
      throw new ValidationError(`Transaction blockhash expired: ${error.message}. Please try again with a fresh transaction.`);
    }
    if (error.message?.includes('insufficient') || error.message?.includes('balance')) {
      throw SwapErrors.INSUFFICIENT_BALANCE();
    }
    if (error.message?.includes('slippage')) {
      throw SwapErrors.SLIPPAGE_EXCEEDED();
    }
    
    throw new Error(`Transaction submission failed: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Confirm transaction using blockhash and lastValidBlockHeight (sher-web approach)
 * This is more reliable than polling getSignatureStatus
 */
async function confirmTransactionWithBlockhash(connection, signature, blockhash, lastValidBlockHeight, requestId) {
  try {
    logger.info('Confirming transaction', { signature, blockhash, lastValidBlockHeight, requestId });
    
    const res = await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    const jupErr = res.value?.err;
    
    if (jupErr) {
      logger.error('Transaction failed during confirmation', { signature, error: jupErr, requestId });
      
      // Parse Jupiter error codes from transaction error
      const errorObj = jupErr;
      const errorStr = JSON.stringify(errorObj);
      
      // Extract Jupiter error code from InstructionError
      let jupiterErrorCode = null;
      
      if (errorObj.InstructionError && Array.isArray(errorObj.InstructionError)) {
        const instructionError = errorObj.InstructionError[1];
        if (instructionError && instructionError.Custom) {
          jupiterErrorCode = instructionError.Custom;
        }
      }
      
      // Handle specific Jupiter error codes (like sher-web)
      if (jupiterErrorCode === 6025 || errorStr.includes('6025') || errorStr.includes('0x1789')) {
        throw SwapErrors.SLIPPAGE_EXCEEDED(null);
      }
      
      if (jupiterErrorCode === 6001 || jupiterErrorCode === 6017 || 
          errorStr.includes('6001') || errorStr.includes('6017')) {
        throw SwapErrors.SLIPPAGE_EXCEEDED(null);
      }
      
      // Generic transaction failure
      throw SwapErrors.SWAP_EXECUTION_FAILED(
        `Transaction failed on-chain. ${jupiterErrorCode ? `Jupiter error code: ${jupiterErrorCode}. ` : ''}This may be due to slippage, insufficient liquidity, or price movement.`
      );
    }
    
    logger.info('Transaction confirmed successfully', { signature, requestId });
    return true;
  } catch (error) {
    // Handle blockheight exceeded errors (like sher-web)
    const errorStr = JSON.stringify(error).toLowerCase();
    const errorMsg = error.message?.toLowerCase() || '';
    const isBlockheightError =
      error?.message?.includes('TransactionExpiredBlockheightExceededError') ||
      error?.message?.includes('block height exceeded') ||
      error?.message?.includes('expired') ||
      error?.name === 'TransactionExpiredBlockheightExceededError' ||
      errorStr.includes('transactionexpiredblockheightexceedederror') ||
      errorStr.includes('block height exceeded') ||
      errorStr.includes('expired');
    
    if (isBlockheightError) {
      logger.warn('Transaction expired due to blockheight exceeded', { signature, requestId });
      throw SwapErrors.QUOTE_EXPIRED();
    }
    
    // Re-throw SwapError instances
    if (error instanceof SwapError) {
      throw error;
    }
    
    // Wrap other errors
    throw new Error(`Transaction confirmation failed: ${error.message || 'Unknown error'}`);
  }
}



