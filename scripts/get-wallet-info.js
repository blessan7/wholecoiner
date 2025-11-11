const fs = require('fs');
const { Keypair } = require('@solana/web3.js');

// Read wallet file
const key = JSON.parse(fs.readFileSync('prisma/app-wallet.json', 'utf8'));
const secretKeyBuffer = Buffer.from(key);
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



