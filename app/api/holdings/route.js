/**
 * GET /api/holdings
 * Get user's token holdings across all goals
 */

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { AuthenticationError } from '@/lib/errors';

export async function GET(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;
  
  try {
    logger.info('[HOLDINGS] Getting user holdings', { requestId });
    
    // Authentication
    const { user: authUser } = await requireAuth(request);
    user = authUser;
    
    logger.debug('[HOLDINGS] Fetching holdings', { 
      userId: user.id,
      requestId 
    });
    
    // Get all goals with their invested amounts
    const goals = await prisma.goal.findMany({
      where: {
        userId: user.id,
      },
      select: {
        id: true,
        coin: true,
        investedAmount: true,
        targetAmount: true,
        status: true,
      },
    });
    
    // Fetch confirmed swap transactions for these goals
    const swapTransactions = await prisma.transaction.findMany({
      where: {
        type: 'SWAP',
        goal: {
          userId: user.id,
        },
        meta: {
          path: ['state'],
          equals: 'SWAP_CONFIRMED',
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
      select: {
        id: true,
        goalId: true,
        amountCrypto: true,
        amountUsd: true,
        txnHash: true,
        network: true,
        provider: true,
        timestamp: true,
        meta: true,
        goal: {
          select: {
            coin: true,
          },
        },
      },
    });
    
    // Group by coin
    const holdingsByCoin = {};
    
    for (const goal of goals) {
      const coin = goal.coin;
      const amount = parseFloat(goal.investedAmount) || 0;
      
      if (!holdingsByCoin[coin]) {
        holdingsByCoin[coin] = {
          coin,
          totalAmount: 0,
          goals: [],
          swaps: [],
        };
      }
      
      holdingsByCoin[coin].totalAmount += amount;
      holdingsByCoin[coin].goals.push({
        id: goal.id,
        amount,
        targetAmount: goal.targetAmount,
        status: goal.status,
      });
    }
    
    for (const txn of swapTransactions) {
      const coin = txn.goal?.coin;
      if (!coin) continue;
      
      if (!holdingsByCoin[coin]) {
        holdingsByCoin[coin] = {
          coin,
          totalAmount: 0,
          goals: [],
          swaps: [],
        };
      }
      
      holdingsByCoin[coin].swaps.push({
        id: txn.id,
        goalId: txn.goalId,
        amountCrypto: txn.amountCrypto ?? 0,
        amountUsd: txn.amountUsd ?? 0,
        txnHash: txn.txnHash,
        network: txn.network,
        provider: txn.provider,
        timestamp: txn.timestamp,
        state: txn.meta?.state ?? null,
        simulated: Boolean(txn.meta?.simulated),
      });
    }
    
    // Convert to array
    const holdings = Object.values(holdingsByCoin).filter(h => h.totalAmount > 0 || h.swaps.length > 0);
    
    logger.info('[HOLDINGS] Holdings retrieved', { 
      userId: user.id,
      holdingsCount: holdings.length,
      requestId 
    });
    
    return Response.json({
      success: true,
      holdings,
    }, { status: 200 });
    
  } catch (error) {
    logger.error('[HOLDINGS] Failed to get holdings', { 
      error: error.message,
      errorName: error.name,
      userId: user?.id,
      requestId 
    });
    
    if (error instanceof AuthenticationError) {
      return Response.json({
        success: false,
        error: {
          code: error.code || 'AUTH_ERROR',
          message: error.message
        }
      }, { status: error.statusCode || 401 });
    }
    
    return Response.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get holdings'
      }
    }, { status: 500 });
  }
}

