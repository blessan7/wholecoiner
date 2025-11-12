import { motion } from 'framer-motion';

import { fadeInUp } from '@/lib/motion';
import TransactionHistory from '@/components/TransactionHistory';

export default function TransactionsSection({ goalId, onRefresh, transactionsRef }) {
  return (
    <motion.section
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="rounded-3xl border border-[var(--border-subtle)] bg-[#17110b]/90 p-6 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Transaction History</h2>
        <button
          type="button"
          onClick={onRefresh}
          className="btn-ghost h-10 px-5 text-xs font-semibold uppercase tracking-[0.18em]"
        >
          Refresh
        </button>
      </div>
      <div className="mt-5 rounded-2xl border border-[#2a1c12] bg-[#120a05] p-4">
        <TransactionHistory
          ref={transactionsRef}
          goalId={goalId}
          showHeader={false}
          className="bg-transparent p-0"
        />
      </div>
    </motion.section>
  );
}

