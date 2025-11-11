/**
 * History API helper functions
 */

/**
 * Group transactions by batchId into paired onramp/swap entries
 * @param {Array} transactions - Array of transaction objects with batchId and type
 * @returns {Array} Array of grouped batch objects
 */
export function groupByBatchId(transactions) {
  const batches = new Map();
  
  for (const tx of transactions) {
    if (!batches.has(tx.batchId)) {
      batches.set(tx.batchId, {
        batchId: tx.batchId,
        goalId: tx.goalId,
        coin: tx.goal.coin,
        timestamp: tx.timestamp,
        onramp: null,
        swap: null,
      });
    }
    
    const batch = batches.get(tx.batchId);
    
    if (tx.type === 'ONRAMP') {
      batch.onramp = {
        id: tx.id,
        amountInr: tx.amountInr,
        amountCrypto: tx.amountCrypto,
        tokenMint: tx.tokenMint,
        txnHash: tx.txnHash,
        timestamp: tx.timestamp,
        network: tx.network,
      };
    } else if (tx.type === 'SWAP') {
      batch.swap = {
        id: tx.id,
        amountCrypto: tx.amountCrypto,
        tokenMint: tx.tokenMint,
        txnHash: tx.txnHash,
        timestamp: tx.timestamp,
        network: tx.network,
      };
    }
    
    // Update batch timestamp to latest of pair
    if (tx.timestamp > batch.timestamp) {
      batch.timestamp = tx.timestamp;
    }
  }
  
  return Array.from(batches.values()).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

