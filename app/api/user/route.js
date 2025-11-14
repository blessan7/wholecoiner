import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * GET /api/user
 * Get current authenticated user's profile
 * Protected route - requires authentication
 */
export async function GET(request) {
  const requestId = request.headers.get('x-request-id');
  
  try {
    // Require authentication
    const { user } = await requireAuth(request);

    logger.debug('Fetching user profile', { userId: user.id, requestId });

    // Fetch additional user data with counts
    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        privyId: true,
        email: true,
        walletAddress: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            goals: true,
            notifications: true,
          },
        },
      },
    });

    if (!userData) {
      return Response.json(
        {
          error: {
            message: 'User not found',
            code: 'USER_NOT_FOUND',
          },
        },
        { status: 404 }
      );
    }

    logger.info('User profile retrieved', { userId: user.id, requestId });

    return Response.json(
      {
        success: true,
        user: {
          id: userData.id,
          privyId: userData.privyId,
          email: userData.email,
          walletAddress: userData.walletAddress,
          createdAt: userData.createdAt,
          updatedAt: userData.updatedAt,
          stats: {
            totalGoals: userData._count.goals,
            unreadNotifications: userData._count.notifications,
          },
        },
      },
      { status: 200 }
    );
  } catch (res) {
    // fail() and errors return NextResponse; bubble it up
    if (res?.status) return res;

    logger.error('Error fetching user profile', {
      error: res?.message || 'Unknown error',
      stack: res?.stack,
      requestId,
    });

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

/**
 * PATCH /api/user
 * Update current user's profile settings
 * Protected route - requires authentication
 */
export async function PATCH(request) {
  const requestId = request.headers.get('x-request-id');

  try {
    // Require authentication
    const { user } = await requireAuth(request);

    const body = await request.json();

    logger.debug('Updating user profile', { userId: user.id, requestId });

    // Only allow updating certain fields
    const allowedUpdates = {};
    
    // Wallet address can be updated if not set
    if (body.walletAddress !== undefined) {
      allowedUpdates.walletAddress = body.walletAddress;
    }

    // Update user in database
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...allowedUpdates,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        privyId: true,
        email: true,
        walletAddress: true,
        updatedAt: true,
      },
    });

    logger.info('User profile updated', { userId: user.id, requestId });

    return Response.json(
      {
        success: true,
        user: updatedUser,
      },
      { status: 200 }
    );
  } catch (res) {
    // fail() and errors return NextResponse; bubble it up
    if (res?.status) return res;

    logger.error('Error updating user profile', {
      error: res?.message || 'Unknown error',
      stack: res?.stack,
      requestId,
    });

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

