import { PrivyClient } from '@privy-io/server-auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { AuthenticationError } from '@/lib/errors';
import { setSession } from '@/lib/session';

// Initialize Privy client
const privyClient = new PrivyClient(
  process.env.PRIVY_APP_ID,
  process.env.PRIVY_APP_SECRET
);

/**
 * POST /api/auth/login
 * Create or retrieve user based on Privy authentication
 */
export async function POST(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  try {
    logger.info('[AUTH] Login request received', { requestId });

    // Get authorization token from header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('[AUTH] Missing or invalid authorization header', { requestId });
      return Response.json(
        {
          error: {
            message: 'Authorization header required',
            code: 'AUTH_REQUIRED',
          },
        },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify the Privy access token
    let verifiedClaims;
    try {
      logger.debug('[AUTH] Verifying Privy token', { requestId });
      verifiedClaims = await privyClient.verifyAuthToken(token);
      logger.debug('[AUTH] Token verified successfully', { 
        userId: verifiedClaims.userId,
        requestId 
      });
    } catch (error) {
      logger.error('[AUTH] Token verification failed', { 
        error: error.message,
        errorName: error.name,
        requestId 
      });
      return Response.json(
        {
          error: {
            message: 'Invalid or expired token',
            code: 'INVALID_TOKEN',
          },
        },
        { status: 401 }
      );
    }

    // Extract user data from request body
    let body;
    try {
      body = await request.json();
      logger.debug('[AUTH] Request body parsed', { requestId });
    } catch (error) {
      logger.error('[AUTH] Failed to parse request body', { 
        error: error.message,
        requestId 
      });
      return Response.json(
        {
          error: {
            message: 'Invalid request body',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    const { privyId, email, walletAddress } = body;

    // Validate required fields
    if (!privyId || !email) {
      logger.warn('[AUTH] Missing required fields', { 
        hasPrivyId: !!privyId,
        hasEmail: !!email,
        requestId 
      });
      return Response.json(
        {
          error: {
            message: 'Missing required fields: privyId and email',
            code: 'VALIDATION_ERROR',
          },
        },
        { status: 400 }
      );
    }

    // Verify the privyId matches the token
    if (verifiedClaims.userId !== privyId) {
      logger.warn('[AUTH] Privy ID mismatch', {
        tokenUserId: verifiedClaims.userId,
        bodyPrivyId: privyId,
        requestId,
      });
      return Response.json(
        {
          error: {
            message: 'Token user ID does not match provided Privy ID',
            code: 'INVALID_TOKEN',
          },
        },
        { status: 401 }
      );
    }

    // Create or update user in database using upsert
    // This ensures we don't create duplicate users
    logger.debug('[AUTH] Upserting user in database', { privyId, email, requestId });
    let user;
    try {
      user = await prisma.user.upsert({
        where: { privyId },
        update: {
          email,
          walletAddress: walletAddress || undefined,
          updatedAt: new Date(),
        },
        create: {
          privyId,
          email,
          walletAddress: walletAddress || null,
        },
      });
      logger.debug('[AUTH] User upserted successfully', { 
        userId: user.id,
        requestId 
      });
    } catch (dbError) {
      logger.error('[AUTH] Database upsert failed', {
        error: dbError.message,
        errorCode: dbError.code,
        errorName: dbError.name,
        privyId,
        requestId,
      });
      
      // Handle Prisma unique constraint violations
      if (dbError.code === 'P2002') {
        return Response.json(
          {
            error: {
              message: 'User with this email or Privy ID already exists',
              code: 'DUPLICATE_USER',
            },
          },
          { status: 409 }
        );
      }
      
      throw dbError; // Re-throw to be caught by outer catch
    }

    // Safe date comparison for logging
    let isNewUser = false;
    try {
      if (user.createdAt instanceof Date && user.updatedAt instanceof Date) {
        isNewUser = user.createdAt.getTime() === user.updatedAt.getTime();
      }
    } catch (dateError) {
      logger.warn('[AUTH] Failed to determine if user is new', { 
        error: dateError.message,
        requestId 
      });
    }

    logger.info('[AUTH] User authenticated successfully', {
      userId: user.id,
      privyId: user.privyId,
      isNewUser,
      requestId,
    });

    // Set session cookie (2FA not verified yet on login)
    try {
      logger.debug('[AUTH] Setting session cookie', { userId: user.id, requestId });
      await setSession({ userId: user.id, twoFaVerified: false });
      logger.debug('[AUTH] Session cookie set successfully', { requestId });
    } catch (sessionError) {
      logger.error('[AUTH] Failed to set session cookie', {
        error: sessionError.message,
        errorStack: sessionError.stack,
        userId: user.id,
        requestId,
      });
      // Don't fail the request if session setting fails - user is still authenticated
    }

    // Return user data (excluding sensitive fields)
    // Convert Date objects to ISO strings for JSON serialization
    const responseData = {
      success: true,
      user: {
        id: user.id,
        privyId: user.privyId,
        email: user.email,
        walletAddress: user.walletAddress,
        twoFaEnabled: user.twoFaEnabled,
        createdAt: user.createdAt instanceof Date 
          ? user.createdAt.toISOString() 
          : user.createdAt,
      },
    };

    logger.info('[AUTH] Login completed successfully', { 
      userId: user.id,
      requestId 
    });

    return Response.json(responseData, { status: 200 });
  } catch (error) {
    logger.error('[AUTH] Login error', {
      error: error.message,
      errorName: error.name,
      errorStack: error.stack,
      errorCode: error.code,
      requestId,
    });

    // Handle Prisma unique constraint violations (fallback)
    if (error.code === 'P2002') {
      return Response.json(
        {
          error: {
            message: 'User with this email or Privy ID already exists',
            code: 'DUPLICATE_USER',
          },
        },
        { status: 409 }
      );
    }

    return Response.json(
      {
        error: {
          message: 'Internal server error',
          code: 'INTERNAL_ERROR',
        },
      },
      { status: 500 }
    );
  }
}

