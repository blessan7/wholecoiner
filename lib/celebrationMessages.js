/**
 * Coin-specific celebration messages
 * Provides emotionally engaging, identity-reinforcing messages for all supported coins
 */

/**
 * Get goal creation message (coin-agnostic)
 * @returns {string} Celebration message
 */
export function getGoalCreationMessage() {
  return "Goal created! Your 1.0 journey begins 🌕";
}

/**
 * Get investment success message for a specific coin
 * @param {string} coin - Coin symbol (BTC, ETH, SOL)
 * @param {number} amount - Amount of coin added
 * @param {number} progressPercentage - Progress percentage toward goal
 * @returns {Object} { title, description }
 */
export function getInvestmentSuccessMessage(coin, amount, progressPercentage = null) {
  const coinUpper = coin?.toUpperCase() || 'COIN';
  
  const messages = {
    BTC: {
      title: "Investment completed — you stacked more satoshis ⚡",
      description: `You added ${formatAmount(amount, 8)} BTC toward your wholecoin goal.`,
      progress: progressPercentage 
        ? `You're ${progressPercentage.toFixed(2)}% closer to your wholecoin.`
        : null,
    },
    ETH: {
      title: "Your accumulation just leveled up.",
      description: `You added ${formatAmount(amount, 6)} ETH toward your goal.`,
      progress: progressPercentage
        ? `You're ${progressPercentage.toFixed(2)}% closer to your wholecoin.`
        : null,
    },
    SOL: {
      title: "Investment completed — stacking continues ⚡",
      description: `You added ${formatAmount(amount, 4)} SOL toward your goal.`,
      progress: progressPercentage
        ? `You're ${progressPercentage.toFixed(2)}% closer to your wholecoin.`
        : null,
    },
  };

  // Default message for any other coin
  const defaultMessage = {
    title: "Investment completed successfully! 🎉",
    description: `You added ${formatAmount(amount, 6)} ${coinUpper} toward your goal.`,
    progress: progressPercentage
      ? `You're ${progressPercentage.toFixed(2)}% closer to your wholecoin.`
      : null,
  };

  return messages[coinUpper] || defaultMessage;
}

/**
 * Get floating badge text for investment success
 * @param {string} coin - Coin symbol
 * @param {number} amount - Amount of coin added
 * @returns {string} Badge text
 */
export function getFloatingBadgeText(coin, amount) {
  const coinUpper = coin?.toUpperCase() || 'COIN';
  const decimals = coinUpper === 'BTC' ? 8 : coinUpper === 'ETH' ? 6 : 4;
  const formatted = formatAmount(amount, decimals);
  return `+${formatted} ${coinUpper} Added`;
}

/**
 * Format amount with appropriate decimals
 * @param {number} amount - Amount to format
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted amount
 */
function formatAmount(amount, decimals) {
  const num = Number(amount);
  if (isNaN(num) || num === null || num === undefined) return '0';
  return num.toFixed(decimals);
}

/**
 * Get toast message for goal creation
 * @returns {string} Toast message
 */
export function getGoalCreationToast() {
  return getGoalCreationMessage();
}

/**
 * Get toast message for investment success
 * @param {string} coin - Coin symbol
 * @param {number} amount - Amount added
 * @returns {string} Toast message
 */
export function getInvestmentToast(coin, amount) {
  const message = getInvestmentSuccessMessage(coin, amount);
  return message.title;
}

