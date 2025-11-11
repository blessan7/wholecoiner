/**
 * Unified error format for the application
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', retryable = false, retryAfterSec = null, hint = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSec = retryAfterSec;
    this.hint = hint;
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'RateLimitError';
  }
}

export class GoalValidationError extends AppError {
  constructor(message, code) {
    super(message, 422, code); // 422 Unprocessable Entity
    this.name = 'GoalValidationError';
  }
}

export const GoalErrors = {
  INVALID_COIN: (coin) => new GoalValidationError(
    `Invalid coin: ${coin}. Supported: BTC, ETH, SOL`, 
    'INVALID_COIN'
  ),
  INVALID_AMOUNT: (field, min, max) => new GoalValidationError(
    `${field} must be between ${min} and ${max}`, 
    'INVALID_AMOUNT'
  ),
  INVALID_FREQUENCY: (freq) => new GoalValidationError(
    `Invalid frequency: ${freq}. Must be DAILY, WEEKLY, or MONTHLY`, 
    'INVALID_FREQUENCY'
  ),
  GOAL_DURATION_TOO_LONG: (months) => new GoalValidationError(
    `Goal would take ${Math.ceil(months)} months (max 120 months / 10 years)`, 
    'GOAL_DURATION_TOO_LONG'
  ),
  GOAL_NOT_FOUND: () => new NotFoundError('Goal not found'),
  GOAL_NOT_OWNED: () => new AuthorizationError('You do not own this goal'),
  INVALID_STATUS_TRANSITION: (from, to) => new GoalValidationError(
    `Cannot transition from ${from} to ${to}`, 
    'INVALID_STATUS_TRANSITION'
  ),
  GOAL_ALREADY_COMPLETED: () => new GoalValidationError(
    'Cannot modify completed goal',
    'GOAL_ALREADY_COMPLETED'
  )
};

// Swap-specific errors
export class SwapError extends AppError {
  constructor(message, code, retryable = false, retryAfterSec = null, hint = null) {
    super(message, 400, code, retryable, retryAfterSec, hint);
    this.name = 'SwapError';
  }
}

export const SwapErrors = {
  NO_ROUTE_FOUND: () => new SwapError('No swap route found for this token pair', 'NO_ROUTE_FOUND', true, 30, 'The route may become available shortly. Try again in a moment.'),
  SLIPPAGE_EXCEEDED: (slippagePct) => new SwapError(
    slippagePct ? `Slippage exceeded: ${slippagePct}%` : 'Slippage tolerance exceeded. Price moved during transaction.',
    'SLIPPAGE_EXCEEDED',
    true,
    null,
    'Price moved during transaction. Consider increasing slippage tolerance or try again when market is more stable.'
  ),
  QUOTE_EXPIRED: () => new SwapError('Quote expired, please request a new quote', 'QUOTE_EXPIRED', true, 0, 'Request a fresh quote to get current market prices.'),
  SWAP_EXECUTION_FAILED: (reason) => new SwapError(
    `Swap execution failed: ${reason}`, 
    'SWAP_EXECUTION_FAILED',
    false,
    null,
    'Transaction was rejected by the network. Please check your wallet balance and try again.'
  ),
  INSUFFICIENT_BALANCE: () => new SwapError('Insufficient balance for swap', 'INSUFFICIENT_BALANCE', false, null, 'Please ensure your wallet has enough funds for the swap amount plus fees.'),
  INVALID_WALLET: () => new SwapError('Invalid wallet address', 'INVALID_WALLET', false, null, 'Please connect a valid Solana wallet.'),
  TRANSACTION_TIMEOUT: () => new SwapError('Transaction timeout, please try again', 'TRANSACTION_TIMEOUT', true, 10, 'Network may be congested. Wait a moment and retry.'),
  NETWORK_ERROR: () => new SwapError('Network error, please try again', 'NETWORK_ERROR', true, 30, 'Connection issue detected. Verify your internet connection and retry.'),
  TOKEN_NOT_TRADABLE: (tokenMint) => new SwapError(
    `Token not tradable: ${tokenMint}`, 
    'TOKEN_NOT_TRADABLE', 
    false, 
    null, 
    'This token may have trading restrictions or insufficient liquidity.'
  ),
  AMOUNT_TOO_LARGE: () => new SwapError(
    'Amount too large for available liquidity. Try reducing the swap amount.', 
    'AMOUNT_TOO_LARGE', 
    true, 
    null, 
    'The requested swap amount exceeds available liquidity. Reduce the amount and try again.'
  ),
};

/**
 * Format error response
 */
export function formatErrorResponse(error, requestId = null) {
  const isAppError = error instanceof AppError;

  return {
    error: {
      message: error.message || 'An unexpected error occurred',
      code: isAppError ? error.code : 'INTERNAL_ERROR',
      statusCode: isAppError ? error.statusCode : 500,
      retryable: isAppError ? error.retryable : false,
      ...(isAppError && error.retryAfterSec !== null && { retryAfterSec: error.retryAfterSec }),
      ...(isAppError && error.hint && { hint: error.hint }),
      ...(requestId && { requestId }),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    },
  };
}

/**
 * Map Jupiter API errors to appropriate SwapError with retry guidance
 * @param {Error} jupiterError - The error from Jupiter API or Solana network
 * @returns {SwapError} Mapped SwapError with retry metadata
 */
export function mapJupiterError(jupiterError) {
  const errorMsg = jupiterError.message?.toLowerCase() || '';
  const errorStr = String(jupiterError);

  // Check for network/connection errors
  if (errorMsg.includes('network') || errorMsg.includes('fetch') || errorMsg.includes('timeout')) {
    return SwapErrors.NETWORK_ERROR();
  }

  // Check for insufficient balance
  if (errorMsg.includes('insufficient') || errorMsg.includes('balance') || errorMsg.includes('funds')) {
    return SwapErrors.INSUFFICIENT_BALANCE();
  }

  // Check for slippage errors
  if (errorMsg.includes('slippage') || errorMsg.includes('price') && errorMsg.includes('move')) {
    return SwapErrors.SLIPPAGE_EXCEEDED();
  }

  // Check for timeout
  if (errorMsg.includes('timeout') || errorMsg.includes('expired')) {
    return SwapErrors.TRANSACTION_TIMEOUT();
  }

  // Check for no route found (404 or specific Jupiter error)
  if (errorMsg.includes('no route') || errorMsg.includes('not found') || jupiterError.code === 'NO_ROUTE_FOUND') {
    return SwapErrors.NO_ROUTE_FOUND();
  }

  // Check for quote expiry
  if (errorMsg.includes('quote') && errorMsg.includes('expir')) {
    return SwapErrors.QUOTE_EXPIRED();
  }

  // Check for invalid wallet
  if (errorMsg.includes('invalid') && errorMsg.includes('address')) {
    return SwapErrors.INVALID_WALLET();
  }

  // Default to network error for unknown Jupiter errors
  return SwapErrors.NETWORK_ERROR();
}

