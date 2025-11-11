/**
 * Client-side API helpers for 2FA operations
 */

/**
 * Set up 2FA PIN for the first time
 * @param {string} pin - 6-digit PIN
 * @returns {Promise<{success: boolean, data?: any, error?: string}>}
 */
export async function setup2FA(pin) {
  try {
    const response = await fetch('/api/auth/2fa/setup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies
      body: JSON.stringify({ pin }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error?.message || 'Failed to set up 2FA',
      };
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Network error',
    };
  }
}

/**
 * Verify 2FA PIN
 * @param {string} pin - 6-digit PIN
 * @returns {Promise<{success: boolean, data?: any, error?: string, remainingAttempts?: number, locked?: boolean, retryAfterMinutes?: number}>}
 */
export async function verify2FA(pin) {
  try {
    const response = await fetch('/api/auth/2fa/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies
      body: JSON.stringify({ pin }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Handle lockout (423)
      if (response.status === 423) {
        return {
          success: false,
          locked: true,
          retryAfterMinutes: data.error?.retryAfterMinutes || 10,
          error: data.error?.message || 'Account locked',
        };
      }

      // Handle invalid PIN (403)
      if (response.status === 403) {
        return {
          success: false,
          remainingAttempts: data.error?.remainingAttempts,
          error: data.error?.message || 'Invalid PIN',
        };
      }

      return {
        success: false,
        error: data.error?.message || 'Verification failed',
      };
    }

    return {
      success: true,
      data: data.data,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Network error',
    };
  }
}

/**
 * Check user's 2FA status
 * @returns {Promise<{twoFaEnabled: boolean, twoFaVerified: boolean}>}
 */
export async function get2FAStatus() {
  try {
    const response = await fetch('/api/user', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to get user status');
    }

    const data = await response.json();
    
    return {
      twoFaEnabled: data.user?.twoFaEnabled || false,
      twoFaVerified: false, // This would come from session token in real implementation
    };
  } catch (error) {
    console.error('Error checking 2FA status:', error);
    return {
      twoFaEnabled: false,
      twoFaVerified: false,
    };
  }
}

