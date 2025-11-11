/**
 * App wallet USDC setup utilities
 * Ensures app wallet has USDC ATA and provides setup helpers
 */

import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import { getSolanaConnection, getAppWallet, getAppWalletAddress, lamportsToSol } from './solana.js';
import { getUsdcMint, getNetwork } from './tokens.js';
import { logger } from './logger.js';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

/**
 * Ensure app wallet has USDC ATA and check balance
 * @returns {Promise<{ataExists: boolean, ataAddress: string, balance: bigint, balanceUsdc: number, needsCreation: boolean, instruction?: TransactionInstruction}>}
 */
export async function ensureAppWalletUSDCSetup() {
  try {
    const connection = getSolanaConnection();
    const network = getNetwork();
    const appWallet = getAppWallet();
    const appWalletAddress = getAppWalletAddress();
    const usdcMintInfo = getUsdcMint();
    
    if (network !== 'devnet') {
      logger.warn('App wallet USDC setup check only supported on devnet', { network });
      throw new Error('App wallet USDC setup is only supported on devnet');
    }

    const usdcMint = new PublicKey(usdcMintInfo.mint);
    const appWalletPubkey = appWallet.publicKey;

    // Get ATA address for app wallet
    const ataAddress = await getAssociatedTokenAddress(
      usdcMint,
      appWalletPubkey,
      false, // allowOwnerOffCurve
      TOKEN_PROGRAM_ID
    );

    // First, check ALL token accounts (not just the expected USDC mint)
    // This handles cases where tokens were sent with a different mint or to a non-ATA account
    let actualBalance = BigInt(0);
    let actualBalanceUsdc = 0;
    let tokenAccountAddress = null;
    let foundMint = null;

    try {
      // Check all token accounts (without mint filter) to find any USDC-like tokens
      const allTokenAccounts = await connection.getParsedTokenAccountsByOwner(
        appWalletPubkey,
        {
          programId: TOKEN_PROGRAM_ID,
        },
        'confirmed'
      );

      // Also check TOKEN_2022 program
      let token2022Accounts = { value: [] };
      try {
        const { TOKEN_2022_PROGRAM_ID } = await import('@solana/spl-token');
        token2022Accounts = await connection.getParsedTokenAccountsByOwner(
          appWalletPubkey,
          {
            programId: TOKEN_2022_PROGRAM_ID,
          },
          'confirmed'
        );
      } catch (e) {
        // Token 2022 might not be available, that's ok
      }

      // Combine both token programs
      const allAccounts = [...allTokenAccounts.value, ...token2022Accounts.value];

      // Look for accounts matching the expected USDC mint first
      for (const tokenAccount of allAccounts) {
        const accountInfo = tokenAccount.account.data.parsed.info;
        const accountMint = accountInfo.mint;
        const balance = BigInt(accountInfo.tokenAmount.amount);
        
        if (balance > 0 && accountMint === usdcMint.toString()) {
          // Found tokens matching expected USDC mint
          actualBalance += balance;
          if (!tokenAccountAddress) {
            tokenAccountAddress = tokenAccount.pubkey.toString();
            foundMint = accountMint;
          }
        }
      }

      // If no balance found with expected mint, check if there are any tokens at all
      if (actualBalance === BigInt(0)) {
        for (const tokenAccount of allAccounts) {
          const accountInfo = tokenAccount.account.data.parsed.info;
          const balance = BigInt(accountInfo.tokenAmount.amount);
          
          if (balance > 0) {
            // Found tokens but with different mint
            actualBalance += balance;
            const decimals = accountInfo.tokenAmount.decimals || usdcMintInfo.decimals;
            actualBalanceUsdc = Number(actualBalance) / Math.pow(10, decimals);
            if (!tokenAccountAddress) {
              tokenAccountAddress = tokenAccount.pubkey.toString();
              foundMint = accountInfo.mint;
            }
            logger.info('Found tokens with different mint than expected USDC', {
              foundMint: accountInfo.mint,
              expectedMint: usdcMint.toString(),
              balance: actualBalance.toString(),
              tokenAccount: tokenAccount.pubkey.toString(),
            });
            break; // Just use the first non-zero balance for now
          }
        }
      } else {
        // Balance found with expected mint
        actualBalanceUsdc = Number(actualBalance) / Math.pow(10, usdcMintInfo.decimals);
      }
    } catch (error) {
      logger.warn('Error checking all token accounts, falling back to ATA check', {
        error: error.message,
      });
    }

    // Check if ATA exists (even if balance is elsewhere, we need the ATA for transfers)
    try {
      const account = await getAccount(connection, ataAddress, 'confirmed');
      const balance = account.amount;
      const balanceUsdc = Number(balance) / Math.pow(10, usdcMintInfo.decimals);

      // Use the actual balance from all accounts if we found it, otherwise use ATA balance
      const finalBalance = actualBalance > BigInt(0) ? actualBalance : balance;
      const finalBalanceUsdc = actualBalanceUsdc > 0 ? actualBalanceUsdc : balanceUsdc;

      logger.info('App wallet USDC ATA exists', {
        ataAddress: ataAddress.toString(),
        ataBalance: balance.toString(),
        ataBalanceUsdc: balanceUsdc,
        actualTokenAccount: tokenAccountAddress,
        foundMint: foundMint,
        expectedMint: usdcMint.toString(),
        totalBalance: finalBalance.toString(),
        totalBalanceUsdc: finalBalanceUsdc,
        appWalletAddress,
      });

      return {
        ataExists: true,
        ataAddress: ataAddress.toString(),
        balance: finalBalance,
        balanceUsdc: finalBalanceUsdc,
        needsCreation: false,
        actualTokenAccount: tokenAccountAddress, // Where tokens actually are
        foundMint: foundMint || usdcMint.toString(), // Mint where tokens actually are
      };
    } catch (error) {
      // ATA doesn't exist, but we might still have tokens in another account
      if (actualBalance > BigInt(0)) {
        logger.info('App wallet has USDC but ATA does not exist', {
          ataAddress: ataAddress.toString(),
          actualTokenAccount: tokenAccountAddress,
          totalBalance: actualBalance.toString(),
          totalBalanceUsdc: actualBalanceUsdc,
          appWalletAddress,
        });

        // ATA needs to be created, but tokens exist elsewhere
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          appWalletPubkey, // payer
          ataAddress,      // ata
          appWalletPubkey, // owner
          usdcMint,        // mint
          TOKEN_PROGRAM_ID
        );

        return {
          ataExists: false,
          ataAddress: ataAddress.toString(),
          balance: actualBalance,
          balanceUsdc: actualBalanceUsdc,
          needsCreation: true,
          instruction: createATAInstruction,
          actualTokenAccount: tokenAccountAddress,
          foundMint: foundMint || usdcMint.toString(), // Mint where tokens actually are
        };
      }

      // No tokens found anywhere, ATA doesn't exist
      logger.info('App wallet USDC ATA does not exist', {
        ataAddress: ataAddress.toString(),
        appWalletAddress,
      });

      const createATAInstruction = createAssociatedTokenAccountInstruction(
        appWalletPubkey, // payer
        ataAddress,      // ata
        appWalletPubkey, // owner
        usdcMint,        // mint
        TOKEN_PROGRAM_ID
      );

      return {
        ataExists: false,
        ataAddress: ataAddress.toString(),
        balance: BigInt(0),
        balanceUsdc: 0,
        needsCreation: true,
        instruction: createATAInstruction,
      };
    }
  } catch (error) {
    logger.error('Error checking app wallet USDC setup', {
      error: error.message,
      appWalletAddress: getAppWalletAddress(),
    });
    throw error;
  }
}

