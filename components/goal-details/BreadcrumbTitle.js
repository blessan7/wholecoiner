import Link from 'next/link';
import { motion } from 'framer-motion';

import AssetBadge from '@/components/goal-details/AssetBadge';
import { STATUS_META, STATUS_ORDER, formatDate } from '@/lib/goalFormatting';
import { fadeInUp } from '@/lib/motion';

const ASSET_ACCENTS = {
  BTC: '#f7931a',
  ETH: '#627eea',
  SOL: '#14f195',
};

const resolveStatus = (statusKey) => {
  if (STATUS_META[statusKey]) {
    return STATUS_META[statusKey];
  }
  const fallback = STATUS_ORDER.find((state) => STATUS_META[state]);
  return fallback ? STATUS_META[fallback] : STATUS_META.ACTIVE;
};

export default function BreadcrumbTitle({ asset, goalName, status, createdAt }) {
  const statusMeta = resolveStatus(status);
  const accent = ASSET_ACCENTS[asset?.toUpperCase()] ?? 'var(--accent)';

  return (
    <motion.section
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-6"
    >
      <nav className="flex items-center gap-2 text-[11px] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
        <Link href="/goals" className="hover:text-[var(--accent)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70">
          Goals
        </Link>
        <span>•</span>
        <span className="text-[var(--text-primary)]">Goal Details</span>
      </nav>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <AssetBadge asset={asset} accent={accent} />
            <div className="flex flex-col gap-2">
              <h1 className="font-headline text-3xl uppercase tracking-[0.12em] text-[var(--text-primary)] sm:text-4xl">
                {goalName}
              </h1>
              <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.22em] text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#2b231b] bg-[#1b120a]/80 px-3 py-1 text-[11px] font-semibold text-[var(--text-secondary)]">
                  <span className={`h-2 w-2 rounded-full ${statusMeta.dotClass}`} />
                  {statusMeta.label}
                </span>
                <span>Created {formatDate(createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>

        <Link
          href="/goals"
          className="btn-ghost flex items-center gap-2 rounded-full px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em]"
        >
          <span className="material-symbols-outlined text-base">arrow_back</span>
          Back to Goals
        </Link>
      </div>
    </motion.section>
  );
}

