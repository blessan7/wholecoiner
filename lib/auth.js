/**
 * Authentication utilities with Privy integration
 */

import { PrivyClient } from '@privy-io/server-auth';
import { AuthenticationError, AuthorizationError } from './errors.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { getSession, setSession } from './session.js';

// Initialize Privy client
const privyClient = new PrivyClient(
  process.env.PRIVY_APP_ID,
  process.env.PRIVY_APP_SECRET
);

/**
 * Verify session/JWT token using Privy
 * @param {Request} request - Next.js request object
 * @returns {Promise<{userId: string, email: string, privyId: string}>}
 */
export async function verifySession(request) {
  const authHeader = request.headers.get('authorization');

  if (!authHeader) {
    throw new AuthenticationError('No authorization header provided');
  }

  if (!authHeader.startsWith('Bearer ')) {
    throw new AuthenticationError('Invalid authorization header format');
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    // Verify the Privy access token
    const verifiedClaims = await privyClient.verifyAuthToken(token);
    
    logger.debug('Token verified successfully', { 
      userId: verifiedClaims.userId 
    });

    // Get user from database to ensure they exist
    const user = await prisma.user.findUnique({
      where: { privyId: verifiedClaims.userId },
      select: {
        id: true,
        privyId: true,
        email: true,
      },
    });

    if (!user) {
      throw new AuthenticationError('User not found in database');
    }

    return {
      userId: user.id,
      privyId: user.privyId,
      email: user.email,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }
    
    logger.error('Token verification failed', {
      error: error.message,
    });
    
    throw new AuthenticationError('Invalid or expired token');
  }
}

/**
 * Require authentication - verify Privy token and get session
 * @param {Request} request - Optional Request object for cookie reading
 * @returns {Promise<{user: Object, sess: Object}>}
 * @throws {Response} - 401 response if authentication fails
 */
export async function requireAuth(request = null) {
  const sess = await getSession(request);
  if (!sess?.sub) {
    throw new AuthenticationError('Session not found');
  }
  
  const user = await prisma.user.findUnique({ 
    where: { id: sess.sub },
    select: {
      id: true,
      privyId: true,
      email: true,
      walletAddress: true,
    },
  });
  
  if (!user) {
    throw new AuthenticationError('User not found');
  }
  
  return { user, sess };
}

/**
 * Ensure the authenticated user is an administrator.
 * Uses environment allowlists for flexibility during bring-up.
 *
 * ADMIN_EMAIL_ALLOWLIST - comma-separated list of emails
 * ADMIN_USERID_ALLOWLIST - comma-separated list of database user IDs
 */
export function ensureAdmin(user) {
  const emailAllowlist = (process.env.ADMIN_EMAIL_ALLOWLIST || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const idAllowlist = (process.env.ADMIN_USERID_ALLOWLIST || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const isEmailAllowed =
    user?.email && emailAllowlist.includes(user.email.toLowerCase());
  const isIdAllowed = user?.id && idAllowlist.includes(user.id);

  if (!isEmailAllowed && !isIdAllowed) {
    throw new AuthorizationError('Administrator access required');
  }
}



