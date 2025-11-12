'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const STATUS_META = {
  ACTIVE: {
    label: 'On Track',
    dotClass: 'bg-green-400',
    pillClass: 'bg-green-500/10 text-green-300 border border-green-500/30',
  },
  PAUSED: {
    label: 'Paused',
    dotClass: 'bg-yellow-400',
    pillClass: 'bg-yellow-500/10 text-yellow-200 border border-yellow-500/30',
  },
  COMPLETED: {
    label: 'Completed',
    dotClass: 'bg-primary',
    pillClass: 'bg-primary/15 text-primary border border-primary/30',
  },
  CANCELLED: {
    label: 'Closed',
    dotClass: 'bg-gray-500',
    pillClass: 'bg-gray-500/15 text-gray-300 border border-gray-500/30',
  },
};

const FREQUENCY_LABELS = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
};

const formatDate = (isoString, options = { month: 'long', year: 'numeric' }) => {
  if (!isoString) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', options).format(new Date(isoString));
  } catch {
    return '—';
  }
};

const formatNumber = (value, maximumFractionDigits = 6) => {
  const numericValue = Number(value ?? 0);
  if (Number.isNaN(numericValue)) return '—';
  return numericValue.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
};

const formatCurrencyUSD = (value) => {
  const numericValue = Number(value ?? 0);
  if (!numericValue) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: numericValue >= 1000 ? 0 : 2,
  }).format(numericValue);
};

const deriveProgress = (goal) => {
  const explicit = Number(goal?.progressPercentage);
  if (!Number.isNaN(explicit) && Number.isFinite(explicit)) {
    return Math.min(100, Math.max(0, explicit));
  }

  const invested = Number(goal?.investedAmount ?? 0);
  const target = Number(goal?.targetAmount ?? 0);
  if (!target) return 0;
  return Math.min(100, Math.max(0, (invested / target) * 100));
};

const STATUS_ORDER = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];

