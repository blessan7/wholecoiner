import { requireAuth, ensureTwoFa } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { calculateProgress, calculateEstimatedCompletion } from '@/lib/goalValidation';
import { getPriceUSD } from '@/lib/prices';
import { GoalErrors } from '@/lib/errors';
import { getTokenMint } from '@/lib/tokens';

/**
 * GET /api/progress/:goalId
 * Returns detailed progress metrics for a goal
 */
export async function GET(request, { params }) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const { goalId } = await params;
  
  try {
    const { user, sess } = await requireAuth(request);
    ensureTwoFa(sess, user);
    
    logger.info('Fetching goal progress', { goalId, userId: user.id, requestId });
    
    // Fetch goal with ownership check
    const goal = await prisma.goal.findFirst({
      where: {
        id: goalId,
        userId: user.id
      }
    });
    
    if (!goal) {
      throw GoalErrors.GOAL_NOT_FOUND();
    }
    
    // Get current price in USD
    let currentPriceUSD = null;
    let currentValueUSD = null;
    try {
      const tokenInfo = getTokenMint(goal.coin);
      currentPriceUSD = await getPriceUSD(tokenInfo.mint);
      currentValueUSD = goal.investedAmount * currentPriceUSD;
    } catch (error) {
      logger.warn('Failed to fetch USD price', { error: error.message, goalId, requestId });
      // Continue without USD values if price fetch fails
    }
    
    // Calculate progress metrics
    const progressPercentage = calculateProgress(goal.investedAmount, goal.targetAmount);
    
    // Calculate USD totals
    const totalInvestedUSD = currentValueUSD ?? 0;
    const targetValueUSD = currentPriceUSD ? goal.targetAmount * currentPriceUSD : 0;
    
    // For now, profit/loss is 0 until we track buy prices
    const profitLossUSD = 0;
    const profitLossPercentage = 0;
    
    // Calculate remaining and ETA
    const remainingAmount = Math.max(0, goal.targetAmount - goal.investedAmount);
    let estimatedCompletion = null;
    
    if (remainingAmount > 0 && goal.status === 'ACTIVE') {
      const eta = await calculateEstimatedCompletion(
        goal.coin,
        remainingAmount,
        goal.amountPerInterval,
        goal.frequency
      );
      estimatedCompletion = {
        estimatedCompletionDate: eta.estimatedCompletionDate,
        monthsToComplete: eta.monthsToComplete,
        intervalsNeeded: eta.intervalsNeeded
      };
    }
    
    // Next investment date (simple calculation based on frequency)
    let nextInvestmentDate = null;
    if (goal.status === 'ACTIVE') {
      const now = new Date();
      const next = new Date(now);
      
      switch (goal.frequency) {
        case 'DAILY':
          next.setDate(next.getDate() + 1);
          break;
        case 'WEEKLY':
          next.setDate(next.getDate() + 7);
          break;
        case 'MONTHLY':
          next.setMonth(next.getMonth() + 1);
          break;
      }
      
      nextInvestmentDate = next.toISOString();
    }
    
    logger.info('Progress computed', { goalId, progressPercentage, requestId });
    
    return Response.json({
      success: true,
      goalId: goal.id,
      coin: goal.coin,
      targetAmount: goal.targetAmount,
      investedAmount: goal.investedAmount,
      progressPercentage,
      currentPriceUSD: currentPriceUSD ? Math.round(currentPriceUSD * 100) / 100 : null,
      totalInvestedUSD: Math.round(totalInvestedUSD * 100) / 100,
      targetValueUSD: Math.round(targetValueUSD * 100) / 100,
      currentValueUSD: currentValueUSD ? Math.round(currentValueUSD * 100) / 100 : null,
      profitLossUSD,
      profitLossPercentage,
      remainingAmount,
      estimatedCompletion,
      nextInvestmentDate,
      status: goal.status,
      frequency: goal.frequency,
      amountPerInterval: goal.amountPerInterval,
      createdAt: goal.createdAt.toISOString(),
      updatedAt: goal.updatedAt.toISOString()
    }, { status: 200 });
    
  } catch (error) {
    logger.error('Progress fetch failed', { goalId, error: error.message, requestId });
    
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
        message: 'Failed to compute progress'
      }
    }, { status: 500 });
  }
}
