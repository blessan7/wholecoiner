/**
 * Solana connection and wallet helpers for mainnet
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL, Transaction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { logger } from './logger.js';

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

/**
 * Check if an associated token account exists for a given mint and owner
 * @param {PublicKey|string} mintAddress - Token mint address
 * @param {PublicKey|string} ownerAddress - Owner wallet address
 * @param {boolean} isToken2022 - Whether this is a Token-2022 program token
 * @returns {Promise<{exists: boolean, address: PublicKey}>}
 */
export async function checkATAExists(mintAddress, ownerAddress, isToken2022 = false) {
  const connection = getSolanaConnection();
  const mint = typeof mintAddress === 'string' ? new PublicKey(mintAddress) : mintAddress;
  const owner = typeof ownerAddress === 'string' ? new PublicKey(ownerAddress) : ownerAddress;
  
  try {
    const ataAddress = await getAssociatedTokenAddress(
      mint,
      owner,
      true, // allowOwnerOffCurve
      isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
    );
    
    const accountInfo = await connection.getAccountInfo(ataAddress);
    
    return {
      exists: accountInfo !== null,
      address: ataAddress,
    };
  } catch (error) {
    logger.error('Failed to check ATA existence', {
      error: error.message,
      mint: mint.toBase58(),
      owner: owner.toBase58(),
    });
    throw error;
  }
}

/**
 * Create an associated token account using the app wallet as payer
 * @param {PublicKey|string} mintAddress - Token mint address
 * @param {PublicKey|string} ownerAddress - Owner wallet address
 * @param {boolean} isToken2022 - Whether this is a Token-2022 program token
 * @returns {Promise<{signature: string, ataAddress: PublicKey}>}
 */
export async function createATAWithAppWallet(mintAddress, ownerAddress, isToken2022 = false) {
  const connection = getSolanaConnection();
  const appWallet = getAppWallet();
  const mint = typeof mintAddress === 'string' ? new PublicKey(mintAddress) : mintAddress;
  const owner = typeof ownerAddress === 'string' ? new PublicKey(ownerAddress) : ownerAddress;
  
  try {
    // Check if ATA already exists
    const { exists, address: ataAddress } = await checkATAExists(mint, owner, isToken2022);
    
    if (exists) {
      logger.info('ATA already exists', {
        ataAddress: ataAddress.toBase58(),
        mint: mint.toBase58(),
        owner: owner.toBase58(),
      });
      return {
        signature: null,
        ataAddress,
        alreadyExists: true,
      };
    }
    
    // Create the ATA instruction
    const instruction = createAssociatedTokenAccountInstruction(
      appWallet.publicKey, // payer
      ataAddress,
      owner,
      mint,
      isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
    );
    
    // Build and send transaction
    const transaction = new Transaction().add(instruction);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = appWallet.publicKey;
    
    // Sign with app wallet
    transaction.sign(appWallet);
    
    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
      preflightCommitment: 'confirmed',
    });
    
    // Confirm transaction
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');
    
    logger.info('ATA created successfully', {
      signature,
      ataAddress: ataAddress.toBase58(),
      mint: mint.toBase58(),
      owner: owner.toBase58(),
    });
    
    return {
      signature,
      ataAddress,
      alreadyExists: false,
    };
  } catch (error) {
    logger.error('Failed to create ATA', {
      error: error.message,
      mint: mint.toBase58(),
      owner: owner.toBase58(),
    });
    throw error;
  }
}

/**
 * Get SOL balance for a wallet address
 * @param {PublicKey|string} address - Wallet address
 * @returns {Promise<{lamports: number, sol: number}>}
 */
export async function getSOLBalance(address) {
  const connection = getSolanaConnection();
  const publicKey = typeof address === 'string' ? new PublicKey(address) : address;
  
  try {
    const balance = await connection.getBalance(publicKey);
    
    return {
      lamports: balance,
      sol: lamportsToSol(balance),
    };
  } catch (error) {
    logger.error('Failed to get SOL balance', {
      error: error.message,
      address: publicKey.toBase58(),
    });
    throw error;
  }
}

/**
 * Detect if a mint is a Token-2022 program token
 * @param {PublicKey|string} mintAddress - Token mint address
 * @returns {Promise<boolean>}
 */
export async function isToken2022(mintAddress) {
  const connection = getSolanaConnection();
  const mint = typeof mintAddress === 'string' ? new PublicKey(mintAddress) : mintAddress;
  
  try {
    const accountInfo = await connection.getAccountInfo(mint);
    
    if (!accountInfo) {
      return false;
    }
    
    return accountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
  } catch (error) {
    logger.error('Failed to detect token program', {
      error: error.message,
      mint: mint.toBase58(),
    });
    return false; // Default to TOKEN_PROGRAM_ID on error
  }
}

/**
 * Get token balance for a specific mint address and owner
 * @param {PublicKey|string} userPublicKey - User's wallet public key
 * @param {string} mintAddress - Token mint address
 * @returns {Promise<{mint: string, balance: number, decimals: number, uiAmount: number|null, tokenAccount: string}|null>}
 */
