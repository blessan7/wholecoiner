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
  horizontal: 'flex items-center gap-3 px-4 py-2',
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
      </div>
    </div>
  );
}

