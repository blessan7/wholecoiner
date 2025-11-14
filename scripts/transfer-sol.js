// Script to transfer SOL between wallets
// Usage:
//   SENDER_SECRET_KEY=<base64_or_json_secret> node scripts/transfer-sol.js [amountSol] [recipientAddress]
//
// Defaults:
//   amountSol: 0.25
//   recipientAddress: Dh7opZYS4KVoUanTrfgwDDitLBmp7jVvKrjq4FwBqggr

import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { getSolanaConnection } from '../lib/solana.js';

const DEFAULT_AMOUNT_SOL = 0.25;
const DEFAULT_RECIPIENT = 'Dh7opZYS4KVoUanTrfgwDDitLBmp7jVvKrjq4FwBqggr';
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
    throw new Error(
      `Secret key must be a base64 string of 64 bytes. Received length: ${buffer.length}`
    );
  }
  return Uint8Array.from(buffer);
}

async function main() {
  const secret = process.env.SENDER_SECRET_KEY || process.env.APP_WALLET_PRIVATE_KEY;
  if (!secret) {
    throw new Error(
      'Missing secret key. Set SENDER_SECRET_KEY (preferred) or APP_WALLET_PRIVATE_KEY as base64 or JSON array.'
    );
  }

  const sender = Keypair.fromSecretKey(parseSecretKey(secret));
  if (sender.publicKey.toBase58() !== EXPECTED_SENDER) {
    throw new Error(
      `Loaded keypair does not match expected sender (${EXPECTED_SENDER}). Loaded: ${sender.publicKey.toBase58()}`
    );
  }

  const amountSol = parseFloat(process.argv[2] ?? `${DEFAULT_AMOUNT_SOL}`);
  if (Number.isNaN(amountSol) || amountSol <= 0) {
    throw new Error('Amount must be a positive number.');
  }

  const recipientAddress = process.argv[3] ?? DEFAULT_RECIPIENT;
  let recipient;
  try {
    recipient = new PublicKey(recipientAddress);
  } catch (error) {
    throw new Error(`Invalid recipient address: ${error.message}`);
  }

  const connection = getSolanaConnection();

  console.log('🔄 Preparing transfer...');
  console.log(`  RPC: ${connection.rpcEndpoint}`);
  console.log(`  From: ${sender.publicKey.toBase58()}`);
  console.log(`  To:   ${recipient.toBase58()}`);
  console.log(`  Amount: ${amountSol} SOL`);

  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);
  if (lamports <= 0) {
    throw new Error('Computed lamports is zero. Increase amount.');
  }

  const recentBalance = await connection.getBalance(sender.publicKey);
  console.log(`  Sender balance: ${(recentBalance / LAMPORTS_PER_SOL).toFixed(6)} SOL`);
  if (recentBalance < lamports) {
    throw new Error('Insufficient balance for requested transfer.');
  }

  const transferIx = SystemProgram.transfer({
    fromPubkey: sender.publicKey,
    toPubkey: recipient,
    lamports,
  });

  const transaction = new Transaction().add(transferIx);

  console.log('🖋️  Signing and sending transaction...');
  const signature = await sendAndConfirmTransaction(connection, transaction, [sender], {
    commitment: 'confirmed',
  });

  console.log('✅ Transfer confirmed');
  console.log(`  Signature: ${signature}`);
  console.log(`  Explorer: https://solscan.io/tx/${signature}`);
}

main().catch((error) => {
  console.error('❌ Transfer failed:', error.message ?? error);
  process.exit(1);
});

