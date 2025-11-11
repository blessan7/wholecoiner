import bcrypt from 'bcryptjs';
import { prisma } from './prisma.js';

/**
 * Hash a PIN using bcrypt
 * @param {string} pin - The PIN to hash
 * @returns {Promise<string>} Hashed PIN
 */
export async function hashPin(pin) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(pin, salt);
}

/**
 * Verify a PIN against a hash
 * @param {string} pin - The PIN to verify
 * @param {string} hash - The hash to compare against
 * @returns {Promise<boolean>} True if PIN matches
 */
export async function verifyPin(pin, hash) {
  if (!hash) return false;
  return bcrypt.compare(pin, hash);
}

/**
 * Validate PIN format (4-6 digits)
 * @param {string} pin - The PIN to validate
 * @returns {boolean} True if valid format
 */
export function validatePin(pin) {
  return typeof pin === 'string' && /^[0-9]{4,6}$/.test(pin);
}

// Rate limiting constants
const MAX_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 10;

/**
 * Record a failed 2FA attempt and lock user if threshold exceeded
 * @param {string} userId - User ID
 */
export async function recordFailedAttempt(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFaFailedAttempts: true },
  });

  const attempts = (user?.twoFaFailedAttempts || 0) + 1;
  const updateData = { twoFaFailedAttempts: attempts };

  // Lock user if max attempts reached
  if (attempts >= MAX_ATTEMPTS) {
    const lockUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000);
    updateData.twoFaLockedUntil = lockUntil;
    updateData.twoFaFailedAttempts = 0; // Reset counter after lock
  }

  await prisma.user.update({
    where: { id: userId },
    data: updateData,
  });
}

/**
 * Check if user is currently locked out
 * @param {Object} user - User object with twoFaLockedUntil field
 * @returns {boolean} True if user is locked
 */
export function isLocked(user) {
  return !!(user.twoFaLockedUntil && user.twoFaLockedUntil > new Date());
}