export async function getTokenBalance(userPublicKey, mintAddress) {
  const connection = getSolanaConnection();
  const publicKey = typeof userPublicKey === 'string' ? new PublicKey(userPublicKey) : userPublicKey;
  const mintPublicKey = new PublicKey(mintAddress);
  
  try {
    // Check both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID
    const tokenAccounts = await Promise.all([
      connection.getParsedTokenAccountsByOwner(publicKey, {
        mint: mintPublicKey,
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(publicKey, {
        mint: mintPublicKey,
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);
    
    // Combine results from both token programs
    const allTokenAccounts = [
      ...tokenAccounts[0].value,
      ...tokenAccounts[1].value,
    ];
    
    if (allTokenAccounts.length === 0) {
      return null; // No token account found for this mint
    }
    
    // Get the first token account (usually there's only one per mint per user)
    const tokenAccount = allTokenAccounts[0];
    const accountInfo = tokenAccount.account.data.parsed.info;
    
    return {
      mint: mintAddress,
      balance: parseInt(accountInfo.tokenAmount.amount),
      decimals: accountInfo.tokenAmount.decimals,
      uiAmount: accountInfo.tokenAmount.uiAmount,
      tokenAccount: tokenAccount.pubkey.toString(),
    };
  } catch (error) {
    logger.error('Failed to get token balance', {
      error: error.message,
      mint: mintAddress,
      owner: publicKey.toBase58(),
    });
    throw error;
  }
}

/**
 * Get formatted token balance (converts from raw amount to human-readable)
 * @param {PublicKey|string} userPublicKey - User's wallet public key
 * @param {string} mintAddress - Token mint address
 * @returns {Promise<number|null>}
 */
export async function getFormattedTokenBalance(userPublicKey, mintAddress) {
  try {
    const tokenBalance = await getTokenBalance(userPublicKey, mintAddress);
    
    if (!tokenBalance) {
      return null;
    }
    
    // Convert from raw amount to human-readable amount
    return tokenBalance.balance / Math.pow(10, tokenBalance.decimals);
  } catch (error) {
    logger.error('Failed to get formatted token balance', {
      error: error.message,
      mint: mintAddress,
    });
    return null;
  }
}

/**
 * Get all SPL tokens for a wallet (with balances and metadata)
 * @param {PublicKey|string} publicKey - User's wallet public key
 * @returns {Promise<Array<{address: string, decimals: number, logoURI: string, name: string, symbol: string, balance: number, formattedBalance: number}>>}
 */
export async function getTokens(publicKey) {
  const connection = getSolanaConnection();
  const userPublicKey = typeof publicKey === 'string' ? new PublicKey(publicKey) : publicKey;
  
  try {
    // Fetch token accounts from both programs
    const tokenResponse = await connection.getParsedTokenAccountsByOwner(
      userPublicKey,
      { programId: TOKEN_PROGRAM_ID },
      'processed'
    );
    
    const tokenResponse2022 = await connection.getParsedTokenAccountsByOwner(
      userPublicKey,
      { programId: TOKEN_2022_PROGRAM_ID },
      'processed'
    );
    
    // Combine and filter accounts with non-zero balance
    const accounts = tokenResponse.value
      .concat(tokenResponse2022.value)
      .map((data) => data.account.data.parsed.info)
      .filter((account) => {
        const balance = parseFloat(account.tokenAmount.amount);
        return balance > 0; // Only include tokens with non-zero balance
      });
    
    // Import getTokenMetadataWithCache dynamically to avoid circular dependency
    const { getTokenMetadataWithCache } = await import('./token-metadata.js');
    
    // Fetch metadata for all tokens
    const metaDataPromises = accounts.map((account) => {
      return getTokenMetadataWithCache(account.mint);
    });
    
    const metadataResults = await Promise.all(metaDataPromises);
    
    // Build token array with balances
    const tokenArray = metadataResults.map((token, i) => {
      const account = accounts[i];
      const { decimals, icon: logoURI, name, symbol, id: address } = token;
      
      return {
        address: address || account.mint,
        decimals: decimals || account.tokenAmount.decimals,
        logoURI: logoURI || '',
        name: name || 'Unknown',
        symbol: symbol || 'UNKNOWN',
        balance: parseFloat(account.tokenAmount.amount),
        formattedBalance: parseFloat(account.tokenAmount.uiAmount || 0),
      };
    });
    
    // Add SOL to the beginning (native balance)
    const solBalance = await getSOLBalance(userPublicKey);
    const { getTokenMetadataWithCache: getMetadata } = await import('./token-metadata.js');
    const solInfo = await getMetadata('So11111111111111111111111111111111111111112');
    
    tokenArray.unshift({
      address: solInfo.id || 'So11111111111111111111111111111111111111112',
      decimals: 9,
      logoURI: solInfo.icon || 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      name: 'SOL',
      symbol: 'SOL',
      balance: solBalance.lamports,
      formattedBalance: solBalance.sol,
    });
    
    return tokenArray;
  } catch (error) {
    logger.error('Failed to get tokens', {
      error: error.message,
      owner: userPublicKey.toBase58(),
    });
    throw error;
  }
}


