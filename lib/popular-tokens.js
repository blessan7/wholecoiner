/**
 * lib/popular-tokens.js
 * Top 10 popular tokens on Solana with their mint addresses
 */

import { TOKEN_MINTS } from './tokens.js';

// Top 10 popular tokens on Solana (by market cap/volume)
export const POPULAR_TOKENS = {
  // Native Solana
  SOL: {
    symbol: 'SOL',
    mint: TOKEN_MINTS.SOL.mint,
    decimals: 9,
    name: 'Solana',
    maxTarget: 10000
  },
  
  // Stablecoins
  USDC: {
    symbol: 'USDC',
    mint: TOKEN_MINTS.USDC.mint,
    decimals: 6,
    name: 'USD Coin',
    maxTarget: 1000000
  },
  USDT: {
    symbol: 'USDT',
    mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // Mainnet USDT
    decimals: 6,
    name: 'Tether',
    maxTarget: 1000000
  },
  
  // Wrapped assets (for goals)
  BTC: {
    symbol: 'BTC',
    mint: TOKEN_MINTS.BTC.mint,
    decimals: 8,
    name: 'Coinbase Wrapped BTC (cbBTC)',
    maxTarget: 10
  },
  ETH: {
    symbol: 'ETH',
    mint: TOKEN_MINTS.ETH.mint,
    decimals: 8,
    name: 'Wrapped Ethereum',
    maxTarget: 100
  },
  
  // Popular Solana tokens
  JUP: {
    symbol: 'JUP',
    mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    decimals: 6,
    name: 'Jupiter',
    maxTarget: 100000
  },
  RAY: {
    symbol: 'RAY',
    mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    decimals: 6,
    name: 'Raydium',
    maxTarget: 50000
  },
  BONK: {
    symbol: 'BONK',
    mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    decimals: 5,
    name: 'Bonk',
    maxTarget: 10000000
  },
  WIF: {
    symbol: 'WIF',
    mint: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    decimals: 6,
    name: 'dogwifhat',
    maxTarget: 100000
  },
  PYTH: {
    symbol: 'PYTH',
    mint: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
    decimals: 6,
    name: 'Pyth Network',
    maxTarget: 50000
  }
};

/**
 * Get token info by symbol
 * @param {string} symbol - Token symbol (e.g., 'BTC', 'SOL')
 * @returns {Object|null} Token info or null if not found
 */
export function getPopularToken(symbol) {
  const normalized = symbol.toUpperCase();
  return POPULAR_TOKENS[normalized] || null;
}

/**
 * Get all popular token symbols
 * @returns {string[]} Array of token symbols
 */
export function getPopularTokenSymbols() {
  return Object.keys(POPULAR_TOKENS);
}

/**
 * Check if token is supported
 * @param {string} symbol - Token symbol to check
 * @returns {boolean} True if token is supported
 */
export function isPopularToken(symbol) {
  const normalized = symbol.toUpperCase();
  return normalized in POPULAR_TOKENS;
}











