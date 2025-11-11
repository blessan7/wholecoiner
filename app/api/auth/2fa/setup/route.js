import { ok, fail } from '@/lib/http';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { hashPin, validatePin } from '@/lib/2fa';

/**
 * POST /api/auth/2fa/setup
 * Set up 2FA PIN for authenticated user
 */
export async function POST(req) {
  try {
    const { user } = await requireAuth(req);

    const { pin } = await req.json();
    
    if (!validatePin(pin)) {
      return fail('Invalid PIN format (4-6 digits)', 400);
    }

    const twoFaPinHash = await hashPin(pin);
    
    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFaEnabled: true,
        twoFaPinHash,
        twoFaFailedAttempts: 0,
        twoFaLockedUntil: null,
        twoFaVerifiedAt: null,
      },
    });

    return ok({ message: '2FA enabled' });
  } catch (res) {
    // fail() returns a NextResponse; bubble it up
    return res?.status ? res : fail('Unexpected error', 500);
  }
}

