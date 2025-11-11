'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import TwoFALocked from '@/components/TwoFALocked';

/**
 * 2FA Locked Page Content
 * Wrapped in Suspense to handle useSearchParams
 */
function TwoFALockedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const lockoutMinutes = parseInt(searchParams.get('minutes')) || 10;

  const handleUnlock = () => {
    // After lockout expires, redirect back to verify page
    router.push('/auth/2fa/verify');
  };

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col items-center justify-center p-4">
      <TwoFALocked lockoutMinutes={lockoutMinutes} onUnlock={handleUnlock} />
    </div>
  );
}

/**
 * 2FA Locked Page
 * Route: /auth/2fa/locked?minutes=10
 * Shown when user exceeds failed PIN attempts
 */
export default function TwoFALockedPage() {
  return (
    <Suspense fallback={
      <div className="relative flex h-auto min-h-screen w-full flex-col items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
        </div>
      </div>
    }>
      <TwoFALockedContent />
    </Suspense>
  );
}

