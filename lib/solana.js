/**
 * Solana connection and wallet helpers for mainnet
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=c61b3693-90f8-46e7-b236-03871dbcdc1e';
const SOLANA_WS_URL = process.env.SOLANA_WS_URL || 'wss://mainnet.helius-rpc.com/?api-key=c61b3693-90f8-46e7-b236-03871dbcdc1e';

let connection = null;
let appWallet = null;
let currentRpcUrl = null;

/**
 * Get Solana connection (singleton)
 * Resets connection if RPC URL changes
 */
export function getSolanaConnection() {
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=c61b3693-90f8-46e7-b236-03871dbcdc1e';
  
  // Reset connection if RPC URL changed or connection doesn't exist
  if (!connection || currentRpcUrl !== rpcUrl) {
    connection = new Connection(rpcUrl, 'confirmed');
    currentRpcUrl = rpcUrl;
  }
  
  return connection;
}

/**
 * Get app wallet keypair from environment variable
 * Expects APP_WALLET_PRIVATE_KEY as base64-encoded 64-byte secret key
 */
export function getAppWallet() {
  if (!appWallet) {
    const privateKeyBase64 = process.env.APP_WALLET_PRIVATE_KEY;
    
    if (!privateKeyBase64) {
      throw new Error('APP_WALLET_PRIVATE_KEY environment variable is not set');
    }

    try {
      // Decode base64 to Buffer (should be 64 bytes)
      const secretKeyBuffer = Buffer.from(privateKeyBase64, 'base64');
      
      if (secretKeyBuffer.length !== 64) {
        throw new Error(`Invalid secret key length: expected 64 bytes, got ${secretKeyBuffer.length}`);
      }

      appWallet = Keypair.fromSecretKey(secretKeyBuffer);
    } catch (error) {
      throw new Error(`Failed to load app wallet: ${error.message}`);
    }
  }
  
  return appWallet;
}

/**
 * Get app wallet public key as string
 */
export function getAppWalletAddress() {
  const wallet = getAppWallet();
  return wallet.publicKey.toBase58();
}

/**
 * Convert SOL amount to lamports (smallest unit)
 */
export function solToLamports(sol) {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

/**
 * Convert lamports to SOL
 */
export function lamportsToSol(lamports) {
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Validate Solana address
 */
export function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}



