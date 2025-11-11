/**
 * Simple in-memory rate limiter
 */

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of rateLimitMap.entries()) {
    if (now - data.firstRequest > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS);

/**
 * Check rate limit for a user
 * @param {string} userId - User ID
 * @param {number} maxRequests - Maximum requests per window (default: 5)
 * @returns {boolean} true if allowed, false if rate limited
 */
export function checkRateLimit(userId, maxRequests = 5) {
  const now = Date.now();
  const key = userId;
  
  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, {
      firstRequest: now,
      count: 1,
    });
    return true;
  }
  
  const data = rateLimitMap.get(key);
  
  // Reset if window expired
  if (now - data.firstRequest > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(key, {
      firstRequest: now,
      count: 1,
    });
    return true;
  }
  
  // Increment count
  data.count++;
  
  // Check if exceeded
  if (data.count > maxRequests) {
    return false;
  }
  
  return true;
}

/**
 * Get remaining requests for a user
 * @param {string} userId - User ID
 * @param {number} maxRequests - Maximum requests per window
 * @returns {number} Remaining requests
 */
export function getRemainingRequests(userId, maxRequests = 5) {
  const key = userId;
  const data = rateLimitMap.get(key);
  
  if (!data) {
    return maxRequests;
  }
  
  const now = Date.now();
  if (now - data.firstRequest > RATE_LIMIT_WINDOW_MS) {
    return maxRequests;
  }
  
  return Math.max(0, maxRequests - data.count);
}



