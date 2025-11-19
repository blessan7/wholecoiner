/**
 * Transfer ETH and BTC tokens from one wallet to another
 * 
 * Usage:
 *   SENDER_SECRET_KEY=<base64_or_json_secret> node scripts/transfer-eth-btc.js [destinationAddress]
 * 
 * Defaults:
 *   destinationAddress: Dh7opZYS4KVoUanTrfgwDDitLBmp7jVvKrjq4FwBqggr
 * 
 * This script will:
 *   1. Check the source wallet for ETH and BTC token accounts
 *   2. Transfer all available ETH and BTC to the destination wallet
 */

import { PublicKey } from '@solana/web3.js';
import { getAccount, getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getSolanaConnection, getAppWallet } from '../lib/solana.js';
import { getTokenMint } from '../lib/tokens.js';
import { transferSPLToken } from '../lib/solana-token-transfer.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

dotenv.config({ path: join(rootDir, '.env.local') });
dotenv.config({ path: join(rootDir, '.env') });

const DEFAULT_DESTINATION = 'Dh7opZYS4KVoUanTrfgwDDitLBmp7jVvKrjq4FwBqggr';
const EXPECTED_SENDER = 'QjXUoX6SZEFUtMJKM2zwCRrC9D8FyGVWco7Hgpdh3YX';

function parseSecretKey(secret) {
  const trimmed = secret.trim();

  // JSON array format
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        throw new Error('Secret key JSON must be an array');
      }
      return Uint8Array.from(parsed);
    } catch (error) {
      throw new Error(`Failed to parse secret key JSON: ${error.message}`);
    }
  }

  // Base64 format
  const buffer = Buffer.from(trimmed, 'base64');
  if (buffer.length !== 64) {
    throw new Error(`Invalid secret key length: expected 64 bytes, got ${buffer.length}`);
  }
  return Uint8Array.from(buffer);
}

async function getTokenAccountBalance(connection, walletPubkey, mintAddress) {
  try {
    const mintPubkey = new PublicKey(mintAddress);
    const ata = await getAssociatedTokenAddress(
      mintPubkey,
      walletPubkey,
      false,
      TOKEN_PROGRAM_ID
    );

    const account = await getAccount(connection, ata, 'confirmed');
    return {
      exists: true,
      address: ata.toString(),
      balance: account.amount,
      mint: account.mint.toString(),
    };
  } catch (error) {
    if (error.message.includes('could not find account')) {
      return { exists: false, balance: BigInt(0) };
    }
    throw error;
  }
}

async function main() {
  const secret = process.env.SENDER_SECRET_KEY || process.env.APP_WALLET_PRIVATE_KEY;
  if (!secret) {
    throw new Error(
      'Missing secret key. Set SENDER_SECRET_KEY (preferred) or APP_WALLET_PRIVATE_KEY as base64 or JSON array.'
    );
  }

  // Try to use app wallet if available, otherwise parse the secret
  let sender;
  try {
    sender = getAppWallet();
    if (sender.publicKey.toBase58() !== EXPECTED_SENDER) {
      console.log(`⚠️  App wallet address (${sender.publicKey.toBase58()}) does not match expected sender.`);
      console.log(`   Using provided secret key instead...\n`);
      throw new Error('Address mismatch');
    }
  } catch {
    // Parse the secret key manually
    const { Keypair } = await import('@solana/web3.js');
    sender = Keypair.fromSecretKey(parseSecretKey(secret));
  }

  if (sender.publicKey.toBase58() !== EXPECTED_SENDER) {
    throw new Error(
      `Loaded keypair does not match expected sender (${EXPECTED_SENDER}). Loaded: ${sender.publicKey.toBase58()}`
    );
  }

  const destinationAddress = process.argv[2] ?? DEFAULT_DESTINATION;
  let destination;
  try {
    destination = new PublicKey(destinationAddress);
  } catch (error) {
    throw new Error(`Invalid destination address: ${error.message}`);
  }

  const connection = getSolanaConnection();

  console.log('🔄 Checking wallet balances...\n');
  console.log(`  Source: ${sender.publicKey.toBase58()}`);
  console.log(`  Destination: ${destination.toBase58()}\n`);

  // Get token mint info
  let ethMint, btcMint;
  try {
    ethMint = getTokenMint('ETH');
    btcMint = getTokenMint('BTC');
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    console.error('   Make sure you are on mainnet (ETH and BTC are not supported on devnet)');
    process.exit(1);
  }

  // Check ETH balance
  console.log('📊 Checking ETH balance...');
  const ethAccount = await getTokenAccountBalance(connection, sender.publicKey, ethMint.mint);
  const ethBalance = ethAccount.exists 
    ? Number(ethAccount.balance) / Math.pow(10, ethMint.decimals)
    : 0;
  console.log(`   ETH Balance: ${ethBalance.toFixed(ethMint.decimals)} ETH`);
  if (ethAccount.exists) {
    console.log(`   Token Account: ${ethAccount.address}\n`);
  } else {
    console.log(`   No ETH token account found\n`);
  }

  // Check BTC balance
  console.log('📊 Checking BTC balance...');
  const btcAccount = await getTokenAccountBalance(connection, sender.publicKey, btcMint.mint);
  const btcBalance = btcAccount.exists
    ? Number(btcAccount.balance) / Math.pow(10, btcMint.decimals)
    : 0;
  console.log(`   BTC Balance: ${btcBalance.toFixed(btcMint.decimals)} BTC`);
  if (btcAccount.exists) {
    console.log(`   Token Account: ${btcAccount.address}\n`);
  } else {
    console.log(`   No BTC token account found\n`);
  }

  if (ethBalance === 0 && btcBalance === 0) {
    console.log('⚠️  No ETH or BTC tokens found in the wallet. Nothing to transfer.\n');
    process.exit(0);
  }

  // Transfer ETH if available
  if (ethBalance > 0) {
    console.log(`🔄 Transferring ${ethBalance.toFixed(ethMint.decimals)} ETH...`);
    try {
      const result = await transferSPLToken(
        sender,
        destination.toBase58(),
        ethMint.mint,
        ethBalance,
        ethMint.decimals,
        ethAccount.exists ? ethAccount.address : null
      );
      console.log(`✅ ETH transfer successful!`);
      console.log(`   Signature: ${result.signature}`);
      console.log(`   Explorer: https://explorer.solana.com/tx/${result.signature}\n`);
    } catch (error) {
      console.error(`❌ ETH transfer failed: ${error.message}\n`);
      throw error;
    }
  }

  // Transfer BTC if available
  if (btcBalance > 0) {
    console.log(`🔄 Transferring ${btcBalance.toFixed(btcMint.decimals)} BTC...`);
    try {
      const result = await transferSPLToken(
        sender,
        destination.toBase58(),
        btcMint.mint,
        btcBalance,
        btcMint.decimals,
        btcAccount.exists ? btcAccount.address : null
      );
      console.log(`✅ BTC transfer successful!`);
      console.log(`   Signature: ${result.signature}`);
      console.log(`   Explorer: https://explorer.solana.com/tx/${result.signature}\n`);
    } catch (error) {
      console.error(`❌ BTC transfer failed: ${error.message}\n`);
      throw error;
    }
  }

  console.log('✅ All transfers completed successfully!\n');
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