/**
 * Check if app wallet has enough SOL for transactions
 * @param {number} requiredSol - Required SOL amount (default: 0.1 SOL)
 * @returns {Promise<{hasEnough: boolean, balance: number, required: number}>}
 */
export async function checkAppWalletSolBalance(requiredSol = 0.1, retries = 3, retryDelay = 2000) {
  try {
    const connection = getSolanaConnection();
    const appWallet = getAppWallet();
    const appWalletAddress = appWallet.publicKey.toString();
    const requiredLamports = requiredSol * LAMPORTS_PER_SOL;
    
    // Try multiple times with delay to account for RPC sync delays
    for (let i = 0; i < retries; i++) {
      try {
        // Try getting balance with 'finalized' commitment first
        let balance = await connection.getBalance(appWallet.publicKey, 'finalized');
        
        // If balance is 0 and not last retry, try 'confirmed' as fallback
        if (balance === 0 && i < retries - 1) {
          balance = await connection.getBalance(appWallet.publicKey, 'confirmed');
        }
        
        const balanceSol = balance / LAMPORTS_PER_SOL;
        
        logger.info('Checked app wallet SOL balance', {
          address: appWalletAddress,
          balance: balanceSol,
          required: requiredSol,
          attempt: i + 1,
          rpcUrl: process.env.SOLANA_RPC_URL || 'default',
        });
        
        // If we found a balance or this is the last retry, return result
        if (balance > 0 || i === retries - 1) {
          return {
            hasEnough: balance >= requiredLamports,
            balance: balanceSol,
            required: requiredSol,
            balanceLamports: balance,
          };
        }
        
        // Wait before retry (except on last iteration)
        if (i < retries - 1) {
          logger.info('Balance is 0, waiting for RPC sync...', {
            attempt: i + 1,
            retryDelay,
          });
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      } catch (error) {
        // On error, log and retry if not last attempt
        if (i === retries - 1) {
          throw error;
        }
        logger.warn('Error checking balance, retrying...', {
          attempt: i + 1,
          error: error.message,
        });
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
    
    // Should not reach here, but return 0 balance result if we do
    return {
      hasEnough: false,
      balance: 0,
      required: requiredSol,
      balanceLamports: BigInt(0),
    };
  } catch (error) {
    logger.error('Failed to check app wallet SOL balance', { 
      error: error.message,
      address: getAppWalletAddress(),
    });
    throw error;
  }
}

/**
 * Create app wallet USDC ATA if it doesn't exist
 * @returns {Promise<{signature: string, ataAddress: string, wasCreated: boolean}>}
 */
export async function createAppWalletUSDCATA() {
  try {
    const connection = getSolanaConnection();
    const network = getNetwork();
    
    if (network !== 'devnet') {
      throw new Error('App wallet USDC ATA creation is only supported on devnet');
    }

    // Check SOL balance first
    const solBalance = await checkAppWalletSolBalance(0.01); // Need at least 0.01 SOL for fees
    if (!solBalance.hasEnough) {
      const appWalletAddress = getAppWalletAddress();
      throw new Error(
        `Insufficient SOL balance. Required: ${solBalance.required} SOL, Available: ${solBalance.balance.toFixed(6)} SOL. ` +
        `Please fund your app wallet with SOL first using: ` +
        `solana airdrop 1 ${appWalletAddress} --url devnet ` +
        `or visit https://faucet.solana.com/`
      );
    }

    const setup = await ensureAppWalletUSDCSetup();
    
    if (!setup.needsCreation) {
      logger.info('App wallet USDC ATA already exists', {
        ataAddress: setup.ataAddress,
        balanceUsdc: setup.balanceUsdc,
      });
      return {
        signature: null,
        ataAddress: setup.ataAddress,
        wasCreated: false,
      };
    }

    const appWallet = getAppWallet();
    const transaction = new Transaction();

    // Add ATA creation instruction
    transaction.add(setup.instruction);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = appWallet.publicKey;

    // Sign transaction
    transaction.sign(appWallet);

    // Send transaction
    logger.info('Creating app wallet USDC ATA', {
      ataAddress: setup.ataAddress,
    });

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    logger.info('App wallet USDC ATA creation transaction sent', { signature });

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      'confirmed'
    );

    if (confirmation.value.err) {
      logger.error('App wallet USDC ATA creation failed', {
        signature,
        error: confirmation.value.err,
      });
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    logger.info('App wallet USDC ATA created successfully', {
      signature,
      ataAddress: setup.ataAddress,
    });

    return {
      signature,
      ataAddress: setup.ataAddress,
      wasCreated: true,
    };
  } catch (error) {
    logger.error('Failed to create app wallet USDC ATA', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Get app wallet USDC balance
 * @returns {Promise<{balance: bigint, balanceUsdc: number}>}
 */
export async function getAppWalletUSDCBalance() {
  try {
    const setup = await ensureAppWalletUSDCSetup();
    
    if (!setup.ataExists) {
      return {
        balance: BigInt(0),
        balanceUsdc: 0,
      };
    }

    return {
      balance: setup.balance,
      balanceUsdc: setup.balanceUsdc,
    };
  } catch (error) {
    logger.error('Failed to get app wallet USDC balance', {
      error: error.message,
    });
    throw error;
  }
}