const GoalCard = ({ goal, onNavigate }) => {
  const statusKey =
    STATUS_META[goal.status] ? goal.status : STATUS_ORDER.find((state) => STATUS_META[state]) || 'ACTIVE';
  const status = STATUS_META[statusKey];
  const progress = deriveProgress(goal);

  return (
    <article
      role="button"
      onClick={() => onNavigate(goal.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onNavigate(goal.id);
        }
      }}
      tabIndex={0}
      className="group flex flex-col gap-6 rounded-2xl border border-[#483923] bg-[#2a2217] p-6 transition-colors hover:bg-[#31271a] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
    >
      <header className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-sm uppercase tracking-[0.18em] text-[#a89987] select-none">
            {goal.coin} goal
          </p>
          <h3 className="text-xl font-bold text-[#f0eade] tracking-tight">
            Accumulate {formatNumber(goal.targetAmount, 4)} {goal.coin}
          </h3>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#c9b292] bg-[#3a2d1d] border border-[#483923]/60">
          <span className={`size-2 rounded-full ${status.dotClass}`} />
          <span>{status.label}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-[#a89987]">Target Amount</p>
          <p className="text-lg font-medium text-[#f0eade]">
            {formatNumber(goal.targetAmount, 4)} {goal.coin}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-[#a89987]">Invested So Far</p>
          <p className="text-lg font-medium text-[#f0eade]">
            {formatNumber(goal.investedAmount, 4)} {goal.coin}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-[#a89987]">Contribution Plan</p>
          <p className="text-lg font-medium text-[#f0eade]">
            {formatCurrencyUSD(goal.amountPerInterval)} • {FREQUENCY_LABELS[goal.frequency] ?? goal.frequency ?? '—'}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-sm text-[#a89987]">Created On</p>
          <p className="text-lg font-medium text-[#f0eade]">
            {formatDate(goal.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="w-full">
        <div className="flex items-center justify-between text-sm text-[#a89987] mb-2">
          <p>Progress</p>
          <p className="text-sm font-medium text-[#f0eade]">{progress.toFixed(1)}%</p>
        </div>
        <div className="w-full h-1.5 rounded-full bg-[#3a2d1d] overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </article>
  );
};

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

  if (loading) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center bg-[#1b130a] font-display text-[#f0eade]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-[#a89987]">
            Loading goals
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen w-full flex-col bg-[#1b130a] font-display text-[#f0eade]">
      <div className="flex h-full grow flex-col">
        <div className="flex flex-1 justify-center px-4 sm:px-8 md:px-12 lg:px-20 xl:px-40 py-5">
          <div className="flex w-full max-w-[960px] flex-1 flex-col">
            <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-[#483923] px-4 py-5 sm:px-6 text-[#f0eade]">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-xl">database</span>
                <h2 className="text-lg font-bold leading-tight tracking-[-0.015em]">Wholecoiner</h2>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/dashboard')}
                  className="flex max-w-[240px] items-center justify-center gap-2 rounded-full border border-[#483923] px-4 h-10 text-sm font-bold text-[#f0eade] hover:bg-[#2a2217]"
                >
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  <span className="truncate">Back to Dashboard</span>
                </button>
                <Link
                  href="/goals/create"
                  className="flex min-w-[120px] items-center justify-center gap-2 rounded-full bg-primary px-5 h-10 text-sm font-bold text-[#221a10] hover:opacity-90 transition-opacity"
                >
                  <span className="material-symbols-outlined text-base">add</span>
                  <span className="truncate">Add New Goal</span>
                </Link>
              </div>
            </header>

            <main className="flex-1 px-4 py-10 sm:px-6 sm:py-12">
              <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[#483923] pb-8 mb-10">
                <div className="flex flex-col gap-3">
                  <p className="text-sm uppercase tracking-[0.22em] text-[#a89987]">Portfolio goals</p>
                  <h1 className="text-4xl md:text-5xl font-black leading-tight tracking-[-0.033em] text-[#f0eade]">
                    Investment Goals
                  </h1>
                  <p className="max-w-xl text-base text-[#a89987]">
                    Track every accumulation target, understand your progress at a glance, and stay on pace to become a
                    Wholecoiner.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-[#f0eade]">
                  <div className="rounded-2xl border border-[#483923] bg-[#2a2217] p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-[#a89987]">Active goals</p>
                    <p className="mt-2 text-3xl font-bold">{summary.activeCount}</p>
                  </div>
                  <div className="rounded-2xl border border-[#483923] bg-[#2a2217] p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-[#a89987]">Average progress</p>
                    <p className="mt-2 text-3xl font-bold">{summary.averageProgress.toFixed(1)}%</p>
                  </div>
                  <div className="rounded-2xl border border-[#483923] bg-[#2a2217] p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-[#a89987]">Target total</p>
                    <p className="mt-2 text-xl font-semibold">
                      {formatNumber(summary.totalTarget, 4)} <span className="text-sm text-[#a89987]">in assets</span>
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#483923] bg-[#2a2217] p-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-[#a89987]">Invested so far</p>
                    <p className="mt-2 text-xl font-semibold">
                      {formatNumber(summary.totalInvested, 4)} <span className="text-sm text-[#a89987]">in assets</span>
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div className="mb-8 rounded-2xl border border-red-900/40 bg-red-900/20 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {!error && goals.length === 0 ? (
                <div className="flex flex-col items-center gap-6 rounded-3xl border border-[#483923] bg-[#2a2217] px-10 py-16 text-center text-[#f0eade]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-[#483923] text-[#c9b292]">
                    <span className="material-symbols-outlined text-3xl">target</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-semibold">No goals yet</h2>
                    <p className="text-base text-[#a89987]">
                      Start your disciplined stacking plan—set your first goal and we’ll guide you every step of the way.
                    </p>
                  </div>
                  <Link
                    href="/goals/create"
                    className="flex items-center justify-center gap-2 rounded-full bg-primary px-6 h-12 text-base font-bold text-[#221a10] hover:opacity-90 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-base">rocket_launch</span>
                    Create your first goal
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {goals.map((goal) => (
                    <GoalCard key={goal.id} goal={goal} onNavigate={(goalId) => router.push(`/goals/${goalId}`)} />
                  ))}
                </div>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
