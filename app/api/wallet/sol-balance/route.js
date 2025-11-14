/**
 * GET /api/wallet/sol-balance
 * Get SOL balance for the authenticated user's wallet
 */

import { requireAuth } from '@/lib/auth';
import { getSOLBalance } from '@/lib/solana';
import { logger } from '@/lib/logger';
import { AuthenticationError, ValidationError } from '@/lib/errors';

export async function GET(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;
  
  try {
    logger.info('[WALLET] Getting SOL balance', { requestId });
    
    // Authentication
    const { user: authUser } = await requireAuth(request);
    user = authUser;
    
    if (!user.walletAddress) {
      logger.error('[WALLET] User has no wallet address', { userId: user.id, requestId });
      throw new ValidationError('No wallet address associated with this account');
    }
    
    logger.debug('[WALLET] Fetching SOL balance', { 
      userId: user.id,
      walletAddress: user.walletAddress,
      requestId 
    });
    
    // Get SOL balance
    const balance = await getSOLBalance(user.walletAddress);
    
    logger.info('[WALLET] SOL balance retrieved', { 
      userId: user.id,
      sol: balance.sol,
      requestId 
    });
    
    return Response.json({
      success: true,
      walletAddress: user.walletAddress,
      balance: {
        lamports: balance.lamports,
        sol: balance.sol,
      },
    }, { status: 200 });
    
  } catch (error) {
    logger.error('[WALLET] Failed to get SOL balance', { 
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
    
    if (error.statusCode) {
      return Response.json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      }, { status: error.statusCode });
    }
    
    return Response.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get SOL balance'
      }
    }, { status: 500 });
  }
}

