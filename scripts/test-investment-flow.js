/**
 * Test script for investment flow
 * 
 * This script tests the complete investment flow:
 * 1. Simulated USDC onramp
 * 2. Get swap quote
 * 3. Check investment status
 * 4. (Optional) Execute swap (requires signing)
 * 
 * Usage:
 *   node scripts/test-investment-flow.js [options]
 * 
 * Options:
 *   --goalId=<uuid>       Goal ID to test with (required)
 *   --amount=<number>     USDC amount (default: 10)
 *   --baseUrl=<url>       API base URL (default: http://localhost:3000)
 *   --cookie=<string>     Session cookie from browser (required)
 *   --outputMint=<coin>   Output token (BTC/ETH/SOL) (default: BTC)
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n[STEP ${step}] ${message}`, 'cyan');
  log('='.repeat(60), 'bright');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'blue');
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    goalId: null,
    amount: 10,
    baseUrl: 'http://localhost:3000',
    cookie: null,
    outputMint: 'BTC',
  };

  args.forEach(arg => {
    if (arg.startsWith('--goalId=')) {
      config.goalId = arg.split('=')[1];
    } else if (arg.startsWith('--amount=')) {
      config.amount = parseFloat(arg.split('=')[1]);
    } else if (arg.startsWith('--baseUrl=')) {
      config.baseUrl = arg.split('=')[1];
    } else if (arg.startsWith('--cookie=')) {
      config.cookie = arg.split('=')[1];
    } else if (arg.startsWith('--outputMint=')) {
      config.outputMint = arg.split('=')[1].toUpperCase();
    }
  });

  return config;
}

// Make API request with proper error handling
async function makeRequest(url, options = {}) {
  const startTime = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const duration = Date.now() - startTime;
    const data = await response.json();

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      data,
      duration,
      headers: Object.fromEntries(response.headers.entries()),
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

// Test 1: Simulated USDC Onramp
async function testOnramp(baseUrl, cookie, goalId, amount) {
  logStep(1, 'Testing USDC Onramp Simulation');
  
  const batchId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  logInfo(`Batch ID: ${batchId}`);
  logInfo(`Goal ID: ${goalId}`);
  logInfo(`Amount: ${amount} USDC`);

  const url = `${baseUrl}/api/onramp/simulate-usdc`;
  logInfo(`POST ${url}`);

  const response = await makeRequest(url, {
    method: 'POST',
    headers: {
      'Cookie': cookie,
    },
    body: JSON.stringify({
      goalId,
      amountUsdc: amount,
      batchId,
    }),
  });

  log(`Status: ${response.status} ${response.statusText}`, response.ok ? 'green' : 'red');
  log(`Duration: ${response.duration}ms`);

  if (response.ok) {
    logSuccess('Onramp simulation successful');
    log(`Response:`, 'bright');
    console.log(JSON.stringify(response.data, null, 2));
    return { success: true, batchId, transaction: response.data.transaction };
  } else {
    logError(`Onramp failed: ${response.data?.error?.message || response.error || 'Unknown error'}`);
    log(`Error details:`, 'bright');
    console.log(JSON.stringify(response.data, null, 2));
    return { success: false, batchId, error: response.data };
  }
}

// Test 2: Get Swap Quote
async function testSwapQuote(baseUrl, cookie, goalId, batchId, outputMint, amount) {
  logStep(2, 'Testing Swap Quote');
  
  logInfo(`Batch ID: ${batchId}`);
  logInfo(`Input: USDC`);
  logInfo(`Output: ${outputMint}`);
  logInfo(`Amount: ${amount} USDC`);

  const url = `${baseUrl}/api/swap/execute`;
  logInfo(`POST ${url}`);

  const response = await makeRequest(url, {
    method: 'POST',
    headers: {
      'Cookie': cookie,
    },
    body: JSON.stringify({
      goalId,
      batchId,
      inputMint: 'USDC',
      outputMint,
      mode: 'quote',
      slippageBps: 50, // 0.5%
    }),
  });

  log(`Status: ${response.status} ${response.statusText}`, response.ok ? 'green' : 'red');
  log(`Duration: ${response.duration}ms`);

  if (response.ok) {
    logSuccess('Swap quote retrieved');
    log(`Response:`, 'bright');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.transaction) {
      const tx = response.data.transaction;
      logInfo(`Quote expires at: ${tx.meta?.expiresAt || 'N/A'}`);
      logInfo(`Expected output: ${tx.expectedOutputAmount || 'N/A'} ${outputMint}`);
    }
    
    return { success: true, quote: response.data };
  } else {
    logError(`Quote failed: ${response.data?.error?.message || response.error || 'Unknown error'}`);
    log(`Error details:`, 'bright');
    console.log(JSON.stringify(response.data, null, 2));
    return { success: false, error: response.data };
  }
}

// Test 3: Check Investment Status
async function testInvestmentStatus(baseUrl, cookie, batchId) {
  logStep(3, 'Testing Investment Status');
  
  logInfo(`Batch ID: ${batchId}`);

  const url = `${baseUrl}/api/investments/${batchId}/status`;
  logInfo(`GET ${url}`);

  const response = await makeRequest(url, {
    method: 'GET',
    headers: {
      'Cookie': cookie,
    },
  });

  log(`Status: ${response.status} ${response.statusText}`, response.ok ? 'green' : 'red');
  log(`Duration: ${response.duration}ms`);

  if (response.ok) {
    logSuccess('Investment status retrieved');
    log(`Current state: ${response.data.state || 'N/A'}`, 'bright');
    log(`Can cancel: ${response.data.canCancel ? 'Yes' : 'No'}`);
    log(`Transactions: ${response.data.transactions?.length || 0}`);
    
    if (response.data.transactions && response.data.transactions.length > 0) {
      logInfo('Transaction details:');
      response.data.transactions.forEach((tx, idx) => {
        log(`  ${idx + 1}. ${tx.type} - ${tx.state || 'N/A'} - ${tx.amountCrypto} ${tx.tokenMint || ''}`, 'yellow');
      });
    }
    
    log(`Full response:`, 'bright');
    console.log(JSON.stringify(response.data, null, 2));
    return { success: true, status: response.data };
  } else {
    logError(`Status check failed: ${response.data?.error?.message || response.error || 'Unknown error'}`);
    log(`Error details:`, 'bright');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Check if it's a 404 - this means batch not found
    if (response.status === 404) {
      logWarning('Batch not found. This could mean:');
      logWarning('  - The onramp transaction was not created properly');
      logWarning('  - The batchId is incorrect');
      logWarning('  - There is an ownership/permission issue');
      logWarning('\nCheck server logs for more details.');
    }
    
    return { success: false, error: response.data };
  }
}

// Main test flow
async function main() {
  log('\n' + '='.repeat(60), 'bright');
  log('INVESTMENT FLOW TEST SCRIPT', 'bright');
  log('='.repeat(60) + '\n', 'bright');

  const config = parseArgs();

  // Validate required parameters
  if (!config.goalId) {
    logError('Missing required parameter: --goalId');
    logInfo('\nUsage:');
    logInfo('  node scripts/test-investment-flow.js --goalId=<uuid> --cookie=<cookie> [options]');
    logInfo('\nOptions:');
    logInfo('  --goalId=<uuid>       Goal ID to test with (required)');
    logInfo('  --amount=<number>     USDC amount (default: 10)');
    logInfo('  --baseUrl=<url>       API base URL (default: http://localhost:3000)');
    logInfo('  --cookie=<string>     Session cookie from browser (required)');
    logInfo('  --outputMint=<coin>   Output token BTC/ETH/SOL (default: BTC)');
    logInfo('\nHow to get session cookie:');
    logInfo('  1. Open your browser and log in to the app');
    logInfo('  2. Open Developer Tools (F12)');
    logInfo('  3. Go to Application/Storage > Cookies');
    logInfo('  4. Copy the value of the session cookie (usually starts with "privy")');
    logInfo('  5. Use: --cookie="privy:xxxxx=yyyyy"');
    process.exit(1);
  }

  if (!config.cookie) {
    logError('Missing required parameter: --cookie');
    logInfo('See usage instructions above for how to get the session cookie.');
    process.exit(1);
  }

  // Display configuration
  log('Configuration:', 'bright');
  log(`  Goal ID: ${config.goalId}`);
  log(`  Amount: ${config.amount} USDC`);
  log(`  Output Mint: ${config.outputMint}`);
  log(`  Base URL: ${config.baseUrl}`);
  log(`  Cookie: ${config.cookie.substring(0, 50)}...`);

  let batchId = null;
  let allTestsPassed = true;

  try {
    // Test 1: Onramp
    const onrampResult = await testOnramp(
      config.baseUrl,
      config.cookie,
      config.goalId,
      config.amount
    );

    if (!onrampResult.success) {
      logError('\n❌ ONRAMP TEST FAILED - Stopping tests');
      logError('Please check the error above and fix before proceeding.');
      process.exit(1);
    }

    batchId = onrampResult.batchId;
    logSuccess(`\n✅ Onramp completed. Batch ID: ${batchId}`);

    // Wait a moment for DB to settle
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 2: Swap Quote
    const quoteResult = await testSwapQuote(
      config.baseUrl,
      config.cookie,
      config.goalId,
      batchId,
      config.outputMint,
      config.amount
    );

    if (!quoteResult.success) {
      logWarning('\n⚠️  QUOTE TEST FAILED');
      logWarning('This might be expected if:');
      logWarning('  - The output token is not supported');
      logWarning('  - Jupiter API is unavailable');
      logWarning('  - There is insufficient liquidity');
      allTestsPassed = false;
    } else {
      logSuccess(`\n✅ Quote retrieved successfully`);
    }

    // Wait a moment for DB to settle
    await new Promise(resolve => setTimeout(resolve, 500));

    // Test 3: Investment Status
    const statusResult = await testInvestmentStatus(
      config.baseUrl,
      config.cookie,
      batchId
    );

    if (!statusResult.success) {
      logError('\n❌ STATUS CHECK FAILED');
      logError('This indicates a problem with transaction tracking.');
      allTestsPassed = false;
    } else {
      logSuccess(`\n✅ Status check completed`);
    }

    // Summary
    log('\n' + '='.repeat(60), 'bright');
    log('TEST SUMMARY', 'bright');
    log('='.repeat(60), 'bright');
    log(`Batch ID: ${batchId}`);
    log(`Onramp: ${onrampResult.success ? '✅ PASSED' : '❌ FAILED'}`);
    log(`Quote: ${quoteResult.success ? '✅ PASSED' : '❌ FAILED'}`);
    log(`Status: ${statusResult.success ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (allTestsPassed && onrampResult.success && statusResult.success) {
      log('\n✅ ALL CRITICAL TESTS PASSED', 'green');
      logInfo('\nNext steps:');
      logInfo('  - Execute swap via frontend or API');
      logInfo('  - Check transaction in explorer');
      logInfo('  - Verify goal progress updated');
      process.exit(0);
    } else {
      log('\n⚠️  SOME TESTS FAILED', 'yellow');
      logInfo('\nTroubleshooting:');
      logInfo('  - Check server logs for detailed errors');
      logInfo('  - Verify goal exists and is ACTIVE');
      logInfo('  - Verify user has wallet address');
      logInfo('  - Check database for transaction records');
      process.exit(1);
    }

  } catch (error) {
    logError(`\nFatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run the tests
main();









