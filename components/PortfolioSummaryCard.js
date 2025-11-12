import { motion } from 'framer-motion';

import { fadeInUp } from '@/lib/motion';

export default function PortfolioSummaryCard({ label, value, icon, delay = 0 }) {
  return (
    <motion.article
      variants={fadeInUp}
      transition={{ delay }}
      className="relative overflow-hidden rounded-3xl border border-[var(--border-subtle)] bg-[#17110b]/80 px-6 py-7 shadow-[0_20px_60px_rgba(0,0,0,0.55)] backdrop-blur"
    >
      <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[var(--accent-soft)] blur-3xl" aria-hidden />
      <div className="flex items-center gap-4">
        {icon && <span className="text-3xl text-[var(--accent)]">{icon}</span>}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-[0.28em] text-[var(--text-secondary)]">{label}</span>
          <span className="font-headline text-3xl font-semibold text-[var(--text-primary)] tabular-nums">{value}</span>
        </div>
      </div>
    </motion.article>
  );
}

