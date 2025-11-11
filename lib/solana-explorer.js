/**
 * Helper functions to generate Solana Explorer URLs
 */

/**
 * Generate a transaction URL for Solana Explorer
 * @param {string} signature - Transaction signature (base58)
 * @param {string} cluster - Network cluster (devnet, testnet, mainnet-beta)
 * @returns {string} Explorer URL
 */
export function getTxExplorerUrl(signature, cluster = 'devnet') {
  if (!signature) return '#';
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

/**
 * Generate an address URL for Solana Explorer
 * @param {string} address - Wallet address (base58)
 * @param {string} cluster - Network cluster (devnet, testnet, mainnet-beta)
 * @returns {string} Explorer URL
 */
export function getAddressExplorerUrl(address, cluster = 'devnet') {
  if (!address) return '#';
  return `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

