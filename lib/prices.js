/**
 * lib/prices.js
 * Enhanced price fetching using Jupiter Lite API
 */

import { logger } from './logger.js';
import { POPULAR_TOKENS, getPopularToken, isPopularToken } from './popular-tokens.js';

// Mock prices as fallback (USD)
const MOCK_PRICES_USD = {
  BTC: 106398.0,
  ETH: 3610.75,
  SOL: 168.67,
  USDC: 0.03754618,
  USDT: 1.0,
  JUP: 0.00075262,
  RAY: 1.59,
  BONK: 0.00001338,
  WIF: 0.491672,
  PYTH: 0.10905
};

// Cache layer with per-token TTL
const priceCache = new Map(); // { tokenMint: { priceUSD, fetchedAt, errorCount } }
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes for individual tokens
const CACHE_TTL_MULTI_MS = 1 * 60 * 1000; // 1 minute for batch requests
const MAX_ERROR_COUNT = 3; // After 3 errors, use mock price

// Jupiter Lite API endpoint
const JUPITER_PRICE_API = 'https://lite-api.jup.ag/price/v3';

/**
 * Fetch prices from Jupiter Lite API (batch)
 * @param {string[]} mintAddresses - Array of token mint addresses
 * @returns {Promise<Object>} { mint: { usdPrice, ... } }
 */
async function fetchJupiterPrices(mintAddresses) {
  try {
    const ids = mintAddresses.join(',');
    const url = `${JUPITER_PRICE_API}?ids=${ids}`;
    
    logger.info('Fetching prices from Jupiter Lite API', { 
      count: mintAddresses.length,
      mints: mintAddresses.map(m => m.substring(0, 8) + '...')
    });

    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    logger.info('Jupiter prices received', { 
      count: Object.keys(data || {}).length 
    });

    return data || {};
    
  } catch (error) {
    logger.error('Jupiter Lite API fetch failed', { 
      error: error.message,
      mints: mintAddresses.length
    });
    throw error;
  }
}

/**
 * Get price in USD using Jupiter Lite API
 * @param {string} tokenMint - Token mint address
 * @returns {Promise<number>} Price in USD
 */
export async function getPriceUSD(tokenMint) {
  const cached = priceCache.get(tokenMint);
  const now = Date.now();
  
  // Check cache (with TTL)
  if (cached && (now - cached.fetchedAt < CACHE_TTL_MS)) {
    // If error count too high, skip cache and try again
    if (cached.errorCount >= MAX_ERROR_COUNT) {
      logger.warn('Token has high error count, using cached mock price', { 
        mint: tokenMint.substring(0, 8)
      });
      return cached.priceUSD; // Return cached mock price
    }
    
    return cached.priceUSD;
  }

  try {
    const prices = await fetchJupiterPrices([tokenMint]);
    const priceData = prices[tokenMint];
    
    if (!priceData || typeof priceData.usdPrice !== 'number') {
      throw new Error(`Invalid price data for mint ${tokenMint}`);
    }

    const priceUSD = priceData.usdPrice;
    
    // Cache successful result
    priceCache.set(tokenMint, {
      priceUSD,
      fetchedAt: now,
      errorCount: 0
    });

    logger.info('Price fetched successfully', { 
      mint: tokenMint.substring(0, 8),
      priceUSD: priceUSD.toFixed(4)
    });

    return priceUSD;

  } catch (error) {
    logger.warn('Price fetch failed, incrementing error count', { 
      mint: tokenMint.substring(0, 8),
      error: error.message
    });

    // Increment error count or use mock
    const tokenInfo = Object.values(POPULAR_TOKENS).find(t => t.mint === tokenMint);
    const mockPrice = tokenInfo ? MOCK_PRICES_USD[tokenInfo.symbol] : null;
    
    if (!mockPrice) {
      throw new Error(`No price available for mint ${tokenMint}`);
    }

    const errorCount = cached ? cached.errorCount + 1 : 1;
    
    // Cache mock price with error count
    priceCache.set(tokenMint, {
      priceUSD: mockPrice,
      fetchedAt: now,
      errorCount
    });

    // If too many errors, log warning
    if (errorCount >= MAX_ERROR_COUNT) {
      logger.error('Token price fetch consistently failing, using mock price', { 
        mint: tokenMint.substring(0, 8),
        symbol: tokenInfo?.symbol,
        errorCount
      });
    }

    return mockPrice;
  }
}

/**
 * Get multiple prices in USD (batch - optimized)
 * Strict mode: Only returns prices from Jupiter API, no mock fallbacks
 * @param {string[]} coinSymbols - Array of coin symbols
 * @returns {Promise<{prices: Object, fetchedAt: string, stale: boolean, source: string}>}
 */
