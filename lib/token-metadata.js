/**
 * Token metadata fetching with caching
 * Tries backend API first, then falls back to Jupiter
 */

import { logger } from './logger.js';

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get token metadata with caching
 * @param {string} mint - Token mint address
 * @returns {Promise<Object>} Token metadata
 */
export async function getTokenMetadataWithCache(mint) {
  // Check cache first
  if (cache.has(mint)) {
    const cached = cache.get(mint);
    // Cache for 5 minutes
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    cache.delete(mint);
  }

  try {
    // First, try backend API
    const backendRes = await fetch(
      `${API_URL}/api/tokens/search?q=${mint}&limit=1`,
      {
        timeout: 15000,
      }
    );

    if (backendRes.ok) {
      const backendData = await backendRes.json();

      if (backendData.success && backendData.tokens && backendData.tokens.length > 0) {
        const token = backendData.tokens[0];
        
        // Check if address matches (case-insensitive)
        if (token.id && token.id.toLowerCase() === mint.toLowerCase()) {
          const tokenData = {
            id: token.id,
            name: token.name,
            symbol: token.symbol,
            decimals: token.decimals,
            icon: token.icon || token.logoURI,
            daily_volume: token.daily_volume,
            source: 'backend',
            ...token,
          };

          // Cache the result
          cache.set(mint, {
            data: tokenData,
            timestamp: Date.now(),
          });

          logger.info('Token found in backend database', { mint: mint.substring(0, 8) });
          return tokenData;
        }
      }
    }

    // Fallback to Jupiter API
    const jupiterRes = await fetch(
      `https://lite-api.jup.ag/tokens/v2/search?query=${mint}`
    );

    if (!jupiterRes.ok) {
      throw new Error(`Jupiter API error: ${jupiterRes.status}`);
    }

    const jupiterData = await jupiterRes.json();
    
    if (!jupiterData || jupiterData.length === 0) {
      throw new Error(`No token metadata found for mint ${mint}`);
    }
    
    const tokenData = {
      ...jupiterData[0],
      source: 'jupiter',
    };

    // Cache the result
    cache.set(mint, {
      data: tokenData,
      timestamp: Date.now(),
    });

    logger.info('Token found in Jupiter API', { mint: mint.substring(0, 8) });
    return tokenData;
  } catch (error) {
    logger.error('Error fetching token metadata', {
      error: error.message,
      mint: mint.substring(0, 8),
    });
    
    // Return minimal fallback data
    return {
      id: mint,
      name: 'Unknown Token',
      symbol: 'UNKNOWN',
      decimals: 9,
      icon: '',
      source: 'error',
      message: `Failed to fetch metadata: ${error.message}`,
    };
  }
}

/**
 * Clear the metadata cache
 */
export function clearCache() {
  cache.clear();
  logger.info('Token metadata cache cleared');
}

/**
 * Get cache size
 * @returns {number}
 */
export function getCacheSize() {
  return cache.size;
}

