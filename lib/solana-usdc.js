/**
 * Solana USDC utilities for token transfers and ATA management
 */

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token';
import { PublicKey, Transaction } from '@solana/web3.js';
import { getSolanaConnection, getAppWallet } from './solana.js';
import { getUsdcMint } from './tokens.js';
import { logger } from './logger.js';

/**
 * Ensure Associated Token Account (ATA) exists for a user
 * @param {string} mintAddress - Token mint address
 * @param {string} userPublicKey - User's wallet public key (base58)
 * @param {Keypair} payer - Keypair to pay for ATA creation (usually app wallet)
 * @returns {Promise<{ataAddress: string, wasCreated: boolean, instruction?: TransactionInstruction}>}
 */
export async function ensureATA(mintAddress, userPublicKey, payer = null) {
  try {
    const connection = getSolanaConnection();
    const mintPubkey = new PublicKey(mintAddress);
    const userPubkey = new PublicKey(userPublicKey);
    const payerKeypair = payer || getAppWallet();
    const payerPubkey = payerKeypair.publicKey;

    // Get ATA address
    const ataAddress = await getAssociatedTokenAddress(
      mintPubkey,
      userPubkey,
      false, // allowOwnerOffCurve
      TOKEN_PROGRAM_ID
    );

    // Check if ATA exists
    try {
      await getAccount(connection, ataAddress, 'confirmed');
      logger.info('ATA already exists', { 
        mintAddress, 
        userPublicKey, 
        ataAddress: ataAddress.toString() 
      });
      return {
        ataAddress: ataAddress.toString(),
        wasCreated: false,
      };
    } catch (error) {
      // ATA doesn't exist, create instruction
      logger.info('ATA does not exist, creating instruction', { 
        mintAddress, 
        userPublicKey, 
        ataAddress: ataAddress.toString() 
      });

      const createATAInstruction = createAssociatedTokenAccountInstruction(
        payerPubkey, // payer
        ataAddress,  // ata
        userPubkey,  // owner
        mintPubkey,  // mint
        TOKEN_PROGRAM_ID
      );

      return {
        ataAddress: ataAddress.toString(),
        wasCreated: true,
        instruction: createATAInstruction,
      };
    }
  } catch (error) {
    logger.error('Error ensuring ATA', { 
      error: error.message, 
      mintAddress, 
      userPublicKey 
    });
    throw error;
  }
}

/**
 * Transfer USDC tokens from one wallet to another
 * @param {Keypair} fromWallet - Sender wallet keypair (usually app wallet)
 * @param {string} toPublicKey - Recipient public key (base58)
 * @param {number} amountUsdc - Amount in USDC (human-readable, e.g., 100 for 100 USDC)
 * @param {string} mintAddress - Optional: USDC mint address. If not provided, uses network default.
 * @returns {Promise<{signature: string, ataAddress: string}>}
 */
