/**
 * USDC Faucet helpers for devnet
 * Provides utilities and instructions for funding app wallet with USDC
 */

import { getNetwork } from './tokens.js';
import { getAppWalletAddress } from './solana.js';
import { logger } from './logger.js';

const USDC_FAUCET_URL = 'https://usdcfaucet.com/';

/**
 * Get USDC faucet URL and instructions
 * @returns {Object} { url, instructions, walletAddress }
 */
export function getUSDCFaucetInfo() {
  const network = getNetwork();
  const walletAddress = getAppWalletAddress();
  
  if (network !== 'devnet') {
    return {
      available: false,
      message: 'USDC faucet is only available on devnet',
    };
  }
  
  return {
    available: true,
    url: USDC_FAUCET_URL,
    walletAddress,
    instructions: [
      `1. Visit ${USDC_FAUCET_URL}`,
      `2. Enter your wallet address: ${walletAddress}`,
      `3. Request USDC tokens (e.g., 1000 USDC)`,
      `4. Wait for transaction confirmation`,
      `5. Verify balance using: node scripts/setup-app-wallet-usdc.js`,
    ],
  };
}

/**
 * Get formatted error message with faucet instructions
 * @param {number} requiredAmount - Required USDC amount
 * @param {number} availableAmount - Available USDC amount
 * @returns {string} Formatted error message
 */
export function getInsufficientBalanceMessage(requiredAmount, availableAmount) {
  const faucetInfo = getUSDCFaucetInfo();
  
  if (!faucetInfo.available) {
    return `Insufficient USDC balance. Required: ${requiredAmount} USDC, Available: ${availableAmount.toFixed(6)} USDC.`;
  }
  
  return `Insufficient USDC balance. Required: ${requiredAmount} USDC, Available: ${availableAmount.toFixed(6)} USDC. ` +
    `Please fund the app wallet using the USDC faucet: ${faucetInfo.url} ` +
    `Wallet address: ${faucetInfo.walletAddress}`;
}

/**
 * Log faucet instructions to console/logger
 */
export function logFaucetInstructions() {
  const faucetInfo = getUSDCFaucetInfo();
  
  if (!faucetInfo.available) {
    logger.warn('USDC faucet not available', { network: getNetwork() });
    return;
  }
  
  logger.info('USDC Faucet Instructions', {
    url: faucetInfo.url,
    walletAddress: faucetInfo.walletAddress,
  });
  
  console.log('\n📝 USDC Faucet Instructions:');
  console.log(`   Visit: ${faucetInfo.url}`);
  console.log(`   Wallet: ${faucetInfo.walletAddress}`);
  faucetInfo.instructions.forEach((instruction, index) => {
    console.log(`   ${instruction}`);
  });
  console.log('');
}

