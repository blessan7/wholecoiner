import { useMemo } from 'react';
import { motion } from 'framer-motion';

import ProgressBar from '@/components/ProgressBar';
import {
  FREQUENCY_LABELS,
  STATUS_META,
  STATUS_ORDER,
  deriveProgress,
  formatCurrencyUSD,
  formatDate,
  formatNumber,
} from '@/lib/goalFormatting';
import { fadeInUp } from '@/lib/motion';

const ASSET_META = {
  BTC: { label: 'Bitcoin', accent: '#f7931a' },
  ETH: { label: 'Ethereum', accent: '#627eea' },
  SOL: { label: 'Solana', accent: '#14f195' },
};

const buildStatus = (goalStatus) => {
  if (STATUS_META[goalStatus]) {
    return { key: goalStatus, ...STATUS_META[goalStatus] };
  }

  const fallbackKey = STATUS_ORDER.find((state) => STATUS_META[state]) || 'ACTIVE';
  return { key: fallbackKey, ...STATUS_META[fallbackKey] };
};

export default function GoalListCard({ goal, onNavigate, onEdit, onPause }) {
  const assetKey = goal.coin?.toUpperCase() ?? 'OTHER';
  const asset = ASSET_META[assetKey] ?? { label: goal.coin ?? 'Digital Asset', accent: '#ff9f1c' };
  const status = buildStatus(goal.status);
  const progress = deriveProgress(goal);

  const summaryData = useMemo(
    () => [
      {
        label: 'Target Amount',
        value: `${formatNumber(goal.targetAmount, 4)} ${goal.coin}`,
      },
      {
        label: 'Invested So Far',
        value: `${formatNumber(goal.investedAmount, 4)} ${goal.coin}`,
      },
      {
        label: 'Contribution Plan',
        value: `${formatCurrencyUSD(goal.amountPerInterval)} • ${
          FREQUENCY_LABELS[goal.frequency] ?? goal.frequency ?? '—'
        }`,
      },
      {
        label: 'Created On',
        value: formatDate(goal.createdAt, { day: 'numeric', month: 'short', year: 'numeric' }),
      },
    ],
    [goal]
  );

  const handleEdit = () => {
    onEdit?.(goal.id);
  };

  const handlePause = () => {
    onPause?.(goal.id);
  };

  const handleCardClick = (event) => {
    if (event.target.closest('button, a')) return;
    // Card click disabled - no navigation to details page
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      // Card keyboard navigation disabled - no navigation to details page
    }
  };

  return (
    <motion.article
      variants={fadeInUp}
      tabIndex={0}
      role="group"
      onClick={handleCardClick}
      onKeyDown={handleKeyDown}
      className="group relative overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[#17110b]/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.55)] transition hover:border-[var(--accent)]/50 hover:shadow-[0_24px_70px_rgba(255,159,28,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/80 sm:p-8"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-48 w-48 rounded-full"
        style={{ background: `radial-gradient(circle, ${asset.accent}15 0%, transparent 65%)` }}
      />
      <div className="pointer-events-none absolute bottom-6 right-6 text-[6rem] font-headline uppercase tracking-[0.4em] text-white/5">
        {assetKey}
      </div>

      <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-secondary)]">
              {asset.label} Goal
            </span>
            <h3 className="font-headline text-2xl font-semibold text-[var(--text-primary)] sm:text-[2rem]">
              Accumulate {formatNumber(goal.targetAmount, 4)} {goal.coin}
            </h3>
          </div>

          <dl className="grid grid-cols-1 gap-4 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
            {summaryData.map((item) => (
              <div key={item.label} className="flex flex-col gap-1">
                <dt className="text-[11px] uppercase tracking-[0.22em]">{item.label}</dt>
                <dd className="text-base font-medium text-[var(--text-primary)] tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex w-full flex-col gap-4 sm:w-[220px]">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-[#2b231b] bg-[#1b120a]/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--text-secondary)]">
            <span className={`h-2 w-2 rounded-full ${status.dotClass}`} />
            {status.label}
          </span>

          <ProgressBar value={progress} label={`${progress.toFixed(1)}%`} ariaLabel={`Goal ${goal.coin} progress`} />

          <div className="hidden w-full flex-col gap-3 pt-2 text-sm font-medium uppercase tracking-[0.18em] text-[var(--text-secondary)] sm:flex">
            <button
              type="button"
              onClick={handleEdit}
              className="flex items-center justify-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 transition hover:border-[var(--accent)]/70 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/80"
            >
              <span className="material-symbols-outlined text-base">edit</span>
              Edit Goal
            </button>
            <button
              type="button"
              onClick={handlePause}
              className="flex items-center justify-center gap-2 rounded-full border border-[var(--border-subtle)] px-4 py-2 transition hover:border-[var(--accent)]/70 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/80"
            >
              <span className="material-symbols-outlined text-base">pause_circle</span>
              Pause Goal
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-end sm:hidden">
        <button
          type="button"
          onClick={handleEdit}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/80"
        >
          <span className="material-symbols-outlined text-base">more_horiz</span>
          Manage
        </button>
      </div>
    </motion.article>
  );
}

