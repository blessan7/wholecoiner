import Link from 'next/link';
import { motion } from 'framer-motion';

import { fadeInUp } from '@/lib/motion';

export default function EmptyGoalsState() {
  return (
    <motion.section
      initial="hidden"
      animate="visible"
      variants={fadeInUp}
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 rounded-3xl border border-[var(--border-subtle)] bg-[#17110b]/85 px-10 py-16 text-center shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-[var(--border-subtle)] text-[var(--text-secondary)]">
        <span className="material-symbols-outlined text-3xl">target</span>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="font-headline text-2xl font-semibold text-[var(--text-primary)]">
          No goals yet. Start your journey to 1.0 today.
        </h2>
        <p className="text-base text-[var(--text-secondary)]">
          Define your first accumulation plan and we’ll guide your momentum with reminders, insights, and celebration.
        </p>
      </div>
      <Link
        href="/goals/create"
        className="btn-primary flex items-center justify-center gap-2 rounded-full px-6 py-3 text-base font-semibold uppercase tracking-[0.18em]"
      >
        <span className="material-symbols-outlined text-base">rocket_launch</span>
        Create a Goal
      </Link>
    </motion.section>
  );
}

