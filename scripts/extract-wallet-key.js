#!/usr/bin/env node
/**
 * Helper script to extract wallet key from app-wallet.json
 * Usage: node scripts/extract-wallet-key.js [path-to-wallet.json]
 */

const fs = require('fs');
const path = require('path');
const { Keypair } = require('@solana/web3.js');

const walletPath = process.argv[2] || 'prisma/app-wallet.json';

if (!fs.existsSync(walletPath)) {
  console.error(`❌ Wallet file not found: ${walletPath}`);
  process.exit(1);
}

try {
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  const secretKeyArray = Array.isArray(walletData) ? walletData : walletData.secretKey;
  
  if (!secretKeyArray || secretKeyArray.length !== 64) {
    throw new Error('Invalid secret key format: expected 64 bytes');
  }

  const secretKeyBuffer = Buffer.from(secretKeyArray);
  const base64Key = secretKeyBuffer.toString('base64');
  
  // Get public key
  const keypair = Keypair.fromSecretKey(secretKeyBuffer);
  const publicKey = keypair.publicKey.toBase58();

  console.log('\n✅ Wallet Key Extracted Successfully!\n');
  console.log('📝 Add this to your .env.local file:');
  console.log(`APP_WALLET_PRIVATE_KEY="${base64Key}"\n`);
  console.log('📍 Public Address:', publicKey);
  console.log('\n💡 To fund this wallet on devnet:');
  console.log(`   solana airdrop 10 ${publicKey} --url devnet\n`);
  console.log('⚠️  Remember to:');
  console.log('   1. Add app-wallet.json to .gitignore');
  console.log('   2. Never commit this key to git');
  console.log('   3. Delete app-wallet.json after extraction\n');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  if (error.code === 'MODULE_NOT_FOUND') {
    console.error('\n💡 Install @solana/web3.js first:');
    console.error('   npm install @solana/web3.js\n');
  }
  process.exit(1);
}



