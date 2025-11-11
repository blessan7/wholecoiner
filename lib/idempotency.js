/**
 * Idempotency utilities for transaction deduplication
 */

import { prisma } from './prisma.js';

/**
 * Check if a transaction with the given batchId and type already exists
 * @param {string} batchId - Batch ID
 * @param {string} type - Transaction type (ONRAMP or SWAP)
 * @returns {Promise<Object|null>} Existing transaction or null
 */
export async function checkIdempotency(batchId, type) {
  try {
    const existing = await prisma.transaction.findUnique({
      where: {
        batchId_type: {
          batchId,
          type,
        },
      },
    });
    
    return existing;
  } catch (error) {
    // If unique constraint doesn't exist yet, return null
    if (error.code === 'P2001' || error.message?.includes('Unknown argument')) {
      return null;
    }
    throw error;
  }
}

/**
 * Ensure idempotent transaction creation
 * Checks if transaction exists, returns existing if found, otherwise calls createFn
 * @param {string} batchId - Batch ID
 * @param {string} type - Transaction type
 * @param {Function} createFn - Function that creates the transaction
 * @returns {Promise<Object>} Transaction (existing or newly created)
 */
export async function ensureIdempotency(batchId, type, createFn) {
  const existing = await checkIdempotency(batchId, type);
  
  if (existing) {
    return existing;
  }
  
  try {
    return await createFn();
  } catch (error) {
    // If unique constraint violation, transaction was created concurrently
    if (error.code === 'P2002') {
      const existing = await checkIdempotency(batchId, type);
      if (existing) {
        return existing;
      }
    }
    throw error;
  }
}



