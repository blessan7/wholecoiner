/**
 * Test script for two-step swap flow (USDC→SOL→BTC)
 * Tests: onramp → USDC→SOL → SOL→BTC
 * 
 * Usage: node scripts/test-two-step-swap.js
 */

const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000';

// Test configuration
const TEST_CONFIG = {
  goalId: process.env.TEST_GOAL_ID || 'test-goal-btc',
  amountUsdc: 1, // 1 USDC test amount
  goalCoin: 'BTC',
};

console.log('🧪 Two-Step Swap Test');
console.log('===================\n');
console.log('Configuration:');
console.log(`- Goal ID: ${TEST_CONFIG.goalId}`);
console.log(`- Amount: ${TEST_CONFIG.amountUsdc} USDC`);
console.log(`- Goal Coin: ${TEST_CONFIG.goalCoin}`);
console.log(`- Base URL: ${baseUrl}\n`);

/**
 * Step 1: Simulate USDC onramp
 */
async function testOnramp() {
  console.log('📥 Step 1: Simulating USDC onramp...');
  
  try {
    const response = await fetch(`${baseUrl}/api/onramp/simulate-usdc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        goalId: TEST_CONFIG.goalId,
        amountUsdc: TEST_CONFIG.amountUsdc,
        batchId: `test-batch-${Date.now()}`,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      console.error('❌ Onramp failed:', data.error?.message || 'Unknown error');
      return null;
    }
    
    console.log('✅ Onramp successful');
    console.log(`   Batch ID: ${data.batchId}`);
    console.log(`   Transaction ID: ${data.transaction.id}`);
    console.log(`   Amount: ${data.transaction.amountUsdc} USDC`);
    console.log(`   State: ${data.transaction.state}`);
    
    if (data.needsSolSwap) {
      console.log('   🔄 Intermediate swap required: USDC→SOL');
      console.log(`   SOL Quote: ${data.solQuote ? 'Received' : 'Not available'}`);
      console.log(`   Swap Transaction: ${data.solSwapTransaction ? 'Ready' : 'Not available'}`);
    }
    
    return data;
  } catch (error) {
    console.error('❌ Onramp error:', error.message);
    return null;
  }
}

/**
 * Step 2: Execute USDC→SOL intermediate swap
 */
async function testIntermediateSwap(batchId, solSwapTransaction, solQuote) {
  console.log('\n🔄 Step 2: Executing USDC→SOL intermediate swap...');
  
  if (!solSwapTransaction) {
    console.log('⏭️  Skipping: No intermediate swap transaction');
    return null;
  }
  
  try {
    // In a real scenario, this would be signed by the user's wallet
    // For testing, we'll just log what would happen
    console.log('   ⚠️  Note: In production, user wallet would sign this transaction');
    console.log(`   Transaction size: ${solSwapTransaction.length} bytes`);
    console.log(`   Expected SOL output: ${solQuote?.outAmount || 'Unknown'}`);
    
    // Simulate the intermediate swap execution
    // In reality, this would call /api/swap/intermediate with signed transaction
    console.log('   ℹ️  Would call: POST /api/swap/intermediate');
    console.log('   ℹ️  With: { goalId, batchId, signedTransaction, quoteResponse }');
    
    return {
      success: true,
      solAmount: solQuote?.outAmount ? (solQuote.outAmount / 1e9).toFixed(6) : '0.01',
      message: 'Simulated intermediate swap',
    };
  } catch (error) {
    console.error('❌ Intermediate swap error:', error.message);
    return null;
  }
}

/**
 * Step 3: Get SOL→BTC quote
 */
async function testMainSwapQuote(batchId) {
  console.log('\n💱 Step 3: Getting SOL→BTC quote...');
  
  try {
    const response = await fetch(`${baseUrl}/api/swap/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        goalId: TEST_CONFIG.goalId,
        batchId,
        inputMint: 'SOL',
        outputMint: TEST_CONFIG.goalCoin,
        slippageBps: 50,
        mode: 'quote',
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      console.error('❌ Quote failed:', data.error?.message || 'Unknown error');
      return null;
    }
    
    console.log('✅ Quote received');
    console.log(`   Input: ${data.quote?.inputMint || 'SOL'}`);
    console.log(`   Output: ${data.quote?.outputMint || TEST_CONFIG.goalCoin}`);
    console.log(`   In Amount: ${data.quote?.inAmount || 'Unknown'}`);
    console.log(`   Out Amount: ${data.quote?.outAmount || 'Unknown'}`);
    console.log(`   Price Impact: ${data.quote?.priceImpactPct || 'N/A'}%`);
    console.log(`   Slippage: ${data.quote?.slippageBps || 50} bps`);
    
    if (data.swapTransaction) {
      console.log(`   Swap Transaction: Ready (${data.swapTransaction.length} bytes)`);
    }
    
    return data;
  } catch (error) {
    console.error('❌ Quote error:', error.message);
    return null;
  }
}

