import { requireAuth, ensureTwoFa } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { groupByBatchId } from '@/lib/history';
import { getTokenMint } from '@/lib/tokens';
import { AuthenticationError, AuthorizationError, ValidationError } from '@/lib/errors';

/**
 * GET /api/history
 * Get transaction history grouped by batch (onramp + swap pairs)
 * 
 * Query params:
 * - goalId (optional): Filter by specific goal
 * - type (optional): Filter by transaction type (ONRAMP | SWAP)
 * - coin (optional): Filter by coin (BTC | ETH | SOL)
 * - startDate (optional): ISO date string
 * - endDate (optional): ISO date string
 * - after (optional): Cursor for pagination (ISO timestamp)
 * - limit (optional): Results per page (default: 20)
 */
export async function GET(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;

  try {
    const { user: authUser, sess } = await requireAuth(request);
    user = authUser;
    ensureTwoFa(sess, user);

    const { searchParams } = new URL(request.url);
    const goalId = searchParams.get('goalId');
    const type = searchParams.get('type');
    const coin = searchParams.get('coin');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const after = searchParams.get('after');
    const limit = parseInt(searchParams.get('limit') || '20');

    // Validate limit
    if (limit < 1 || limit > 100) {
      throw new ValidationError('limit must be between 1 and 100');
    }

    // Validate type if provided
    if (type && !['ONRAMP', 'SWAP'].includes(type)) {
      throw new ValidationError('type must be either ONRAMP or SWAP');
    }

    // Build where clause with filters (server-side)
    const where = {
      goal: { userId: user.id },
    };

    if (goalId) {
      // Validate goal ownership
      const goal = await prisma.goal.findFirst({
        where: { id: goalId, userId: user.id },
      });

      if (!goal) {
        throw new ValidationError('Goal not found or access denied');
      }

      where.goalId = goalId;
    }

    if (type) {
      where.type = type;
    }

    if (coin) {
      try {
        const tokenInfo = getTokenMint(coin);
        where.tokenMint = tokenInfo.mint;
      } catch (error) {
        throw new ValidationError(`Invalid coin: ${coin}`);
      }
    }

    // Date range filters
    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate);
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate);
      }
    }

    // Cursor pagination: fetch records before the cursor
    if (after) {
      if (!where.timestamp) {
        where.timestamp = {};
      }
      where.timestamp.lt = new Date(after);
    }

    logger.info('Fetching transaction history', {
      userId: user.id,
      goalId,
      type,
      coin,
      limit,
      requestId,
    });

    // Fetch transactions with server-side sort
    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit + 1, // Fetch one extra to determine hasMore
      include: { goal: true },
    });

    const hasMore = transactions.length > limit;
    const results = hasMore ? transactions.slice(0, limit) : transactions;

    // Group by batchId
    const grouped = groupByBatchId(results);

    logger.info('Transaction history fetched', {
      userId: user.id,
      totalTransactions: transactions.length,
      groupedBatches: grouped.length,
      hasMore,
      requestId,
    });

    return Response.json({
      success: true,
      history: grouped,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore && results.length > 0
          ? results[results.length - 1].timestamp.toISOString()
          : null,
      },
    }, { status: 200 });

  } catch (error) {
    logger.error('Failed to fetch transaction history', {
      error: error.message,
      errorName: error.name,
      userId: user?.id,
      requestId,
    });

    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
      return Response.json(
        {
          success: false,
          error: {
            code: error.code || 'AUTH_ERROR',
            message: error.message,
          },
        },
        { status: error.statusCode || 401 }
      );
    }

    if (error instanceof ValidationError) {
      return Response.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
          },
        },
        { status: error.statusCode }
      );
    }

    return Response.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch transaction history',
      },
    }, { status: 500 });
  }
}

