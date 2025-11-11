'use client';

import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { VersionedTransaction } from '@solana/web3.js';

/**
 * Hook to get user's Solana wallet
 * Returns the first connected Solana wallet or null if none
 */
export function useSolanaWallet() {
  const { wallets, ready } = useWallets();
  
  if (!ready || wallets.length === 0) {
    return null;
  }
  
  // Return first Solana wallet
  return wallets[0];
}

/**
 * Sign a Solana transaction using Privy embedded wallet
 * @param {Object} wallet - Privy Solana wallet object
 * @param {string} serializedTransaction - Base64 serialized transaction
 * @returns {Promise<string>} Base64 signed transaction
 */
export async function signSolanaTransaction(wallet, serializedTransaction) {
  if (!wallet) {
    throw new Error('No Solana wallet available');
  }
  
  try {
    // Convert base64 string to Uint8Array
    const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
    
    // Sign transaction using Privy wallet
    const { signedTransaction } = await wallet.signTransaction({
      transaction: new Uint8Array(transactionBuffer),
      chain: 'solana:mainnet',
    });
    
    // Return as base64 string
    return Buffer.from(signedTransaction).toString('base64');
    
  } catch (error) {
    console.error('Error signing transaction:', error);
    throw new Error(`Failed to sign transaction: ${error.message}`);
  }
}

