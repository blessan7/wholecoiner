#!/usr/bin/env node
/**
 * Setup script for app wallet USDC configuration
 * Ensures app wallet has USDC ATA and provides faucet instructions
 * 
 * Usage: node scripts/setup-app-wallet-usdc.js
 */

// Load environment variables from .env.local or .env
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to load .env.local first, then .env
const envFiles = [
  join(__dirname, '..', '.env.local'),
  join(__dirname, '..', '.env'),
];

for (const envFile of envFiles) {
  if (existsSync(envFile)) {
    const envContent = readFileSync(envFile, 'utf-8');
    const lines = envContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Parse KEY="VALUE" or KEY=VALUE
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        
        // Only set if not already in process.env
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
    console.log(`📄 Loaded environment variables from ${envFile}`);
    break;
  }
}

import { 
  ensureAppWalletUSDCSetup, 
  createAppWalletUSDCATA,
  getAppWalletUSDCBalance,
  checkAppWalletSolBalance
} from '../lib/solana-usdc-wallet-setup.js';
import { getAppWalletAddress } from '../lib/solana.js';
import { getNetwork, getUsdcMint } from '../lib/tokens.js';

const USDC_FAUCET_URL = 'https://usdcfaucet.com/';

async function main() {
  console.log('\n🔧 App Wallet USDC Setup\n');
  console.log('=' .repeat(60));

  try {
    const network = getNetwork();
    if (network !== 'devnet') {
      console.error('❌ Error: This script only works on devnet');
      console.error(`   Current network: ${network}`);
      console.error('\n💡 To run on devnet, set the SOLANA_RPC_URL environment variable:');
      console.error('   SOLANA_RPC_URL=https://api.devnet.solana.com node scripts/setup-app-wallet-usdc.js');
      console.error('\n   Or use a Helius devnet endpoint:');
      console.error('   SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY node scripts/setup-app-wallet-usdc.js\n');
      process.exit(1);
    }

    const appWalletAddress = getAppWalletAddress();
    const usdcMint = getUsdcMint();

    console.log(`\n📍 App Wallet Address: ${appWalletAddress}`);
    console.log(`🏦 Network: ${network}`);
    console.log(`💰 USDC Mint: ${usdcMint.mint}`);
    console.log(`\n${'='.repeat(60)}\n`);

    // Check SOL balance first (with retries for RPC sync)
    console.log('💰 Checking SOL balance (may take a few seconds for RPC sync)...\n');
    console.log(`   RPC URL: ${process.env.SOLANA_RPC_URL || 'default'}`);
    console.log(`   Wallet: ${appWalletAddress}\n`);
    
    const solBalance = await checkAppWalletSolBalance(0.01, 3, 2000);
    console.log(`   Balance: ${solBalance.balance.toFixed(6)} SOL`);
    
    if (!solBalance.hasEnough) {
      console.log(`\n⚠️  Warning: Low SOL balance!`);
      console.log(`   Required: ${solBalance.required} SOL for transaction fees`);
      console.log(`   Available: ${solBalance.balance.toFixed(6)} SOL\n`);
      
      if (solBalance.balance === 0) {
        console.log('💡 Note: If you just airdropped SOL, wait a few seconds and run this script again.');
        console.log('   RPC endpoints may take a moment to sync.\n');
        console.log('📝 To fund your app wallet with SOL:');
        console.log(`   solana airdrop 1 ${appWalletAddress} --url devnet`);
        console.log(`   Or visit: https://faucet.solana.com/\n`);
        console.log('❌ Cannot proceed without SOL. Please fund your wallet first.\n');
        process.exit(1);
      } else {
        console.log('⚠️  Proceeding anyway, but transaction may fail if balance is too low.\n');
      }
    } else {
      console.log('✅ Sufficient SOL balance for transaction fees\n');
    }

    // Check current status
    console.log('📊 Checking app wallet USDC status...\n');
    const setup = await ensureAppWalletUSDCSetup();

    if (setup.ataExists) {
      console.log('✅ USDC ATA exists');
      console.log(`   ATA Address: ${setup.ataAddress}`);
      console.log(`   Balance: ${setup.balanceUsdc.toFixed(6)} USDC`);
      
      if (setup.balanceUsdc === 0) {
        console.log('\n⚠️  Warning: App wallet has no USDC balance!');
        console.log('\n📝 To fund your app wallet:');
        console.log(`   1. Visit: ${USDC_FAUCET_URL}`);
        console.log(`   2. Enter your wallet address: ${appWalletAddress}`);
        console.log(`   3. Request USDC tokens`);
        console.log(`   4. Wait for confirmation, then run this script again to verify\n`);
        process.exit(0);
      } else {
        console.log('\n✅ App wallet is ready to transfer USDC!\n');
        process.exit(0);
      }
    } else {
      console.log('❌ USDC ATA does not exist');
      console.log(`   Will create ATA: ${setup.ataAddress}\n`);

      // Create ATA
      console.log('🔨 Creating USDC ATA...\n');
      const result = await createAppWalletUSDCATA();

      if (result.wasCreated) {
        console.log('✅ USDC ATA created successfully!');
        console.log(`   Transaction: https://explorer.solana.com/tx/${result.signature}?cluster=devnet`);
        console.log(`   ATA Address: ${result.ataAddress}\n`);

        console.log('⚠️  Important: App wallet has no USDC balance yet!');
        console.log('\n📝 To fund your app wallet:');
        console.log(`   1. Visit: ${USDC_FAUCET_URL}`);
        console.log(`   2. Enter your wallet address: ${appWalletAddress}`);
        console.log(`   3. Request USDC tokens (e.g., 1000 USDC)`);
        console.log(`   4. Wait for confirmation`);
        console.log(`   5. Run this script again to verify balance\n`);
        
        // Check balance after a short delay
        console.log('⏳ Waiting 5 seconds, then checking balance...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const balance = await getAppWalletUSDCBalance();
        if (balance.balanceUsdc > 0) {
          console.log(`✅ Balance verified: ${balance.balanceUsdc.toFixed(6)} USDC\n`);
        } else {
          console.log('⚠️  No balance detected yet. Please fund using the faucet and run this script again.\n');
        }
      } else {
        console.log('✅ USDC ATA already exists');
        console.log(`   ATA Address: ${result.ataAddress}\n`);
        
        const balance = await getAppWalletUSDCBalance();
        console.log(`   Balance: ${balance.balanceUsdc.toFixed(6)} USDC\n`);
        
        if (balance.balanceUsdc === 0) {
          console.log('⚠️  App wallet has no USDC balance!');
          console.log('\n📝 To fund your app wallet:');
          console.log(`   1. Visit: ${USDC_FAUCET_URL}`);
          console.log(`   2. Enter your wallet address: ${appWalletAddress}`);
          console.log(`   3. Request USDC tokens\n`);
        }
      }
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    
    if (error.message.includes('APP_WALLET_PRIVATE_KEY')) {
      console.error('\n💡 Make sure APP_WALLET_PRIVATE_KEY is set in your .env.local or .env file');
      console.error('   The script tries to load from .env.local first, then .env');
      console.error('   Or set it as an environment variable:');
      console.error('   export APP_WALLET_PRIVATE_KEY="your-key-here"');
    } else if (error.message.includes('Insufficient SOL') || error.message.includes('debit an account')) {
      console.error('\n💡 Your app wallet needs SOL to pay for transaction fees!');
      console.error('\n📝 To fund your app wallet with SOL:');
      console.error(`   solana airdrop 1 ${appWalletAddress} --url devnet`);
      console.error(`   Or visit: https://faucet.solana.com/`);
      console.error(`   Enter address: ${appWalletAddress}\n`);
    } else if (error.message.includes('devnet')) {
      console.error('\n💡 Make sure SOLANA_RPC_URL points to a devnet endpoint');
      console.error('   You can set it in .env.local or as an environment variable');
    }
    
    console.error('\n');
    process.exit(1);
  }
}

main();

