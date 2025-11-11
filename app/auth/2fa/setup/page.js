'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import TwoFASetup from '@/components/TwoFASetup';
import UserProfileBadge from '@/components/UserProfileBadge';
import { getWalletAddressFromPrivy } from '@/lib/user';

/**
 * 2FA Setup Page
 * Route: /auth/2fa/setup
 * For first-time users to set up their PIN
 */
export default function TwoFASetupPage() {
  const router = useRouter();
  const { user } = usePrivy();

  const avatarUrl = useMemo(() => {
    if (!user?.linkedAccounts || !Array.isArray(user.linkedAccounts)) return null;
    const googleAccount = user.linkedAccounts.find(
      (account) => account.type === 'google_oauth'
    );
    return googleAccount?.picture ?? null;
  }, [user?.linkedAccounts]);

  const walletAddress = getWalletAddressFromPrivy(user);

  const displayName = useMemo(() => {
    if (user?.email?.address) {
      const [namePart] = user.email.address.split('@');
      if (namePart) {
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
      }
    }

    if (Array.isArray(user?.linkedAccounts)) {
      const emailAccount = user.linkedAccounts.find(
        (account) => account.type === 'email' && account.address
      );
      if (emailAccount?.address) {
        const [namePart] = emailAccount.address.split('@');
        if (namePart) {
          return namePart.charAt(0).toUpperCase() + namePart.slice(1);
        }
      }
    }

    if (walletAddress) {
      return walletAddress.slice(0, 6).toUpperCase();
    }

    return 'Wholecoiner';
  }, [user?.email?.address, user?.linkedAccounts, walletAddress]);

  const handleSuccess = () => {
    router.push('/auth/2fa/verify');
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
        <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
          <div className="hidden sm:inline-flex px-3 py-1 rounded-full border border-[var(--border-subtle)]">
            Secured 2FA
          </div>
          <UserProfileBadge
            displayName={displayName}
            walletAddress={walletAddress}
            avatarUrl={avatarUrl}
            size="sm"
            orientation="vertical"
            className="bg-[#22160d] border-none shadow-none px-3 py-3"
          />
        </div>
      </header>

      <main className="flex-1 w-full flex">
        <section className="m-auto w-full max-w-md px-4 sm:px-6">
          <TwoFASetup onSuccess={handleSuccess} />
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

