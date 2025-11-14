'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { shortenAddress } from '@/lib/user';

const AVATAR_SIZES = {
  sm: { box: 'h-8 w-8 text-xs', dimension: 32 },
  md: { box: 'h-10 w-10 text-sm', dimension: 40 },
};

const CONTAINER_BASE =
  'rounded-2xl border border-[#2a2016] bg-[#17110b]/90 text-[var(--text-primary)] shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-sm transition-colors';

const ORIENTATION_STYLES = {
  horizontal: 'flex items-center justify-between gap-3 px-4 py-2',
  vertical: 'flex flex-col items-center gap-3 px-5 py-4 text-center',
};

const WALLET_LABEL_STYLES = {
  horizontal: 'text-[0.58rem] uppercase tracking-[0.24em] text-[var(--text-secondary)]',
  vertical: 'text-[0.62rem] uppercase tracking-[0.28em] text-[var(--text-secondary)]',
};

const NAME_STYLES = {
  sm: 'text-sm font-semibold',
  md: 'text-base font-semibold',
};

export default function UserProfileBadge({
  displayName = 'Wholecoiner',
  walletAddress,
  avatarUrl,
  orientation = 'horizontal',
  size = 'md',
  showCopy = true,
  onLogout,
  className = '',
}) {
  const [copied, setCopied] = useState(false);

  const initials = useMemo(() => {
    if (displayName) return displayName.trim().charAt(0).toUpperCase();
    if (walletAddress) return walletAddress.charAt(0).toUpperCase();
    return 'U';
  }, [displayName, walletAddress]);

  const { box: avatarBoxClass, dimension } = AVATAR_SIZES[size] ?? AVATAR_SIZES.md;
  const containerClasses = `${CONTAINER_BASE} ${ORIENTATION_STYLES[orientation] ?? ORIENTATION_STYLES.horizontal} ${className}`.trim();

  const walletLabelClass = WALLET_LABEL_STYLES[orientation] ?? WALLET_LABEL_STYLES.horizontal;
  const nameClass = NAME_STYLES[size] ?? NAME_STYLES.md;

  const handleCopy = async () => {
    if (!showCopy || !walletAddress || typeof navigator === 'undefined') return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy wallet address', error);
    }
  };

  // Horizontal layout: avatar + info on left, logout on right
  if (orientation === 'horizontal') {
    return (
      <div className={containerClasses}>
        {/* Left side: Avatar + Name/Wallet Info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Avatar */}
          <div className={`flex-shrink-0 flex items-center justify-center overflow-hidden rounded-full bg-[#22160d] ${avatarBoxClass}`}>
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={`${displayName} avatar`}
                width={dimension}
                height={dimension}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span className="font-semibold text-[var(--accent)]">{initials}</span>
            )}
          </div>

          {/* Name and Wallet Info */}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className={`${nameClass} truncate`}>{displayName}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-[var(--text-secondary)] truncate">
                {walletAddress ? shortenAddress(walletAddress, size === 'sm' ? 3 : 4) : 'Not connected'}
              </span>
              {showCopy && walletAddress && (
                <button
                  type="button"
                  onClick={handleCopy}
                  className="flex-shrink-0 rounded-full border border-[#2a2016] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)] hover:border-[var(--accent)]/30"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right side: Logout Button */}
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="flex-shrink-0 flex items-center justify-center h-8 w-8 rounded-lg border border-[#2a2016] text-[var(--text-secondary)] transition-all hover:text-[var(--accent)] hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5 active:scale-95"
            aria-label="Log out"
            title="Log out"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // Vertical layout (fallback for any vertical usage)
  return (
    <div className={containerClasses}>
      <div className={`flex items-center justify-center overflow-hidden rounded-full bg-[#22160d] ${avatarBoxClass}`}>
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={`${displayName} avatar`}
            width={dimension}
            height={dimension}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (
          <span className="font-semibold text-[var(--accent)]">{initials}</span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <span className={nameClass}>{displayName}</span>
        <div className="flex flex-col gap-1">
          <span className={walletLabelClass}>Wallet</span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-[var(--text-secondary)] truncate">
              {walletAddress ? shortenAddress(walletAddress, size === 'sm' ? 3 : 4) : 'Not connected'}
            </span>
            {showCopy && walletAddress && (
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-full border border-[#2a2016] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
        </div>
        {onLogout && (
          <button
            type="button"
            onClick={onLogout}
            className="mt-2 w-fit rounded-full border border-[#2a2016] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
          >
            Log out
          </button>
        )}
      </div>
    </div>
  );
}

