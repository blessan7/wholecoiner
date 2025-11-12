import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import GoalListCard from '@/components/GoalListCard';

const ASSET_META = {
  BTC: { label: 'Bitcoin', accent: '#f7931a' },
  ETH: { label: 'Ethereum', accent: '#627eea' },
  SOL: { label: 'Solana', accent: '#14f195' },
};

const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const updateMatch = () => setIsMobile(mediaQuery.matches);

    updateMatch();
    mediaQuery.addEventListener('change', updateMatch);

    return () => mediaQuery.removeEventListener('change', updateMatch);
  }, []);

  return isMobile;
};

export default function GoalGroup({ asset, goals, onNavigate }) {
  const [isOpen, setIsOpen] = useState(true);
  const isMobile = useIsMobile();
  const assetMeta = useMemo(
    () => ASSET_META[asset] ?? { label: asset, accent: 'var(--accent)' },
    [asset]
  );

  const toggleMobile = () => {
    if (!isMobile) return;
    setIsOpen((prev) => !prev);
  };

  const isVisible = !isMobile || isOpen;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-subtle)] bg-[#1b120a]/80 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--text-primary)]"
            style={{ boxShadow: `0 0 20px ${assetMeta.accent}25` }}
          >
            {asset}
          </div>
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-[0.28em] text-[var(--text-secondary)]">
              {assetMeta.label}
            </span>
            <span className="font-headline text-xl text-[var(--text-primary)]">
              {goals.length} {goals.length === 1 ? 'Goal' : 'Goals'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={toggleMobile}
          className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-secondary)] transition hover:border-[var(--accent)]/70 hover:text-[var(--text-primary)] sm:hidden"
          aria-expanded={isVisible}
        >
          <span className="material-symbols-outlined text-base">
            {isVisible ? 'expand_less' : 'expand_more'}
          </span>
          {isVisible ? 'Hide' : 'Show'}
        </button>
      </header>

      <AnimatePresence initial={false}>
        {isVisible && (
          <motion.div
            key="goals"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-6 overflow-hidden"
          >
            {goals.map((goal) => (
              <GoalListCard
                key={goal.id}
                goal={goal}
                onNavigate={onNavigate}
                onEdit={onNavigate}
                onPause={onNavigate}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

