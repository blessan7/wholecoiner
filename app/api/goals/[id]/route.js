import { requireAuth, ensureTwoFa } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { 
  calculateProgress, 
  calculateEstimatedCompletion,
  validateStatusTransition,
  shouldAutoComplete
} from '@/lib/goalValidation';
import { getTokenInfo } from '@/lib/prices';
import { GoalErrors, AuthenticationError, AuthorizationError } from '@/lib/errors';

/**
 * GET /api/goals/:id
 * Get single goal details
 */
export async function GET(request, { params }) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const goalId = params.id;
  let user = null;
  
  try {
    const { user: authUser, sess } = await requireAuth(request);
    user = authUser;
    ensureTwoFa(sess, user);
    
    logger.info('Fetching goal', { userId: user.id, goalId, requestId });
    
    // Fetch goal with ownership check
    const goal = await prisma.goal.findFirst({
      where: { 
        id: goalId,
        userId: user.id // Multi-tenancy filter
      },
      include: {
        _count: {
          select: { transactions: true }
        }
      }
    });
    
    if (!goal) {
      throw GoalErrors.GOAL_NOT_FOUND();
    }
    
    // Add computed fields
    const tokenInfo = getTokenInfo(goal.coin);
    const progressPercentage = calculateProgress(goal.investedAmount, goal.targetAmount);
    
    // Calculate remaining cost and ETA
    const remainingAmount = Math.max(0, goal.targetAmount - goal.investedAmount);
    let estimatedCompletion = null;
    
    if (remainingAmount > 0 && goal.status === 'ACTIVE') {
      try {
        estimatedCompletion = await calculateEstimatedCompletion(
          goal.coin,
          remainingAmount,
          goal.amountInr,
          goal.frequency
        );
      } catch (e) {
        // If ETA calc fails (e.g., too long), just omit it
        logger.warn('ETA calculation failed', { goalId, error: e.message });
      }
    }
    
    logger.info('Goal fetched', { userId: user.id, goalId, requestId });
    
    return Response.json({
      success: true,
      goal: {
        ...goal,
        progressPercentage,
        tokenMint: tokenInfo.mint,
        decimals: tokenInfo.decimals,
        transactionCount: goal._count.transactions,
        remainingAmount,
        estimatedCompletion
      }
    }, { status: 200 });
    
  } catch (error) {
    logger.error('Goal fetch failed', { 
      goalId, 
      error: error.message,
      errorName: error.name,
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
        message: 'Failed to fetch goal'
      }
    }, { status: 500 });
  }
}

/**
 * PATCH /api/goals/:id
 * Update goal settings
 */
export async function PATCH(request, { params }) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const goalId = params.id;
  let user = null;
  
  try {
    const { user: authUser, sess } = await requireAuth(request);
    user = authUser;
    ensureTwoFa(sess, user);
    
    const body = await request.json();
    
    logger.info('Updating goal', { userId: user.id, goalId, updates: body, requestId });
    
    // Fetch goal with ownership check
    const goal = await prisma.goal.findFirst({
      where: { 
        id: goalId,
        userId: user.id // Multi-tenancy filter
      }
    });
    
    if (!goal) {
      throw GoalErrors.GOAL_NOT_FOUND();
    }
    
    // Cannot modify completed goals
    if (goal.status === 'COMPLETED') {
      throw GoalErrors.GOAL_ALREADY_COMPLETED();
    }
    
    const updates = {};
    
    // Validate and apply amountInr update
    if (body.amountInr !== undefined) {
      if (body.amountInr < 100) {
        throw GoalErrors.INVALID_AMOUNT('amountInr', 100, Infinity);
      }
      updates.amountInr = body.amountInr;
    }
    
    // Validate and apply frequency update
    if (body.frequency !== undefined) {
      if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(body.frequency)) {
        throw GoalErrors.INVALID_FREQUENCY(body.frequency);
      }
      updates.frequency = body.frequency;
    }
    
    // Validate and apply status update (state machine)
    if (body.status !== undefined) {
      validateStatusTransition(goal.status, body.status);
      updates.status = body.status;
    }
    
    // Update goal
    const updatedGoal = await prisma.goal.update({
      where: { id: goalId },
      data: updates
    });
    
    logger.info('Goal updated', { userId: user.id, goalId, requestId });
    
    // Return with metadata
    const tokenInfo = getTokenInfo(updatedGoal.coin);
    
    return Response.json({
      success: true,
      goal: {
        ...updatedGoal,
        progressPercentage: calculateProgress(updatedGoal.investedAmount, updatedGoal.targetAmount),
        tokenMint: tokenInfo.mint,
        decimals: tokenInfo.decimals
      }
    }, { status: 200 });
    
  } catch (error) {
    logger.error('Goal update failed', { 
      goalId, 
      error: error.message,
      errorName: error.name,
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
        message: 'Failed to update goal'
      }
    }, { status: 500 });
  }
}
