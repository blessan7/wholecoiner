import { motion } from 'framer-motion';

import InvestFlow from '@/components/InvestFlow';
import { fadeInUp } from '@/lib/motion';

export default function InvestPanel({
  progress,
  refreshProgress,
  goalId,
}) {

  return (
    <motion.section
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      className="rounded-3xl border border-[var(--border-subtle)] bg-[#17110b]/90 p-6 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Invest in this Goal</h2>
      </div>

      <div className="mt-6">
        <InvestFlow
          goalId={goalId}
          goalCoin={progress?.coin}
          onSuccess={refreshProgress}
        />
      </div>
    </motion.section>
  );
}

