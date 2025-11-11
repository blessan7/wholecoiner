/**
 * Transfer USDC from current token account to ATA
 * Usage: SOLANA_RPC_URL=https://api.devnet.solana.com node scripts/transfer-usdc-to-ata.js
 */

import { PublicKey, Transaction } from '@solana/web3.js';
import { 
  createTransferInstruction,
  getAccount,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID 
} from '@solana/spl-token';
import { getSolanaConnection, getAppWallet, getAppWalletAddress } from '../lib/solana.js';
import { getUsdcMint, getNetwork } from '../lib/tokens.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

dotenv.config({ path: join(rootDir, '.env.local') });
dotenv.config({ path: join(rootDir, '.env') });

// Token account where USDC currently is
const SOURCE_TOKEN_ACCOUNT = 'HYXza34u8RahYc2mr9Zhxx8XZSGHjQDUDrBuYoufaQYR';

async function transferUSDCToATA() {
  try {
    const connection = getSolanaConnection();
    const network = getNetwork();
    const appWallet = getAppWallet();
    const appWalletAddress = getAppWalletAddress();
    const usdcMintInfo = getUsdcMint();

    if (network !== 'devnet') {
      console.error('❌ This script only works on devnet');
      process.exit(1);
    }

    const walletPubkey = appWallet.publicKey;
    const sourceTokenAccount = new PublicKey(SOURCE_TOKEN_ACCOUNT);

    // First, get the source account to find out which mint it uses
    console.log('📊 Checking source account...');
    const sourceAccount = await getAccount(connection, sourceTokenAccount, 'confirmed');
    const sourceMint = sourceAccount.mint;
    const balance = sourceAccount.amount;
    
    // Get decimals from the source account's mint (might be different from expected USDC)
    const mintInfo = await connection.getParsedAccountInfo(sourceMint);
    let decimals = 6; // Default to 6 for USDC
    if (mintInfo.value && mintInfo.value.data.parsed) {
      decimals = mintInfo.value.data.parsed.info.decimals;
    }
    
    const balanceUsdc = Number(balance) / Math.pow(10, decimals);
    
    console.log(`   Balance: ${balanceUsdc.toFixed(6)} tokens`);
    console.log(`   Source Mint: ${sourceMint.toString()}`);
    console.log(`   Source Owner: ${sourceAccount.owner.toString()}\n`);

    if (sourceAccount.owner.toString() !== walletPubkey.toString()) {
      console.error(`❌ Error: Source account owner (${sourceAccount.owner.toString()}) does not match wallet (${walletPubkey.toString()})`);
      process.exit(1);
    }

    if (balance === BigInt(0)) {
      console.log('⚠️  Source account has no tokens to transfer.\n');
      process.exit(0);
    }

    // Compute the ATA address using the actual mint from the source account
    const targetATA = await getAssociatedTokenAddress(
      sourceMint,
      walletPubkey,
      false, // allowOwnerOffCurve
      TOKEN_PROGRAM_ID
    );

    console.log('🔄 Transferring tokens to ATA\n');
    console.log('============================================================');
    console.log(`📍 App Wallet: ${appWalletAddress}`);
    console.log(`📤 Source Token Account: ${SOURCE_TOKEN_ACCOUNT}`);
    console.log(`📥 Target ATA: ${targetATA.toString()}`);
    console.log(`🪙 Mint: ${sourceMint.toString()}`);
    console.log(`💰 Amount: ${balanceUsdc.toFixed(6)} tokens`);
    console.log('============================================================\n');

    // Check if target ATA exists, create if needed
    let targetAccountExists = false;
    try {
      await getAccount(connection, targetATA, 'confirmed');
      targetAccountExists = true;
      console.log('✅ Target ATA exists\n');
    } catch (error) {
      console.log('⚠️  Target ATA does not exist. Creating it first...\n');
      
      // Create transaction to create ATA and transfer
      const transaction = new Transaction();

      // First create ATA
      const createATAInstruction = createAssociatedTokenAccountInstruction(
        walletPubkey, // payer
        targetATA,    // ata
        walletPubkey, // owner
        sourceMint,   // mint (use source account's mint)
        TOKEN_PROGRAM_ID
      );
      transaction.add(createATAInstruction);

      // Then transfer tokens
      const transferInstruction = createTransferInstruction(
        sourceTokenAccount,
        targetATA,
        walletPubkey, // owner of source account
        balance,      // transfer full balance
        [],
        TOKEN_PROGRAM_ID
      );
      transaction.add(transferInstruction);

      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = walletPubkey;

      // Sign and send
      transaction.sign(appWallet);

      console.log('📤 Sending transaction (create ATA + transfer)...\n');
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      console.log(`✅ Transaction sent: ${signature}`);
      console.log(`   Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet\n`);

      // Wait for confirmation
      console.log('⏳ Waiting for confirmation...\n');
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        console.error('❌ Transaction failed:', confirmation.value.err);
        process.exit(1);
      }

      console.log('✅ Transaction confirmed!');
      console.log(`✅ Transferred ${balanceUsdc.toFixed(6)} USDC to ATA\n`);
      return;
    }

    // Target ATA exists, just transfer
    const transaction = new Transaction();

    const transferInstruction = createTransferInstruction(
      sourceTokenAccount,
      targetATA,
      walletPubkey, // owner of source account
      balance,      // transfer full balance
      [],
      TOKEN_PROGRAM_ID
    );
    transaction.add(transferInstruction);

    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = walletPubkey;

    // Sign and send
    transaction.sign(appWallet);

    console.log('📤 Sending transfer transaction...\n');
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`✅ Transaction sent: ${signature}`);
    console.log(`   Explorer: https://explorer.solana.com/tx/${signature}?cluster=devnet\n`);

    // Wait for confirmation
    console.log('⏳ Waiting for confirmation...\n');
    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      'confirmed'
    );

    if (confirmation.value.err) {
      console.error('❌ Transaction failed:', confirmation.value.err);
      process.exit(1);
    }

    console.log('✅ Transaction confirmed!');
    console.log(`✅ Transferred ${balanceUsdc.toFixed(6)} USDC to ATA\n`);
    console.log('💡 Run the setup script again to verify the balance in ATA:\n');
    console.log('   node scripts/setup-app-wallet-usdc.js\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
    process.exit(1);
  }
}

transferUSDCToATA();

