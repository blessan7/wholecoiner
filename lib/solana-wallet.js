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
  const startTime = Date.now();
  
  if (!wallet) {
    throw new Error('No Solana wallet available');
  }
  
  console.log('[signSolanaTransaction] Starting transaction signing', {
    hasWallet: !!wallet,
    transactionLength: serializedTransaction?.length,
    timestamp: new Date().toISOString()
  });
  
  try {
    // Convert base64 string to Uint8Array
    const transactionBuffer = Buffer.from(serializedTransaction, 'base64');
    
    console.log('[signSolanaTransaction] Transaction buffer created', {
      bufferLength: transactionBuffer.length,
      timestamp: new Date().toISOString()
    });
    
    // Sign transaction using Privy wallet
    const { signedTransaction } = await wallet.signTransaction({
      transaction: new Uint8Array(transactionBuffer),
      chain: 'solana:mainnet',
    });
    
    const duration = Date.now() - startTime;
    const signedBase64 = Buffer.from(signedTransaction).toString('base64');
    
    console.log('[signSolanaTransaction] Transaction signed successfully', {
      signedLength: signedBase64.length,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    
    // Return as base64 string
    return signedBase64;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('[signSolanaTransaction] Error signing transaction', {
      error: error.message,
      errorName: error.name,
      stack: error.stack,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });
    throw new Error(`Failed to sign transaction: ${error.message}`);
  }
}

