'use client';

import { useRouter } from 'next/navigation';
import TwoFAVerify from '@/components/TwoFAVerify';

/**
 * 2FA Verification Page
 * Route: /auth/2fa/verify
 * For returning users to verify their PIN
 */
export default function TwoFAVerifyPage() {
  const router = useRouter();

  const handleSuccess = () => {
    router.push('/dashboard');
  };

  const handleLocked = (retryAfterMinutes) => {
    router.push(`/auth/2fa/locked?minutes=${retryAfterMinutes}`);
  };

  return (
    <div className="min-h-screen w-full bg-[var(--bg-main)] bg-gradient-to-b from-[var(--bg-main)] via-[#1a1008] to-[#120904] text-[var(--text-primary)] flex flex-col items-center overflow-hidden px-4">
      <header className="w-full max-w-5xl px-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-[var(--accent)] flex items-center justify-center">
            <div className="w-4 h-4 rounded-md bg-[var(--bg-main)]" />
          </div>
          <span className="font-semibold tracking-tight text-sm sm:text-base">
            Wholecoiner
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <div className="px-3 py-1 rounded-full border border-[var(--border-subtle)]">
            Secured 2FA
          </div>
        </div>
      </header>

      <main className="flex-1 w-full flex">
        <section className="m-auto w-full max-w-md px-4 sm:px-6">
          <TwoFAVerify onSuccess={handleSuccess} onLocked={handleLocked} />
        </section>
      </main>

      <footer className="w-full max-w-5xl mx-auto px-4 pb-5 flex items-center justify-between text-[10px] text-[#7f7364]">
        <span>© {new Date().getFullYear()} Wholecoiner. All rights reserved.</span>
        <div className="flex gap-4">
          <button className="hover:text-[var(--accent)] transition-colors">Privacy</button>
          <button className="hover:text-[var(--accent)] transition-colors">Security</button>
        </div>
      </footer>
    </div>
  );
}

