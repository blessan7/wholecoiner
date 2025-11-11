/**
 * Authentication flow logic for 2FA
 * Determines which screen/page to show based on user's 2FA status
 */

/**
 * Determine which 2FA screen to show
 * @param {Object} user - User object from database
 * @param {Object} session - Session object with JWT claims
 * @returns {string} - Route to redirect to ('setup' | 'verify' | 'locked' | 'dashboard')
 */
export function get2FAScreen(user, session) {
  // If user doesn't have 2FA enabled, show setup
  if (!user.twoFaEnabled) {
    return '/auth/2fa/setup';
  }

  // If user is locked out, show locked screen
  if (user.twoFaLockedUntil && new Date(user.twoFaLockedUntil) > new Date()) {
    return '/auth/2fa/locked';
  }

  // If 2FA is enabled but not verified in this session, show verify
  if (!session?.twoFaVerified) {
    return '/auth/2fa/verify';
  }

  // All checks passed, allow access to dashboard
  return '/dashboard';
}

/**
 * Check if user needs 2FA verification
 * @param {Object} user - User object
 * @param {Object} session - Session object
 * @returns {boolean}
 */
export function needs2FAVerification(user, session) {
  return user.twoFaEnabled && !session?.twoFaVerified;
}

/**
 * Check if user is locked out
 * @param {Object} user - User object
 * @returns {boolean}
 */
export function isUserLocked(user) {
  return !!(user.twoFaLockedUntil && new Date(user.twoFaLockedUntil) > new Date());
}

/**
 * Get minutes remaining in lockout
 * @param {Object} user - User object
 * @returns {number} - Minutes remaining (0 if not locked)
 */
export function getLockoutMinutesRemaining(user) {
  if (!user.twoFaLockedUntil) return 0;
  
  const lockoutEnd = new Date(user.twoFaLockedUntil);
  const now = new Date();
  
  if (lockoutEnd <= now) return 0;
  
  const msRemaining = lockoutEnd - now;
  return Math.ceil(msRemaining / (1000 * 60));
}

