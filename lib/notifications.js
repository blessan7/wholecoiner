/**
 * Notification helper functions for investment events
 */

import { prisma } from './prisma';
import { logger } from './logger';

/**
 * Create a notification for a user
 * @param {string} userId - User ID
 * @param {string} type - Notification type (e.g., 'ONRAMP_CONFIRMED', 'SWAP_CONFIRMED', etc.)
 * @param {string} message - Notification message
 * @param {Object} meta - Optional metadata
 * @returns {Promise<Object>} Created notification
 */
export async function createNotification(userId, type, message, meta = null) {
  try {
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        message,
        meta: meta || undefined,
      },
    });

    logger.info('Notification created', { 
      notificationId: notification.id, 
      userId, 
      type 
    });

    return notification;
  } catch (error) {
    logger.error('Failed to create notification', { 
      error: error.message, 
      userId, 
      type 
    });
    throw error;
  }
}

/**
 * Send investment-related notification
 * @param {string} batchId - Investment batch ID
 * @param {string} eventType - Event type (ONRAMP_CONFIRMED, QUOTED, SWAP_SUBMITTED, etc.)
 * @param {Object} data - Event data
 * @returns {Promise<Object>} Created notification
 */
export async function sendInvestmentNotification(batchId, eventType, data) {
  try {
    // Get goal and user from transactions
    const transaction = await prisma.transaction.findFirst({
      where: { batchId },
      include: { goal: { include: { user: true } } },
    });

    if (!transaction) {
      logger.warn('Transaction not found for notification', { batchId });
      return null;
    }

    const { goal, goal: { user } } = transaction;
    const userId = user.id;

    let message = '';
    let notificationType = 'INVESTMENT_EVENT';

    switch (eventType) {
      case 'ONRAMP_CONFIRMED':
        message = `Funds received: ${data.amountUsdc || 0} USDC. Ready to swap to ${goal.coin}.`;
        notificationType = 'ONRAMP_CONFIRMED';
        break;

      case 'QUOTED':
        const expiresIn = data.expiresIn || 30;
        message = `Swap quote ready: ${data.inputAmount || 0} USDC → ${data.outputAmount || 0} ${goal.coin} (expires in ~${expiresIn}s).`;
        notificationType = 'QUOTED';
        break;

      case 'SWAP_SIGNED':
        message = `Swap signed. Submitting to Solana...`;
        notificationType = 'SWAP_SIGNED';
        break;

      case 'SWAP_SUBMITTED':
        message = `Swap submitted. Finalizing on Solana…`;
        notificationType = 'SWAP_SUBMITTED';
        break;

      case 'SWAP_CONFIRMED':
        const progress = data.progressPercentage || 0;
        message = `Success! +${data.outputAmount || 0} ${goal.coin} added to your goal. Progress: ${progress.toFixed(1)}%.`;
        notificationType = 'SWAP_CONFIRMED';
        break;

      case 'EXPIRED':
        message = `Quote expired. Re-quote to get a fresh price.`;
        notificationType = 'EXPIRED';
        break;

      case 'FAILED':
        const reason = data.reason || 'Unknown error';
        message = `Swap failed: ${reason}. Please try again.`;
        notificationType = 'FAILED';
        break;

      case 'CANCELED':
        message = `Investment canceled. Your ${data.amountUsdc || 0} USDC remains in your wallet.`;
        notificationType = 'CANCELED';
        break;

      default:
        message = data.message || `Investment event: ${eventType}`;
        notificationType = 'INVESTMENT_EVENT';
    }

    return await createNotification(userId, notificationType, message, {
      batchId,
      eventType,
      goalId: goal.id,
      ...data,
    });
  } catch (error) {
    logger.error('Failed to send investment notification', { 
      error: error.message, 
      batchId, 
      eventType 
    });
    // Don't throw - notifications are not critical
    return null;
  }
}

/**
 * Get user notifications
 * @param {string} userId - User ID
 * @param {Object} options - Query options (limit, status, etc.)
 * @returns {Promise<Array>} List of notifications
 */
export async function getUserNotifications(userId, options = {}) {
  const { limit = 50, status = null } = options;

  const where = { userId };
  if (status) {
    where.status = status;
  }

  return await prisma.notification.findMany({
    where,
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
}

/**
 * Mark notification as read
 * @param {string} notificationId - Notification ID
 * @param {string} userId - User ID (for authorization)
 * @returns {Promise<Object>} Updated notification
 */
export async function markNotificationAsRead(notificationId, userId) {
  // Verify ownership
  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });

  if (!notification) {
    throw new Error('Notification not found or unauthorized');
  }

  return await prisma.notification.update({
    where: { id: notificationId },
    data: { status: 'READ' },
  });
}











