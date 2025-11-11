import { ok, fail } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { requireAuth, markTwoFaVerified } from '@/lib/auth';
import { verifyPin, validatePin, isLocked, recordFailedAttempt } from '@/lib/2fa';

/**
 * POST /api/auth/2fa/verify
 * Verify 2FA PIN for authenticated user
 */
export async function POST(req) {
  try {
    const { user } = await requireAuth(req);

    if (!user.twoFaEnabled || !user.twoFaPinHash) {
      return fail('2FA not set up', 400);
    }
    
    if (isLocked(user)) {
      return fail('Account locked due to failed attempts. Try later.', 423, {
        retryAfterMinutes: 10,
      });
    }

    const { pin } = await req.json();
    
    if (!validatePin(pin)) {
      return fail('Invalid PIN format', 400);
    }

    const okMatch = await verifyPin(pin, user.twoFaPinHash);
    
    if (!okMatch) {
      await recordFailedAttempt(user.id);
      return fail('Invalid PIN', 403);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { 
        twoFaVerifiedAt: new Date(), 
        twoFaFailedAttempts: 0, 
        twoFaLockedUntil: null 
      },
    });

    // Upgrade the session: twoFaVerified = true
    await markTwoFaVerified(user.id);

    return ok({ message: '2FA verified' });
  } catch (res) {
    return res?.status ? res : fail('Unexpected error', 500);
  }
}

