import { GoalErrors } from './errors.js';
import { isValidCoin, getPriceUSD, getTokenInfo } from './prices.js';

const VALID_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'];

/**
 * Validate goal input with per-token limits
 */
export function validateGoalInput(data) {
  const { coin, targetAmount, amountPerInterval, frequency } = data;
  
  // Normalize and validate coin
  const normalizedCoin = coin?.toUpperCase();
  if (!normalizedCoin || !isValidCoin(normalizedCoin)) {
    throw GoalErrors.INVALID_COIN(coin);
  }
  
  // Get token-specific limits
  const tokenInfo = getTokenInfo(normalizedCoin);
  const maxTarget = tokenInfo.maxTarget;
  
  // Validate targetAmount with token-specific max
  if (!targetAmount || targetAmount <= 0 || targetAmount > maxTarget) {
    throw GoalErrors.INVALID_AMOUNT('targetAmount', 0.01, maxTarget);
  }
  
  // Validate amountPerInterval (per interval contribution)
  if (!amountPerInterval || amountPerInterval < 10) {
    throw GoalErrors.INVALID_AMOUNT('amountPerInterval', 10, Infinity);
  }
  
  // Validate frequency
  if (!frequency || !VALID_FREQUENCIES.includes(frequency)) {
    throw GoalErrors.INVALID_FREQUENCY(frequency);
  }
  
  return normalizedCoin;
}

/**
 * Calculate estimated completion (don't store, return only)
 */
export async function calculateEstimatedCompletion(coin, targetAmount, amountPerInterval, frequency) {
  const tokenInfo = getTokenInfo(coin.toUpperCase());
  if (!tokenInfo) {
    throw GoalErrors.INVALID_COIN(coin);
  }
  const pricePerCoinUSD = await getPriceUSD(tokenInfo.mint);
  const totalCostUSD = targetAmount * pricePerCoinUSD;
  const intervalsNeeded = Math.ceil(totalCostUSD / amountPerInterval);

  if (!Number.isFinite(intervalsNeeded) || intervalsNeeded <= 0) {
    return {
      monthsToComplete: 0,
      estimatedCompletionDate: new Date().toISOString(),
      intervalsNeeded: 0,
      totalCostUSD: Math.round(totalCostUSD)
    };
  }
  
  // Convert intervals to days
  const daysPerInterval = {
    'DAILY': 1,
    'WEEKLY': 7,
    'MONTHLY': 30
  }[frequency];
  
  const daysToComplete = intervalsNeeded * daysPerInterval;
  const monthsToComplete = Math.ceil(daysToComplete / 30);
  
  // Calculate estimated date (don't persist)
  const estimatedDate = new Date();
  estimatedDate.setDate(estimatedDate.getDate() + daysToComplete);
  
  return {
    monthsToComplete,
    estimatedCompletionDate: estimatedDate.toISOString(),
    intervalsNeeded,
    totalCostUSD: Math.round(totalCostUSD)
  };
}

/**
 * Validate status transition (state machine enforcement)
 */
export function validateStatusTransition(currentStatus, newStatus) {
  // Cannot manually set to COMPLETED
  if (newStatus === 'COMPLETED') {
    throw GoalErrors.INVALID_STATUS_TRANSITION(currentStatus, newStatus);
  }
  
  const validTransitions = {
    'ACTIVE': ['PAUSED'],
    'PAUSED': ['ACTIVE'],
    'COMPLETED': [] // Terminal state
  };
  
  if (!validTransitions[currentStatus]?.includes(newStatus)) {
    throw GoalErrors.INVALID_STATUS_TRANSITION(currentStatus, newStatus);
  }
}

/**
 * Calculate progress percentage
 */
export function calculateProgress(investedAmount, targetAmount) {
  if (targetAmount <= 0) return 0;
  const progress = (investedAmount / targetAmount) * 100;
  return Math.min(Math.round(progress * 100) / 100, 100); // Round to 2 decimals
}

/**
 * Check if goal should auto-complete
 */
export function shouldAutoComplete(investedAmount, targetAmount) {
  return investedAmount >= targetAmount;
}
