/**
 * GET /api/wallet/tokens
 * Get user's SPL token balances
 */

import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { getTokens } from '@/lib/solana';
import { PublicKey } from '@solana/web3.js';

export async function GET(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  
  try {
    const { user } = await requireAuth(request);
    
    logger.info('Fetching user tokens', { 
      userId: user.id,
      walletAddress: user.walletAddress,
      requestId 
    });
    
    if (!user.walletAddress) {
      return Response.json({
        success: false,
        error: {
          code: 'NO_WALLET',
          message: 'User wallet address not found',
        },
        tokens: [],
      }, { status: 400 });
    }
    
    // Fetch tokens
    const tokens = await getTokens(new PublicKey(user.walletAddress));
    
    logger.info('User tokens fetched', { 
      userId: user.id,
      tokenCount: tokens.length,
      requestId 
    });
    
    return Response.json({
      success: true,
      tokens,
      count: tokens.length,
    }, { status: 200 });
    
  } catch (error) {
    logger.error('Failed to fetch user tokens', {
      error: error.message,
      requestId,
    });
    
    return Response.json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: 'Failed to fetch user tokens',
      },
      tokens: [],
    }, { status: 500 });
  }
}

