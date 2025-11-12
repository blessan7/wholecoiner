import { useState } from 'react';
import { motion } from 'framer-motion';

import InvestFlow from '@/components/InvestFlow';
import { fadeInUp } from '@/lib/motion';

export default function InvestPanel({
  progress,
  refreshProgress,
  goalId,
  status,
  onDebugOnramp,
  onDebugSwap,
}) {
  const [activeTab, setActiveTab] = useState('invest');

  return (
    <motion.section
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="rounded-3xl border border-[var(--border-subtle)] bg-[#17110b]/90 p-6 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Invest in this Goal</h2>
        <div className="inline-flex rounded-full border border-[#292018] bg-[#1b120a] p-1 text-xs uppercase tracking-[0.18em] text-[var(--text-secondary)]">
          <button
            type="button"
            onClick={() => setActiveTab('invest')}
            className={`rounded-full px-3 py-1 transition ${
              activeTab === 'invest' ? 'bg-[var(--accent)] text-[#0d0804]' : 'hover:text-[var(--accent)]'
            }`}
          >
            Invest
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('debug')}
            className={`rounded-full px-3 py-1 transition ${
              activeTab === 'debug' ? 'bg-[var(--accent)] text-[#0d0804]' : 'hover:text-[var(--accent)]'
            }`}
          >
            Debug
          </button>
        </div>
      </div>

      {activeTab === 'invest' ? (
        <div className="mt-6">
          <InvestFlow
            goalId={goalId}
            goalCoin={progress?.coin}
            onSuccess={refreshProgress}
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:max-w-lg">
          <p className="text-xs text-[var(--text-secondary)]">
            Debug actions let you validate individual steps without touching live funds.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onDebugOnramp}
              className="rounded-full border border-[#2c1c12] bg-[#1f130c] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70"
            >
              Test Onramp
            </button>
            <button
              type="button"
              onClick={onDebugSwap}
              className="rounded-full border border-[#2c1c12] bg-[#1f130c] px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/70"
            >
              Test Swap
            </button>
          </div>
        </div>
      )}
    </motion.section>
  );
}