export async function transferUSDC(fromWallet, toPublicKey, amountUsdc, mintAddress = null, sourceTokenAccount = null) {
  try {
    const connection = getSolanaConnection();
    const usdcMintInfo = getUsdcMint();
    const usdcMint = mintAddress ? new PublicKey(mintAddress) : new PublicKey(usdcMintInfo.mint);
    const decimals = usdcMintInfo.decimals;
    const toPubkey = new PublicKey(toPublicKey);

    logger.info('Starting USDC transfer', {
      from: fromWallet.publicKey.toString(),
      to: toPublicKey,
      amountUsdc,
      mintAddress: usdcMint.toString(),
    });

    // Ensure recipient ATA exists
    const recipientATAResult = await ensureATA(usdcMint.toString(), toPublicKey, fromWallet);
    const recipientATA = recipientATAResult.ataAddress;
    const createRecipientATAInstruction = recipientATAResult.instruction;

    // Use provided source token account, or ensure sender ATA exists
    let senderATA;
    let createSenderATAInstruction = null;
    let actualDecimals = decimals; // Declare outside so it's accessible later
    
    if (sourceTokenAccount) {
      // Use the provided source token account (where tokens actually are)
      senderATA = new PublicKey(sourceTokenAccount);
      logger.info('Using provided source token account', {
        sourceTokenAccount: sourceTokenAccount,
        amountUsdc,
      });
    } else {
      // Ensure sender ATA exists (auto-create if missing)
      const senderATAResult = await ensureATA(usdcMint.toString(), fromWallet.publicKey.toString(), fromWallet);
      senderATA = new PublicKey(senderATAResult.ataAddress);
      createSenderATAInstruction = senderATAResult.instruction;
    }

    // Check sender balance and get actual decimals from the account
    try {
      const senderAccount = await getAccount(connection, senderATA, 'confirmed');
      
      // Get actual decimals from the mint of this account
      try {
        const mintInfo = await connection.getParsedAccountInfo(senderAccount.mint);
        if (mintInfo.value && mintInfo.value.data.parsed) {
          actualDecimals = mintInfo.value.data.parsed.info.decimals;
          logger.info('Using actual mint decimals', {
            mint: senderAccount.mint.toString(),
            decimals: actualDecimals,
          });
        }
      } catch (mintError) {
        logger.warn('Could not fetch mint decimals, using default', {
          mint: senderAccount.mint.toString(),
          error: mintError.message,
        });
        // Continue with default decimals
      }
      
      // Account exists, check balance
      const balance = senderAccount.amount;
      const requiredAmount = BigInt(Math.floor(amountUsdc * Math.pow(10, actualDecimals)));
      
      if (balance < requiredAmount) {
        const balanceUsdc = Number(balance) / Math.pow(10, actualDecimals);
        throw new Error(
          `Sender has insufficient USDC balance. Required: ${amountUsdc} USDC, Available: ${balanceUsdc.toFixed(6)} USDC. ` +
          `Please fund the app wallet using the USDC faucet: https://usdcfaucet.com/`
        );
      }
      
      logger.info('Sender account balance verified', {
        senderAccount: senderATA.toString(),
        balanceUsdc: Number(balance) / Math.pow(10, actualDecimals),
        requiredUsdc: amountUsdc,
        decimals: actualDecimals,
      });
    } catch (error) {
      // If getAccount fails, the account doesn't exist yet
      if (error.message.includes('insufficient')) {
        // Balance error - rethrow it
        throw error;
      }
      
      // Account doesn't exist
      if (sourceTokenAccount) {
        throw new Error(
          `Provided source token account does not exist: ${sourceTokenAccount}`
        );
      }
      
      // ATA doesn't exist - if we're creating it, it will have zero balance
      if (createSenderATAInstruction) {
        logger.warn('Sender ATA does not exist and will be created, but will have zero balance', {
          senderATA: senderATA.toString(),
          amountUsdc,
        });
        throw new Error(
          `Sender USDC account does not exist. After creation, it will have zero balance. ` +
          `Please fund the app wallet first using the USDC faucet: https://usdcfaucet.com/ ` +
          `Then the account will be created automatically on first transfer.`
        );
      }
      
      // Unexpected error
      logger.error('Unexpected error checking sender account', { error: error.message });
      throw new Error(`Failed to check sender USDC account: ${error.message}`);
    }

    // Convert amount to smallest units using actual decimals
    const amountInSmallestUnits = BigInt(Math.floor(amountUsdc * Math.pow(10, actualDecimals)));

    // Create transaction
    const transaction = new Transaction();

    // Add sender ATA creation instruction if needed (shouldn't happen due to check above, but included for safety)
    if (createSenderATAInstruction) {
      transaction.add(createSenderATAInstruction);
    }

    // Add recipient ATA creation instruction if needed
    if (createRecipientATAInstruction) {
      transaction.add(createRecipientATAInstruction);
    }

    // Add transfer instruction
    const transferInstruction = createTransferInstruction(
      senderATA,                    // source
      new PublicKey(recipientATA),  // destination
      fromWallet.publicKey,         // owner
      amountInSmallestUnits,        // amount
      [],                           // multiSigners
      TOKEN_PROGRAM_ID
    );

    transaction.add(transferInstruction);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromWallet.publicKey;

    // Sign transaction
    transaction.sign(fromWallet);

    // Send transaction
    logger.info('Sending USDC transfer transaction', {
      signature: 'pending',
      from: fromWallet.publicKey.toString(),
      to: toPublicKey,
      amountUsdc,
    });

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    logger.info('USDC transfer transaction sent', { signature });

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
      logger.error('USDC transfer transaction failed', { 
        signature, 
        error: confirmation.value.err 
      });
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    logger.info('USDC transfer transaction confirmed', { signature });

    return {
      signature,
      ataAddress: recipientATA,
    };
  } catch (error) {
    logger.error('USDC transfer failed', { 
      error: error.message, 
      toPublicKey, 
      amountUsdc 
    });
    throw error;
  }
}