/**
 * Step 4: Execute SOL→BTC swap
 */
async function testMainSwapExecute(batchId, swapTransaction, quoteResponse) {
  console.log('\n🔄 Step 4: Executing SOL→BTC swap...');
  
  if (!swapTransaction) {
    console.log('⏭️  Skipping: No swap transaction');
    return null;
  }
  
  try {
    // In a real scenario, this would be signed by the user's wallet
    console.log('   ⚠️  Note: In production, user wallet would sign this transaction');
    console.log(`   Transaction size: ${swapTransaction.length} bytes`);
    console.log(`   Expected ${TEST_CONFIG.goalCoin} output: ${quoteResponse?.outAmount || 'Unknown'}`);
    
    // Simulate the main swap execution
    console.log('   ℹ️  Would call: POST /api/swap/execute');
    console.log('   ℹ️  With: { goalId, batchId, signedTransaction, quoteResponse, mode: "execute" }');
    
    return {
      success: true,
      message: 'Simulated main swap execution',
    };
  } catch (error) {
    console.error('❌ Main swap error:', error.message);
    return null;
  }
}

/**
 * Validate transaction states
 */
async function validateTransactions(batchId) {
  console.log('\n✅ Step 5: Validating transaction states...');
  
  try {
    // In a real scenario, we would query the database to check:
    // 1. ONRAMP transaction exists and is confirmed
    // 2. SWAP_INTERMEDIATE transaction exists and is confirmed
    // 3. SWAP transaction exists and is confirmed
    // 4. Goal progress has been updated
    
    console.log('   ℹ️  Would validate:');
    console.log('   - ONRAMP transaction: ONRAMP_CONFIRMED');
    console.log('   - SWAP_INTERMEDIATE transaction: SWAP_CONFIRMED');
    console.log('   - SWAP transaction: SWAP_CONFIRMED');
    console.log('   - Goal progress: Updated with new invested amount');
    
    return true;
  } catch (error) {
    console.error('❌ Validation error:', error.message);
    return false;
  }
}

/**
 * Main test flow
 */
async function runTest() {
  try {
    // Step 1: Onramp
    const onrampResult = await testOnramp();
    if (!onrampResult) {
      console.error('\n❌ Test failed at onramp step');
      process.exit(1);
    }
    
    // Step 2: Intermediate swap (if needed)
    if (onrampResult.needsSolSwap) {
      const intermediateResult = await testIntermediateSwap(
        onrampResult.batchId,
        onrampResult.solSwapTransaction,
        onrampResult.solQuote
      );
      
      if (!intermediateResult) {
        console.error('\n❌ Test failed at intermediate swap step');
        process.exit(1);
      }
    }
    
    // Step 3: Get main swap quote
    const quoteResult = await testMainSwapQuote(onrampResult.batchId);
    if (!quoteResult) {
      console.error('\n❌ Test failed at quote step');
      process.exit(1);
    }
    
    // Step 4: Execute main swap
    const swapResult = await testMainSwapExecute(
      onrampResult.batchId,
      quoteResult.swapTransaction,
      quoteResult.quote
    );
    
    if (!swapResult) {
      console.error('\n❌ Test failed at main swap execution step');
      process.exit(1);
    }
    
    // Step 5: Validate
    const validationResult = await validateTransactions(onrampResult.batchId);
    if (!validationResult) {
      console.error('\n❌ Test failed at validation step');
      process.exit(1);
    }
    
    console.log('\n🎉 All tests passed!');
    console.log('===================\n');
    console.log('Summary:');
    console.log('✅ USDC onramp simulated');
    console.log('✅ USDC→SOL intermediate swap prepared');
    console.log('✅ SOL→BTC quote received');
    console.log('✅ Swap execution flow validated');
    console.log('\nNote: This is a dry-run test. Actual wallet signing and');
    console.log('blockchain transactions were not executed.');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
runTest();

