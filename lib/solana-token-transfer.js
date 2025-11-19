/**
 * Generic SPL token transfer utility
 * Supports transferring any SPL token (including wETH, wBTC, USDC, etc.)
 */

import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAccount,
} from '@solana/spl-token';
import { PublicKey, Transaction, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import { getSolanaConnection } from './solana.js';
import { logger } from './logger.js';

/**
 * Transfer SPL tokens from one wallet to another
 * @param {Keypair} fromWallet - Sender wallet keypair
 * @param {string} toPublicKey - Recipient public key (base58)
 * @param {string} mintAddress - Token mint address
 * @param {number|string} amount - Amount in human-readable units (e.g., 1.5 for 1.5 tokens)
 * @param {number} decimals - Token decimals (e.g., 8 for BTC/ETH, 6 for USDC)
 * @param {string} sourceTokenAccount - Optional: specific source token account address. If not provided, uses ATA.
 * @param {boolean} isToken2022 - Whether this is a Token-2022 program token (default: false)
 * @returns {Promise<{signature: string, recipientATA: string}>}
 */
export async function transferSPLToken(
  fromWallet,
  toPublicKey,
  mintAddress,
  amount,
  decimals,
  sourceTokenAccount = null,
  isToken2022 = false
) {
  try {
    const connection = getSolanaConnection();
    const mintPubkey = new PublicKey(mintAddress);
    const toPubkey = new PublicKey(toPublicKey);
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    logger.info('Starting SPL token transfer', {
      from: fromWallet.publicKey.toString(),
      to: toPublicKey,
      mintAddress: mintAddress,
      amount,
      decimals,
      isToken2022,
    });

    // Ensure recipient ATA exists
    const recipientATA = await getAssociatedTokenAddress(
      mintPubkey,
      toPubkey,
      false, // allowOwnerOffCurve
      tokenProgramId
    );

    let recipientATAExists = false;
    try {
      await getAccount(connection, recipientATA, 'confirmed');
      recipientATAExists = true;
      logger.info('Recipient ATA already exists', { recipientATA: recipientATA.toString() });
    } catch (error) {
      logger.info('Recipient ATA does not exist, will create', { recipientATA: recipientATA.toString() });
    }

    // Determine source token account
    let senderATA;
    let senderATAExists = false;

    if (sourceTokenAccount) {
      // Use the provided source token account
      senderATA = new PublicKey(sourceTokenAccount);
      try {
        await getAccount(connection, senderATA, 'confirmed');
        senderATAExists = true;
        logger.info('Using provided source token account', { sourceTokenAccount: sourceTokenAccount });
      } catch (error) {
        throw new Error(`Provided source token account does not exist: ${sourceTokenAccount}`);
      }
    } else {
      // Use sender's ATA
      senderATA = await getAssociatedTokenAddress(
        mintPubkey,
        fromWallet.publicKey,
        false, // allowOwnerOffCurve
        tokenProgramId
      );
      try {
        await getAccount(connection, senderATA, 'confirmed');
        senderATAExists = true;
        logger.info('Using sender ATA', { senderATA: senderATA.toString() });
      } catch (error) {
        throw new Error(`Sender token account does not exist. Please fund the wallet first.`);
      }
    }

    // Check sender balance and get actual decimals from the account
    const senderAccount = await getAccount(connection, senderATA, 'confirmed');
    
    // Verify the mint matches
    if (senderAccount.mint.toString() !== mintAddress) {
      throw new Error(
        `Source token account mint (${senderAccount.mint.toString()}) does not match requested mint (${mintAddress})`
      );
    }

    // Get actual decimals from the mint if not provided
    let actualDecimals = decimals;
    if (!actualDecimals) {
      try {
        const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
        if (mintInfo.value && mintInfo.value.data.parsed) {
          actualDecimals = mintInfo.value.data.parsed.info.decimals;
          logger.info('Fetched decimals from mint', { decimals: actualDecimals });
        }
      } catch (mintError) {
        logger.warn('Could not fetch mint decimals, using provided value', { error: mintError.message });
      }
    }

    // Convert amount to smallest units
    const amountInSmallestUnits = BigInt(Math.floor(Number(amount) * Math.pow(10, actualDecimals)));
    
    // Check balance
    const balance = senderAccount.amount;
    if (balance < amountInSmallestUnits) {
      const balanceHuman = Number(balance) / Math.pow(10, actualDecimals);
      throw new Error(
        `Insufficient balance. Required: ${amount}, Available: ${balanceHuman.toFixed(actualDecimals)}`
      );
    }

    logger.info('Balance verified', {
      required: amount,
      available: Number(balance) / Math.pow(10, actualDecimals),
      decimals: actualDecimals,
    });

    // Build transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    const instructions = [];

    // Add recipient ATA creation instruction if needed
    if (!recipientATAExists) {
      const createATAInstruction = createAssociatedTokenAccountInstruction(
        fromWallet.publicKey, // payer
        recipientATA,         // ata
        toPubkey,             // owner
        mintPubkey,           // mint
        tokenProgramId
      );
      instructions.push(createATAInstruction);
    }

    // Add transfer instruction
    const transferInstruction = createTransferInstruction(
      senderATA,              // source
      recipientATA,            // destination
      fromWallet.publicKey,    // owner
      amountInSmallestUnits,   // amount
      [],                      // multiSigners
      tokenProgramId
    );
    instructions.push(transferInstruction);

    // Create versioned transaction
    const messageV0 = new TransactionMessage({
      instructions,
      payerKey: fromWallet.publicKey,
      recentBlockhash: blockhash,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([fromWallet]);

    // Send transaction
    logger.info('Sending token transfer transaction', {
      from: fromWallet.publicKey.toString(),
      to: toPublicKey,
      mint: mintAddress,
      amount,
    });

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    logger.info('Token transfer transaction sent', { signature });

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
      logger.error('Token transfer transaction failed', {
        signature,
        error: confirmation.value.err,
      });
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    logger.info('Token transfer transaction confirmed', { signature });

    return {
      signature,
      recipientATA: recipientATA.toString(),
    };
  } catch (error) {
    logger.error('SPL token transfer failed', {
      error: error.message,
      toPublicKey,
      mintAddress,
      amount,
    });
    throw error;
  }
}

/**
 * Build an unsigned token transfer transaction
 * Useful for wallet signing flows
 * @param {string} fromAddress - Sender wallet address (base58)
 * @param {string} toAddress - Recipient wallet address (base58)
 * @param {string} mintAddress - Token mint address
 * @param {number|string} amount - Amount in human-readable units
 * @param {number} decimals - Token decimals
 * @param {string} sourceTokenAccount - Optional: specific source token account address
 * @param {boolean} isToken2022 - Whether this is a Token-2022 program token
 * @returns {Promise<{unsignedTransaction: string, recentBlockhash: string, lastValidBlockHeight: number, feeEstimateLamports: number|null}>}
 */
export async function buildUnsignedTokenTransfer({
  fromAddress,
  toAddress,
  mintAddress,
  amount,
  decimals,
  sourceTokenAccount = null,
  isToken2022 = false,
}) {
  try {
    const connection = getSolanaConnection();
    const mintPubkey = new PublicKey(mintAddress);
    const fromPubkey = new PublicKey(fromAddress);
    const toPubkey = new PublicKey(toAddress);
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    // Get recipient ATA
    const recipientATA = await getAssociatedTokenAddress(
      mintPubkey,
      toPubkey,
      false,
      tokenProgramId
    );

    // Check if recipient ATA exists
    let recipientATAExists = false;
    try {
      await getAccount(connection, recipientATA, 'confirmed');
      recipientATAExists = true;
    } catch {
      // ATA doesn't exist, will need to create it
    }

    // Determine source token account
    let senderATA;
    if (sourceTokenAccount) {
      senderATA = new PublicKey(sourceTokenAccount);
    } else {
      senderATA = await getAssociatedTokenAddress(
        mintPubkey,
        fromPubkey,
        false,
        tokenProgramId
      );
    }

    // Verify source account exists and get balance
    const senderAccount = await getAccount(connection, senderATA, 'confirmed');
    
    // Get actual decimals if not provided
    let actualDecimals = decimals;
    if (!actualDecimals) {
      try {
        const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
        if (mintInfo.value && mintInfo.value.data.parsed) {
          actualDecimals = mintInfo.value.data.parsed.info.decimals;
        }
      } catch {
        // Use provided decimals
      }
    }

    // Convert amount to smallest units
    const amountInSmallestUnits = BigInt(Math.floor(Number(amount) * Math.pow(10, actualDecimals)));

    // Check balance
    if (senderAccount.amount < amountInSmallestUnits) {
      const balanceHuman = Number(senderAccount.amount) / Math.pow(10, actualDecimals);
      throw new Error(
        `Insufficient balance. Required: ${amount}, Available: ${balanceHuman.toFixed(actualDecimals)}`
      );
    }

    // Build instructions
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const instructions = [];

    // Add recipient ATA creation if needed
    if (!recipientATAExists) {
      const createATAInstruction = createAssociatedTokenAccountInstruction(
        fromPubkey,      // payer
        recipientATA,    // ata
        toPubkey,        // owner
        mintPubkey,      // mint
        tokenProgramId
      );
      instructions.push(createATAInstruction);
    }

    // Add transfer instruction
    const transferInstruction = createTransferInstruction(
      senderATA,
      recipientATA,
      fromPubkey,
      amountInSmallestUnits,
      [],
      tokenProgramId
    );
    instructions.push(transferInstruction);

    // Create versioned transaction
    const messageV0 = new TransactionMessage({
      instructions,
      payerKey: fromPubkey,
      recentBlockhash: blockhash,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(messageV0);
    const unsignedTransaction = Buffer.from(transaction.serialize()).toString('base64');

    // Estimate fee
    let feeEstimateLamports = null;
    try {
      const feeResult = await connection.getFeeForMessage(messageV0, 'confirmed');
      feeEstimateLamports = feeResult.value ?? null;
    } catch {
      feeEstimateLamports = null;
    }

    return {
      unsignedTransaction,
      recentBlockhash: blockhash,
      lastValidBlockHeight,
      feeEstimateLamports,
    };
  } catch (error) {
    logger.error('Failed to build unsigned token transfer', {
      error: error.message,
      fromAddress,
      toAddress,
      mintAddress,
    });
    throw error;
  }
}