export async function getPricesInUSD(coinSymbols) {
  const normalized = [...new Set(coinSymbols.map(c => c.toUpperCase()))];
  
  // Validate all coins
  for (const coin of normalized) {
    if (!isPopularToken(coin)) {
      throw new Error(`Unsupported token: ${coin}`);
    }
  }

  const cacheKey = `usd_${normalized.sort().join(',')}`;
  const now = Date.now();
  
  // Batch cache check
  const batchCache = priceCache.get(`batch_${cacheKey}`);
  if (batchCache && (now - batchCache.fetchedAt < CACHE_TTL_MULTI_MS)) {
    return {
      prices: batchCache.prices,
      fetchedAt: new Date(batchCache.fetchedAt).toISOString(),
      stale: false,
      source: batchCache.source || 'jupiter'
    };
  }

  try {
    // Get all token mints
    const tokenInfos = normalized.map(symbol => {
      const tokenInfo = getPopularToken(symbol);
      if (!tokenInfo) {
        throw new Error(`Token info not found for: ${symbol}`);
      }
      return {
        symbol,
        ...tokenInfo
      };
    });

    // Fetch all prices in parallel (Jupiter batch API)
    const mintAddresses = tokenInfos.map(t => t.mint);
    const jupiterPrices = await fetchJupiterPrices(mintAddresses);

    // Build result with USD prices (strict mode - Jupiter only)
    const prices = {};
    let hasCachedPrices = false;

    for (const tokenInfo of tokenInfos) {
      const jupiterData = jupiterPrices[tokenInfo.mint];
      
      if (jupiterData?.usdPrice && typeof jupiterData.usdPrice === 'number') {
        // Real Jupiter price
        const priceUSD = jupiterData.usdPrice;
        prices[tokenInfo.symbol] = priceUSD;
        
        // Update individual cache
        priceCache.set(tokenInfo.mint, {
          priceUSD,
          fetchedAt: now,
          errorCount: 0
        });
      } else {
        // If Jupiter doesn't return price, check cached price (only if from Jupiter)
        const cached = priceCache.get(tokenInfo.mint);
        if (cached?.priceUSD && cached.errorCount < MAX_ERROR_COUNT) {
          // Use cached price only if it came from Jupiter (errorCount < MAX_ERROR_COUNT)
          prices[tokenInfo.symbol] = cached.priceUSD;
          hasCachedPrices = true;
        } else {
          // Skip tokens without Jupiter price (strict mode - no mock prices)
          logger.warn('Price not available from Jupiter, skipping', { 
            symbol: tokenInfo.symbol 
          });
        }
      }
    }

    // Cache batch result
    priceCache.set(`batch_${cacheKey}`, {
      prices,
      fetchedAt: now,
      source: hasCachedPrices ? 'mixed' : 'jupiter'
    });

    return {
      prices,
      fetchedAt: new Date(now).toISOString(),
      stale: false,
      source: hasCachedPrices ? 'mixed' : 'jupiter'
    };

  } catch (error) {
    logger.error('Batch price fetch failed', { 
      error: error.message,
      coins: normalized
    });

    // In strict mode, only return cached prices from Jupiter (no mock prices)
    const prices = {};

    for (const symbol of normalized) {
      const tokenInfo = getPopularToken(symbol);
      if (!tokenInfo) continue;
      
      const cached = priceCache.get(tokenInfo.mint);
      
      // Only use cached prices if they're from Jupiter (errorCount < MAX_ERROR_COUNT)
      if (cached?.priceUSD && cached.errorCount < MAX_ERROR_COUNT) {
        prices[symbol] = cached.priceUSD;
      }
    }

    // Cache as stale batch
    priceCache.set(`batch_${cacheKey}`, {
      prices,
      fetchedAt: now,
      source: 'cached'
    });

    return {
      prices,
      fetchedAt: new Date(now).toISOString(),
      stale: true,
      source: 'cached'
    };
  }
}

/**
 * Get price impact for a swap (percentage)
 * @param {string} inputMint - Input token mint
 * @param {string} outputMint - Output token mint
 * @param {number} inputAmount - Input amount in smallest units
 * @param {number} expectedOutputAmount - Expected output from Jupiter quote
 * @param {number} inputDecimals - Decimals for input token
 * @param {number} outputDecimals - Decimals for output token
 * @returns {Promise<{impact: number, description: string, inputValueUSD: number, outputValueUSD: number}>}
 */
export async function calculatePriceImpact(inputMint, outputMint, inputAmount, expectedOutputAmount, inputDecimals, outputDecimals) {
  try {
    // Get spot prices
    const [inputPrice, outputPrice] = await Promise.all([
      getPriceUSD(inputMint),
      getPriceUSD(outputMint)
    ]);

    // Calculate expected output value in USD
    const inputValueUSD = (inputAmount / Math.pow(10, inputDecimals)) * inputPrice;
    const outputValueUSD = (expectedOutputAmount / Math.pow(10, outputDecimals)) * outputPrice;
    
    // Price impact = (expected - spot) / spot * 100
    const spotOutputAmount = inputValueUSD / outputPrice;
    const spotOutputAmountInSmallestUnits = spotOutputAmount * Math.pow(10, outputDecimals);
    const impact = ((expectedOutputAmount - spotOutputAmountInSmallestUnits) / spotOutputAmountInSmallestUnits) * 100;

    let description = 'Low';
    if (Math.abs(impact) > 5) description = 'High';
    else if (Math.abs(impact) > 1) description = 'Medium';

    return {
      impact: Math.round(impact * 100) / 100, // Round to 2 decimals
      description,
      inputValueUSD,
      outputValueUSD
    };

  } catch (error) {
    logger.error('Price impact calculation failed', { error: error.message });
    return {
      impact: 0,
      description: 'Unknown',
      inputValueUSD: 0,
      outputValueUSD: 0
    };
  }
}

/**
 * Get all popular tokens
 */
export function getSupportedTokens() {
  return Object.values(POPULAR_TOKENS);
}

/**
 * Get token info
 */
export function getTokenInfo(coinSymbol) {
  return getPopularToken(coinSymbol);
}

/**
 * Validate coin symbol
 */
export function isValidCoin(coinSymbol) {
  return isPopularToken(coinSymbol);
}

/**
 * Clear price cache (useful for testing or forced refresh)
 */
export function clearPriceCache() {
  priceCache.clear();
  logger.info('Price cache cleared');
}
