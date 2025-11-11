/**
 * POST /api/investments/:batchId/cancel
 * Cancel an investment (only if not yet submitted to blockchain)
 */

import { requireAuth, ensureTwoFa } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { sendInvestmentNotification } from '@/lib/notifications';
import { ValidationError } from '@/lib/errors';

const CANCELABLE_STATES = ['PENDING_ONRAMP', 'ONRAMP_CONFIRMED', 'QUOTED', 'EXPIRED'];

export async function POST(request, { params }) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const { batchId } = await params;

  try {
    const { user, sess } = await requireAuth(request);
    ensureTwoFa(sess, user);

    if (!batchId) {
      return Response.json({
        success: false,
        error: {
          code: 'INVALID_BATCH_ID',
          message: 'batchId is required'
        }
      }, { status: 400 });
    }

    logger.info('Canceling investment', { batchId, userId: user.id, requestId });

    // Get all transactions for this batch
    const transactions = await prisma.transaction.findMany({
      where: { batchId },
      orderBy: { timestamp: 'asc' },
    });

    if (transactions.length === 0) {
      return Response.json({
        success: false,
        error: {
          code: 'BATCH_NOT_FOUND',
          message: 'Investment batch not found'
        }
      }, { status: 404 });
    }

    // Get goal to verify ownership
    const goal = await prisma.goal.findFirst({
      where: {
        id: transactions[0].goalId,
        userId: user.id,
      },
    });

    if (!goal) {
      return Response.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Not authorized to cancel this investment'
        }
      }, { status: 403 });
    }

    // Determine current state
    let currentState = null;
    for (const txn of transactions) {
      const state = txn.meta?.state;
      if (state && state !== 'CANCELED') {
        currentState = state;
      }
    }

    // Check if already canceled
    const isAlreadyCanceled = transactions.some(txn => txn.meta?.state === 'CANCELED');
    if (isAlreadyCanceled) {
      return Response.json({
        success: true,
        batchId,
        state: 'CANCELED',
        message: 'Investment already canceled'
      }, { status: 200 });
    }

    // Check if cancelable
    if (!currentState || !CANCELABLE_STATES.includes(currentState)) {
      const message = currentState === 'SWAP_SUBMITTED' || currentState === 'SWAP_CONFIRMED'
        ? 'Cannot cancel: transaction already submitted to blockchain'
        : `Cannot cancel investment in state: ${currentState}`;

      return Response.json({
        success: false,
        error: {
          code: 'NOT_CANCELABLE',
          message
        }
      }, { status: 422 });
    }

    // Get ONRAMP transaction to get amount for notification
    const onrampTxn = transactions.find(t => t.type === 'ONRAMP');
    const amountUsdc = onrampTxn?.amountInr || 0;

    // Update all transactions to CANCELED state
    await prisma.$transaction(async (tx) => {
      for (const txn of transactions) {
        await tx.transaction.update({
          where: { id: txn.id },
          data: {
            meta: {
              ...(txn.meta || {}),
              state: 'CANCELED',
              canceledAt: new Date().toISOString(),
              canceledBy: user.id,
            },
          },
        });
      }
    });

    logger.info('Investment canceled', {
      batchId,
      previousState: currentState,
      userId: user.id,
      requestId
    });

    // Send notification
    await sendInvestmentNotification(batchId, 'CANCELED', {
      amountUsdc,
    });

    return Response.json({
      success: true,
      batchId,
      state: 'CANCELED',
      message: 'Investment canceled successfully. Your funds remain in your wallet.',
    }, { status: 200 });

  } catch (error) {
    logger.error('Failed to cancel investment', {
      error: error.message,
      batchId,
      requestId
    });

    if (error instanceof ValidationError || error.statusCode) {
      return Response.json({
        success: false,
        error: {
          code: error.code || 'VALIDATION_ERROR',
          message: error.message
        }
      }, { status: error.statusCode || 422 });
    }

    return Response.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to cancel investment'
      }
    }, { status: 500 });
  }
}


