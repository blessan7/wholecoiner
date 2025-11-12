import { motion } from 'framer-motion';

import { progressSpring } from '@/lib/motion';

export default function ProgressBar({ value, label, ariaLabel }) {
  const clampedValue = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-[var(--text-secondary)]">
        <span>Progress</span>
        <span className="text-[var(--text-primary)]">{label}</span>
      </div>
      <div
        className="relative h-2 w-full overflow-hidden rounded-full bg-[#2a1c12]"
        role="progressbar"
        aria-label={ariaLabel ?? `Goal progress ${clampedValue}%`}
        aria-valuenow={Number(clampedValue.toFixed(1))}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clampedValue}%` }}
          transition={progressSpring}
          className="absolute left-0 top-0 h-full rounded-full bg-[var(--accent)]"
        />
      </div>
    </div>
  );
}

