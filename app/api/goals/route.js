import { requireAuth, ensureTwoFa } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { 
  validateGoalInput, 
  calculateEstimatedCompletion, 
  calculateProgress 
} from '@/lib/goalValidation';
import { getTokenInfo } from '@/lib/prices';
import { GoalErrors, AuthenticationError, AuthorizationError } from '@/lib/errors';

/**
 * POST /api/goals
 * Create a new goal
 */
export async function POST(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;
  
  try {
    const { user: authUser, sess } = await requireAuth(request);
    user = authUser;
    ensureTwoFa(sess, user);
    
    const body = await request.json();
    const { coin, targetAmount, amountInr, frequency } = body;
    
    logger.info('Creating goal', { userId: user.id, coin, requestId });
    
    // Validate and normalize coin
    const normalizedCoin = validateGoalInput({ coin, targetAmount, amountInr, frequency });
    
    // Calculate ETA (for response only, not stored)
    const { monthsToComplete, estimatedCompletionDate, totalCostINR } = 
      await calculateEstimatedCompletion(normalizedCoin, targetAmount, amountInr, frequency);
    
    // Get token metadata for response
    const tokenInfo = getTokenInfo(normalizedCoin);
    
    // Create goal
    const goal = await prisma.goal.create({
      data: {
        userId: user.id,
        coin: normalizedCoin,
        targetAmount,
        investedAmount: 0,
        frequency,
        amountInr,
        status: 'ACTIVE'
      }
    });
    
    logger.info('Goal created', { goalId: goal.id, userId: user.id, requestId });
    
    return Response.json({
      success: true,
      goalId: goal.id,
      goal: {
        ...goal,
        tokenMint: tokenInfo.mint,
        decimals: tokenInfo.decimals
      },
      estimatedCompletionDate,
      monthsToComplete,
      totalCostINR
    }, { status: 201 });
    
  } catch (error) {
    logger.error('Goal creation failed', { 
      error: error.message,
      errorName: error.name,
      userId: user?.id, 
      requestId 
    });
    
    // Check if it's an Authentication or Authorization error
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
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
        message: 'Failed to create goal'
      }
    }, { status: 500 });
  }
}

/**
 * GET /api/goals
 * List user's goals
 */
export async function GET(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;
  
  try {
    const { user: authUser, sess } = await requireAuth(request);
    user = authUser;
    ensureTwoFa(sess, user);
    
    const { searchParams } = new URL(request.url);
    const statusFilter = searchParams.get('status');
    
    logger.info('Fetching goals', { userId: user.id, statusFilter, requestId });
    
    const where = { userId: user.id };
    if (statusFilter && ['ACTIVE', 'PAUSED', 'COMPLETED'].includes(statusFilter)) {
      where.status = statusFilter;
    }
    
    const goals = await prisma.goal.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    
    // Add computed fields
    const goalsWithMetadata = goals.map(g => {
      const tokenInfo = getTokenInfo(g.coin);
      return {
        ...g,
        progressPercentage: calculateProgress(g.investedAmount, g.targetAmount),
        tokenMint: tokenInfo.mint,
        decimals: tokenInfo.decimals
      };
    });
    
    logger.info('Goals fetched', { userId: user.id, count: goals.length, requestId });
    
    return Response.json({
      success: true,
      goals: goalsWithMetadata,
      count: goals.length
    }, { status: 200 });
    
  } catch (error) {
    logger.error('Goal fetch failed', { 
      error: error.message,
      errorName: error.name,
      userId: user?.id, 
      requestId 
    });
    
    // Check if it's an Authentication or Authorization error
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
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
        message: 'Failed to fetch goals'
      }
    }, { status: 500 });
  }
}
