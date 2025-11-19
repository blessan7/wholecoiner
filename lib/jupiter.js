/**
 * Jupiter API v6 client wrapper
 */

import { logger } from './logger.js';
import { AppError, mapJupiterError } from './errors.js';
import { NATIVE_SOL_MINT } from './tokens.js';

// Using Jupiter Lite API (same as sher-web's working implementation)
const JUPITER_API_BASE = process.env.JUPITER_API_URL || 'https://lite-api.jup.ag';
const JUPITER_QUOTE_API = `${JUPITER_API_BASE}/swap/v1`;
const JUPITER_SWAP_API = `${JUPITER_API_BASE}/swap/v1`;
const DEFAULT_SLIPPAGE_BPS = 50; // 0.5%

/**
 * Get swap quote from Jupiter API
 * @param {string} inputMint - Input token mint address
 * @param {string} outputMint - Output token mint address  
 * @param {string|number} amount - Amount in smallest units (lamports for SOL, decimals for tokens)
 * @param {number} slippageBps - Slippage in basis points (default 50 = 0.5%)
 * @returns {Promise<Object>} Jupiter quote response with inputMint and outputMint preserved
 */
export async function getSwapQuote(inputMint, outputMint, amount, slippageBps = DEFAULT_SLIPPAGE_BPS) {
  try {
    // Use same endpoint format as sher-web: /swap/v1/quote
    const url = new URL(`${JUPITER_QUOTE_API}/quote`);
    url.searchParams.set('inputMint', inputMint);
    url.searchParams.set('outputMint', outputMint);
    url.searchParams.set('amount', amount.toString());
    url.searchParams.set('slippageBps', slippageBps.toString());

    logger.info('Fetching Jupiter quote', { 
      inputMint, 
      outputMint, 
      amount, 
      slippageBps,
      url: url.toString()
    });

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Parse JSON response even if status is 200 to check for Jupiter-specific errors
    let quote;
    const responseText = await response.text();
    
    try {
      quote = JSON.parse(responseText);
    } catch (parseError) {
      logger.error('Failed to parse Jupiter response', { 
        status: response.status,
        responseText: responseText.substring(0, 500),
        url: url.toString()
      });
      throw new AppError('Invalid JSON response from Jupiter API', 500, 'INVALID_RESPONSE');
    }

    // Check for Jupiter-specific error codes in response (even on 200 OK)
    if (quote.error || quote.errorCode) {
      const errorCode = quote.errorCode || 'UNKNOWN_ERROR';
      const errorMessage = quote.error || quote.message || 'Unknown Jupiter API error';
      
      logger.error('Jupiter quote API error', { 
        status: response.status, 
        errorCode,
        errorMessage,
        inputMint,
        outputMint,
        error: quote,
        url: url.toString()
      });
      
      // Map Jupiter error codes to our error codes
      if (errorCode === 'COULD_NOT_FIND_ANY_ROUTE') {
        throw new AppError(
          `No swap route found for token pair: ${inputMint} → ${outputMint}`,
          404,
          'NO_ROUTE_FOUND'
        );
      }
      
      if (errorCode === 'TOKEN_NOT_TRADABLE') {
        throw new AppError(
          `Token not tradable: ${outputMint}`,
          400,
          'TOKEN_NOT_TRADABLE'
        );
      }
      
      if (errorCode === 'ROUTE_PLAN_DOES_NOT_CONSUME_ALL_THE_AMOUNT') {
        throw new AppError(
          `Amount too large for available liquidity. Try reducing the swap amount.`,
          400,
          'AMOUNT_TOO_LARGE'
        );
      }
      
      // Generic Jupiter error
      throw new AppError(
        `Jupiter API error: ${errorMessage} (${errorCode})`,
        response.status || 400,
        'JUPITER_API_ERROR'
      );
    }

    // Handle HTTP errors
    if (!response.ok) {
      logger.error('Jupiter quote API HTTP error', { 
        status: response.status, 
        statusText: response.statusText,
        inputMint,
        outputMint,
        error: quote,
        url: url.toString()
      });
      
      if (response.status === 404) {
        throw new AppError(
          `No swap route found for token pair: ${inputMint} → ${outputMint}`,
          404,
          'NO_ROUTE_FOUND'
        );
      }
      
      throw new AppError(
        `Jupiter API error (${response.status}): ${response.statusText}. Input: ${inputMint}, Output: ${outputMint}`,
        response.status,
        'JUPITER_API_ERROR'
      );
    }
    
    if (!quote || !quote.outAmount) {
      throw new AppError('Invalid quote response from Jupiter', 500, 'INVALID_QUOTE');
    }

    // Extract expiresAt and quoteId from quote response
    // Jupiter quotes typically expire in ~60 seconds, but we'll use contextMaxSlot to calculate expiry
    // For now, we'll calculate expiresAt as current time + 60 seconds (conservative estimate)
    const now = Date.now();
    const expiresAt = quote.contextSlot ? 
      new Date(now + 60000).toISOString() : // 60 seconds default if no context
      new Date(now + 60000).toISOString();
    
    // Extract quoteId if available (some Jupiter responses include this)
    const quoteId = quote.contextSlot?.toString() || quote.quoteId || null;

    // Verify quote response includes inputMint (needed for wrapAndUnwrapSol check)
    const quoteInputMint = quote.inputMint || quote.inputMintAddress;
    
    const receivedAt = new Date().toISOString();
    const expiresInMs = expiresAt ? new Date(expiresAt).getTime() - Date.now() : null;
    
    logger.info('Jupiter quote received', { 
      inAmount: quote.inAmount, 
      outAmount: quote.outAmount,
      priceImpactPct: quote.priceImpactPct,
      expiresAt,
      quoteId,
      inputMint: quoteInputMint,
      outputMint: quote.outputMint || quote.outputMintAddress,
      isNativeSOL: quoteInputMint === NATIVE_SOL_MINT,
      receivedAt,
      expiresInMs
    });

    // Add expiresAt and quoteId to quote response
    // Ensure inputMint and outputMint are preserved for wrapAndUnwrapSol check
    // Jupiter quote response may not include inputMint/outputMint, so we preserve what we sent
    return {
      ...quote,
      expiresAt,
      quoteId,
      receivedAt,
      // Preserve inputMint and outputMint from our request (Jupiter may not return them)
      inputMint: quoteInputMint || quote.inputMint || inputMint,
      outputMint: quote.outputMint || quote.outputMintAddress || quote.outputMint || outputMint,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error('Failed to get Jupiter quote', { error: error.message });
    throw mapJupiterError(error);
  }
}

/**
 * Get swap transaction from Jupiter API
 * @param {Object} quoteResponse - Quote response from getSwapQuote
 * @param {string} userPublicKey - User's wallet public key (base58)
 * @param {number} slippageBps - Slippage in basis points
 * @returns {Promise<Object>} Swap transaction response
 */
export async function getSwapTransaction(quoteResponse, userPublicKey, slippageBps = DEFAULT_SLIPPAGE_BPS) {
  try {
    // Use same endpoint format as sher-web: /swap/v1/swap
    const url = `${JUPITER_SWAP_API}/swap`;
    
    // Check if input is native SOL (mint address)
    // Jupiter quote response includes inputMint field
    const inputMint = quoteResponse.inputMint || quoteResponse.inputMintAddress;
    const isNativeSOL = inputMint === NATIVE_SOL_MINT;
    
    // Match sher-web's swap request format
    // Note: slippageBps is already included in quoteResponse, no need to include separately
    // Explicitly set wrapAndUnwrapSol for native SOL swaps to ensure proper wrapping
    const swapRequest = {
      quoteResponse,
      userPublicKey,
      // Explicitly set wrapAndUnwrapSol for native SOL to ensure proper token account handling
      ...(isNativeSOL && { wrapAndUnwrapSol: true }),
      // Prioritization fee format matches sher-web's pattern
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: 10000,
          priorityLevel: 'medium',
        },
      },
    };

    const swapStartTime = Date.now();
    const quoteReceivedAt = quoteResponse.receivedAt ? new Date(quoteResponse.receivedAt).getTime() : null;
    const timeSinceQuote = quoteReceivedAt ? swapStartTime - quoteReceivedAt : null;
    
    logger.info('Fetching Jupiter swap transaction', { 
      userPublicKey, 
      slippageBps,
      inputMint,
      isNativeSOL,
      wrapAndUnwrapSol: isNativeSOL,
      swapRequestBody: JSON.stringify(swapRequest, null, 2),
      quoteReceivedAt: quoteResponse.receivedAt,
      timeSinceQuoteMs: timeSinceQuote,
      timestamp: new Date().toISOString()
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(swapRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Jupiter swap API error', { 
        status: response.status, 
        statusText: response.statusText,
        error: errorText 
      });
      
      if (response.status === 400) {
        throw new AppError('Invalid swap request', 400, 'INVALID_SWAP_REQUEST');
      }
      
      throw new AppError(`Jupiter swap API error: ${response.statusText}`, response.status, 'SWAP_API_ERROR');
    }

    const swapData = await response.json();
    const swapDuration = Date.now() - swapStartTime;
    
    // After receiving swap response - log response structure
    logger.info('Jupiter swap transaction response received', {
      hasSwapTransaction: !!swapData.swapTransaction,
      hasLastValidBlockHeight: !!swapData.lastValidBlockHeight,
      swapTransactionLength: swapData.swapTransaction?.length,
      lastValidBlockHeight: swapData.lastValidBlockHeight,
      swapDuration: `${swapDuration}ms`,
      timeSinceQuoteMs: timeSinceQuote,
      timestamp: new Date().toISOString(),
      requestId: 'jupiter-swap'
    });
    
    if (!swapData || !swapData.swapTransaction) {
      logger.error('Invalid swap transaction response from Jupiter', {
        hasSwapData: !!swapData,
        hasSwapTransaction: !!swapData?.swapTransaction,
        swapDataKeys: swapData ? Object.keys(swapData) : null,
        requestId: 'jupiter-swap'
      });
      throw new AppError('Invalid swap transaction response', 500, 'INVALID_SWAP_RESPONSE');
    }
    
    // Swap transaction validation
    logger.info('Validating swap transaction structure', {
      isString: typeof swapData.swapTransaction === 'string',
      isBase64: /^[A-Za-z0-9+/=]+$/.test(swapData.swapTransaction),
      length: swapData.swapTransaction?.length,
      hasLastValidBlockHeight: !!swapData.lastValidBlockHeight,
      lastValidBlockHeight: swapData.lastValidBlockHeight,
      requestId: 'jupiter-swap'
    });

    return swapData;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error('Failed to get Jupiter swap transaction', {
      error: error.message,
      errorName: error.name,
      errorStack: error.stack,
      requestId: 'jupiter-swap'
    });
    throw mapJupiterError(error);
  }
}

/**
 * Submit signed transaction to Solana network
 * @param {string} signedTransaction - Base64 encoded signed transaction
 * @param {Connection} connection - Solana connection
 * @returns {Promise<string>} Transaction signature
 */
export async function submitSwapTransaction(signedTransaction, connection) {
  try {
    const txBuffer = Buffer.from(signedTransaction, 'base64');
    
    logger.info('Submitting swap transaction to Solana');

    const signature = await connection.sendRawTransaction(txBuffer, {
      skipPreflight: false,
      maxRetries: 3,
    });

    logger.info('Swap transaction submitted', { signature });

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      logger.error('Swap transaction failed', { signature, error: confirmation.value.err });
      throw new AppError(`Swap transaction failed: ${JSON.stringify(confirmation.value.err)}`, 500, 'SWAP_EXECUTION_FAILED');
    }

    logger.info('Swap transaction confirmed', { signature });
    return signature;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    
    logger.error('Failed to submit swap transaction', { error: error.message });
    throw mapJupiterError(error);
  }
}



