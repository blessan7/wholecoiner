import { requireAuth, ensureTwoFa } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { ValidationError, AuthenticationError, AuthorizationError } from '@/lib/errors';

export async function GET(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;

  try {
    const { user: authUser, sess } = await requireAuth(request);
    user = authUser;
    ensureTwoFa(sess, user);

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get('goalId');
    const limit = parseInt(searchParams.get('limit') || '10');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Validate required parameters
    if (!goalId) {
      throw new ValidationError('Missing required parameter: goalId');
    }

    // Validate goalId belongs to the user
    const goal = await prisma.goal.findFirst({
      where: { id: goalId, userId: user.id },
    });

    if (!goal) {
      throw new ValidationError('Goal not found');
    }

    // Fetch transactions for this goal
    const [transactions, totalCount] = await Promise.all([
      prisma.transaction.findMany({
        where: { goalId },
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.transaction.count({
        where: { goalId },
      }),
    ]);

    logger.info('Transactions fetched', {
      goalId,
      userId: user.id,
      count: transactions.length,
      total: totalCount,
      requestId,
    });

    return Response.json({
      success: true,
      transactions,
      pagination: {
        total: totalCount,
        limit,
        offset,
        hasMore: offset + transactions.length < totalCount,
      },
    }, { status: 200 });

  } catch (error) {
    logger.error('Failed to fetch transactions', {
      error: error.message,
      errorName: error.name,
      userId: user?.id,
      requestId,
    });

    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }

    if (error instanceof ValidationError) {
      return Response.json({ success: false, error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }

    return Response.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch transactions'
      }
    }, { status: 500 });
  }
}

