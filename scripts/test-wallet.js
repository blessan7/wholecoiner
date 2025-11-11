// Test wallet loading
import { getAppWallet, getAppWalletAddress } from '../lib/solana.js';

process.env.APP_WALLET_PRIVATE_KEY = 'kCc7fwSkj3jg9cl/0ePKWjuKB7Y9mIDUVE8dCaLWEGXwRzqPaKzXPNscdOD11CyWATB6KCn3FqZuxmgJV1wX3g==';

try {
  const wallet = getAppWallet();
  const address = getAppWalletAddress();
  console.log('✅ Wallet loaded successfully!');
  console.log('📍 Public Address:', address);
  console.log('\n💡 This is your wallet address for funding on devnet');
  console.log(`   solana airdrop 10 ${address} --url devnet`);
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
