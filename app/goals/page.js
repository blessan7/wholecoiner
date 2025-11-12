'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

import PortfolioSummaryCard from '@/components/PortfolioSummaryCard';
import GoalGroup from '@/components/GoalGroup';
import EmptyGoalsState from '@/components/EmptyGoalsState';
import { fadeInUp, staggerContainer } from '@/lib/motion';
import {
  STATUS_META,
  STATUS_ORDER,
  deriveProgress,
  formatNumber,
} from '@/lib/goalFormatting';

const SUMMARY_CARD_CONFIG = [
  {
    id: 'activeCount',
    label: 'Active Goals',
    format: (value) => value,
  },
  {
    id: 'averageProgress',
    label: 'Average Progress',
    format: (value) => `${value.toFixed(1)}%`,
  },
  {
    id: 'totalTarget',
    label: 'Target Total',
    format: (value) => `${formatNumber(value, 4)} in assets`,
  },
  {
    id: 'totalInvested',
    label: 'Invested So Far',
    format: (value) => `${formatNumber(value, 4)} in assets`,
  },
];

const stickyMetrics = (summary) => [
  {
    id: 'active',
    label: 'Active Goals',
    value: summary.activeCount,
  },
  {
    id: 'avg',
    label: 'Average Progress',
    value: `${summary.averageProgress.toFixed(1)}%`,
  },
];

const LoadingState = () => (
  <div className="relative flex min-h-screen w-full items-center justify-center bg-[var(--bg-main)] font-headline text-[var(--text-primary)]">
    <div className="flex flex-col items-center gap-4">
      <div className="h-12 w-12 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
      <p className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--text-secondary)]">
        Loading goals
      </p>
    </div>
  </div>
);

const ErrorBanner = ({ message }) => (
  <div
    role="alert"
    className="rounded-3xl border border-red-900/40 bg-red-900/20 px-6 py-4 text-sm text-red-200 shadow-[0_18px_45px_rgba(122,26,26,0.25)]"
  >
    {message}
  </div>
);

const SummaryStrip = ({ summary }) => (
  <div className="sticky top-0 z-30 -mx-6 border-b border-[#292018]/80 bg-[color:rgba(13,8,4,0.92)]/95 backdrop-blur-xl px-6 py-4 sm:-mx-8 sm:px-8 md:-mx-10 md:px-10 lg:-mx-12 lg:px-12">
    <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4">
      <p className="hidden text-xs uppercase tracking-[0.28em] text-[var(--text-secondary)] sm:block">
        Momentum Snapshot
      </p>
      <div className="flex flex-1 justify-end gap-3">
        {stickyMetrics(summary).map((item) => (
          <div
            key={item.id}
            className="flex min-w-[140px] flex-col gap-1 rounded-full border border-[#292018] bg-[#17110b]/80 px-4 py-2 text-left shadow-[0_10px_30px_rgba(0,0,0,0.35)] sm:min-w-[160px]"
          >
            <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-secondary)]">
              {item.label}
            </span>
            <span className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default function GoalsPage() {
  const router = useRouter();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchGoals = async () => {
      try {
        const response = await fetch('/api/goals', { credentials: 'include' });
        const data = await response.json();

        if (data.success) {
          setGoals(data.goals ?? []);
        } else {
          setError(data.error?.message || 'Unable to fetch goals right now.');
        }
      } catch {
        setError('Network error. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchGoals();
  }, []);

  const summary = useMemo(() => {
    if (!goals.length) {
      return {
        activeCount: 0,
        totalTarget: 0,
        totalInvested: 0,
        averageProgress: 0,
      };
    }

    const aggregate = goals.reduce(
      (accumulator, goal) => {
        const statusKey =
          STATUS_META[goal.status] ? goal.status : STATUS_ORDER.find((state) => STATUS_META[state]) || 'ACTIVE';
        if (statusKey === 'ACTIVE') {
          accumulator.activeCount += 1;
        }
        accumulator.totalTarget += Number(goal.targetAmount ?? 0);
        accumulator.totalInvested += Number(goal.investedAmount ?? 0);
        accumulator.progressSum += deriveProgress(goal);
        return accumulator;
      },
      { activeCount: 0, totalTarget: 0, totalInvested: 0, progressSum: 0 }
    );

    return {
      activeCount: aggregate.activeCount,
      totalTarget: aggregate.totalTarget,
      totalInvested: aggregate.totalInvested,
      averageProgress: aggregate.progressSum / goals.length,
    };
  }, [goals]);

  const groupedGoals = useMemo(() => {
    return goals.reduce((accumulator, goal) => {
      const assetKey = goal.coin?.toUpperCase() ?? 'OTHER';
      if (!accumulator[assetKey]) {
        accumulator[assetKey] = [];
      }
      accumulator[assetKey].push(goal);
      return accumulator;
    }, {});
  }, [goals]);

  const handleNavigate = useCallback(
    (goalId) => {
      router.push(`/goals/${goalId}`);
    },
    [router]
  );

  const summaryCards = SUMMARY_CARD_CONFIG.map((item) => ({
    id: item.id,
    label: item.label,
    value: item.format(summary[item.id]),
  }));

  if (loading) {
    return <LoadingState />;
  }

  return (
    <div className="relative min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)]">
      <div className="hero-gradient" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-24 pt-10 sm:px-8 md:px-10 lg:px-12">
        <header className="flex flex-col gap-10">
          <div className="flex items-center gap-3 text-[12px] uppercase tracking-[0.32em] text-[var(--text-secondary)]">
            <span className="opacity-60">Portfolio</span>
            <span className="select-none text-[var(--accent)]">•</span>
            <span>Goals</span>
          </div>

          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex max-w-2xl flex-col gap-4">
              <h1 className="font-headline text-4xl uppercase tracking-[0.12em] text-[var(--text-primary)] sm:text-5xl md:text-[3.25rem]">
                Investment Goals
              </h1>
              <p className="text-base text-[var(--text-secondary)] sm:text-lg">
                Your discipline compounds over time. Track momentum toward 1.0, celebrate milestones, and keep every goal
                aligned with your conviction.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="btn-ghost flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-transparent px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em]"
              >
                <span className="material-symbols-outlined text-base">arrow_back</span>
                Back to Dashboard
              </button>
              <Link
                href="/goals/create"
                className="btn-primary flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold uppercase tracking-[0.18em]"
              >
                <span className="material-symbols-outlined text-base">add</span>
                Create Goal
              </Link>
            </div>
          </div>
        </header>

        <SummaryStrip summary={summary} />

        <main className="mt-12 flex flex-col gap-12">
          <motion.section
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="grid grid-cols-1 gap-5 sm:grid-cols-2"
          >
            {summaryCards.map((card) => (
              <PortfolioSummaryCard key={card.id} label={card.label} value={card.value} />
            ))}
          </motion.section>

          {error && <ErrorBanner message={error} />}

          {!error && goals.length === 0 ? (
            <EmptyGoalsState />
          ) : (
            Object.entries(groupedGoals).map(([asset, assetGoals]) => (
              <GoalGroup key={asset} asset={asset} goals={assetGoals} onNavigate={handleNavigate} />
            ))
          )}
        </main>
      </div>
    </div>
  );
}
