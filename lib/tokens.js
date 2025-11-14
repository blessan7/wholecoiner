/**
 * Token mint address mappings for mainnet
 * Real token addresses on Solana mainnet
 * 
 * These addresses are used for Jupiter swaps and must match Jupiter's supported tokens.
 * All mints below are verified to work with Jupiter's swap aggregator on mainnet.
 * 
 * Note: For quotes, we always use mainnet mints regardless of the network setting
 * because Jupiter API provides accurate mainnet pricing even when testing.
 */

// Native SOL mint address (same for mainnet and devnet)
// Native SOL doesn't use token accounts - it's stored directly in wallet balances
export const NATIVE_SOL_MINT = 'So11111111111111111111111111111111111111112';

// Mainnet token mints
export const TOKEN_MINTS = {
  SOL: {
    mint: NATIVE_SOL_MINT,
    decimals: 9,
    symbol: 'SOL'
  },
  USDC: {
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',  // Mainnet USDC
    decimals: 6,
    symbol: 'USDC'
  },
  BTC: {
    // Coinbase cbBTC - Jupiter supported wrapped Bitcoin mint with institutional pricing
    // Aligns with Jupiter's recommended BTC route for accurate quotes
    mint: 'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij',
    decimals: 8,
    symbol: 'BTC'
  },
  ETH: {
    // Portal (Wormhole) WETH - Standard wrapped Ethereum on Solana, widely supported by Jupiter
    // This is the most liquid WETH token on Solana
    mint: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
    decimals: 8,
    symbol: 'ETH'
  }
};

// Devnet token mints
export const DEVNET_TOKEN_MINTS = {
  USDC: {
    mint: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr',  // Devnet USDC
    decimals: 6,
    symbol: 'USDC'
  },
  SOL: {
    mint: NATIVE_SOL_MINT,  // Same for devnet
    decimals: 9,
    symbol: 'SOL'
  }
};

/**
 * Get the current network (devnet or mainnet) from environment
 * @returns {string} 'devnet' or 'mainnet'
 */
export function getNetwork() {
  const rpcUrl = process.env.SOLANA_RPC_URL || '';
  return rpcUrl.includes('devnet') ? 'devnet' : 'mainnet';
}

/**
 * Get USDC mint address based on current network
 * @returns {Object} { mint, decimals, symbol }
 */
export function getUsdcMint() {
  const network = getNetwork();
  if (network === 'devnet') {
    return DEVNET_TOKEN_MINTS.USDC;
  }
  return TOKEN_MINTS.USDC;
}

/**
 * Get token mint info for a coin symbol
 * @param {string} coinSymbol - BTC, ETH, SOL, or USDC
 * @param {string} network - Optional: 'devnet' or 'mainnet'. If not provided, uses current network.
 * @returns {Object} { mint, decimals, symbol }
 */
export function getTokenMint(coinSymbol, network = null) {
  const normalized = coinSymbol.toUpperCase();
  const currentNetwork = network || getNetwork();
  
  // For SOL goals, use SOL mint (same for both networks)
  if (normalized === 'SOL') {
    return TOKEN_MINTS.SOL;
  }
  
  // For BTC/ETH goals, use wrapped tokens on mainnet (only mainnet)
  if (normalized === 'BTC') {
    if (currentNetwork === 'devnet') {
      throw new Error('BTC is not supported on devnet');
    }
    return TOKEN_MINTS.BTC;
  }
  
  if (normalized === 'ETH') {
    if (currentNetwork === 'devnet') {
      throw new Error('ETH is not supported on devnet');
    }
    return TOKEN_MINTS.ETH;
  }
  
  if (normalized === 'USDC') {
    if (currentNetwork === 'devnet') {
      return DEVNET_TOKEN_MINTS.USDC;
    }
    return TOKEN_MINTS.USDC;
  }
  
  throw new Error(`Unsupported coin symbol: ${coinSymbol}`);
}

/**
 * Check if coin symbol is supported for swaps
 */
export function isSupportedSwapCoin(coinSymbol) {
  const normalized = coinSymbol.toUpperCase();
  return normalized === 'SOL' || normalized === 'USDC' || normalized === 'BTC' || normalized === 'ETH';
}

/**
 * Convert human-readable amount to smallest units (lamports for SOL, decimals for tokens)
 */
export function toSmallestUnits(amount, decimals) {
  return Math.floor(amount * Math.pow(10, decimals));
}

/**
 * Convert smallest units to human-readable amount
 */
export function fromSmallestUnits(amount, decimals) {
  return amount / Math.pow(10, decimals);
}

/**
 * Get mainnet token mint for quotes (always returns mainnet regardless of network)
 * This ensures Jupiter quotes always use mainnet token addresses for accurate pricing.
 * @param {string} coinSymbol - BTC, ETH, SOL, or USDC
 * @returns {Object} { mint, decimals, symbol }
 */
export function getTokenMintForQuote(coinSymbol) {
  return getTokenMint(coinSymbol, 'mainnet');
}

/**
 * Check if a mint address is native SOL
 * Native SOL doesn't use token accounts - it's stored directly in wallet balances
 * @param {string|PublicKey} mintAddress - Token mint address to check
 * @returns {boolean} True if the mint is native SOL
 */
export function isNativeSOL(mintAddress) {
  const mint = typeof mintAddress === 'string' ? mintAddress : mintAddress.toString();
  return mint === NATIVE_SOL_MINT;
}



