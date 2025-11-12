'use client';

import { use, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';

import BreadcrumbTitle from '@/components/goal-details/BreadcrumbTitle';
import SummaryRow from '@/components/goal-details/SummaryRow';
import InvestPanel from '@/components/goal-details/InvestPanel';
import TransactionsSection from '@/components/goal-details/TransactionsSection';
import FooterActions from '@/components/goal-details/FooterActions';
import UserProfileBadge from '@/components/UserProfileBadge';
import { formatCurrencyUSD, formatDate, formatNumber } from '@/lib/goalFormatting';
import { getWalletAddressFromPrivy } from '@/lib/user';

const formatDurationLabel = (estimate) => {
  if (!estimate) return '—';
  if (estimate.monthsToComplete) {
    const months = Number(estimate.monthsToComplete);
    if (Number.isFinite(months) && months > 0) {
      if (months >= 12) {
        const years = Math.floor(months / 12);
        const remainingMonths = months % 12;
        if (remainingMonths === 0) {
          return `${years} ${years === 1 ? 'year' : 'years'}`;
        }
        return `${years} ${years === 1 ? 'year' : 'years'} ${remainingMonths} ${
          remainingMonths === 1 ? 'month' : 'months'
        }`;
      }
      return `${months} ${months === 1 ? 'month' : 'months'}`;
    }
  }
  if (estimate.estimatedCompletionDate) {
    return `By ${formatDate(estimate.estimatedCompletionDate, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })}`;
  }
  return '—';
};

export default function GoalProgressPage({ params }) {
  const router = useRouter();
  const { ready, authenticated, user } = usePrivy();
  const { id: goalId } = use(params);
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const transactionHistoryRef = useRef(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push('/');
    }
  }, [ready, authenticated, router]);

  const fetchProgress = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/progress/${goalId}`, {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.success) {
        setProgress(data);
      } else {
        setError(data.error?.message || 'Failed to fetch progress');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [goalId]);

  useEffect(() => {
    if (ready && authenticated) {
      fetchProgress();
    }
  }, [goalId, ready, authenticated, fetchProgress]);

  const avatarUrl = useMemo(() => {
    if (!user?.linkedAccounts || !Array.isArray(user.linkedAccounts)) return null;
    const googleAccount = user.linkedAccounts.find(
      (account) => account.type === 'google_oauth'
    );
    return googleAccount?.picture ?? null;
  }, [user?.linkedAccounts]);

  const walletAddress = getWalletAddressFromPrivy(user);

  const displayName = useMemo(() => {
    if (user?.email?.address) {
      const [namePart] = user.email.address.split('@');
      if (namePart) {
        return namePart.charAt(0).toUpperCase() + namePart.slice(1);
      }
    }

    if (Array.isArray(user?.linkedAccounts)) {
      const emailAccount = user.linkedAccounts.find(
        (account) => account.type === 'email' && account.address
      );
      if (emailAccount?.address) {
        const [namePart] = emailAccount.address.split('@');
        if (namePart) {
          return namePart.charAt(0).toUpperCase() + namePart.slice(1);
        }
      }
    }

    if (walletAddress) {
      return walletAddress.slice(0, 6).toUpperCase();
    }

    return 'Wholecoiner';
  }, [user?.email?.address, user?.linkedAccounts, walletAddress]);

  const investedAmount = Number(progress?.investedAmount ?? 0);
  const targetAmount = Number(progress?.targetAmount ?? 0);
  const currentPrice = Number(progress?.currentPriceUSD ?? 0);
  const currentValue = Number(progress?.currentValueUSD ?? 0);
  const targetValue = targetAmount * currentPrice;
  const remainingAsset = Math.max(0, targetAmount - investedAmount);
  const remainingValue = Math.max(0, targetValue - currentValue);

  const progressPct = useMemo(() => {
    const explicit = Number(progress?.progressPercentage);
    if (Number.isFinite(explicit)) {
      return Math.min(100, Math.max(0, explicit));
    }
    if (!targetAmount) return 0;
    return Math.min(100, Math.max(0, (investedAmount / targetAmount) * 100));
  }, [progress?.progressPercentage, investedAmount, targetAmount]);

  const handleInvestSuccess = useCallback(() => {
    fetchProgress();
    transactionHistoryRef.current?.refresh();
  }, [fetchProgress]);

  const handlePauseGoal = async () => {
    if (!progress || actionLoading) return;
    
    setActionLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status: 'PAUSED' })
      });

      const data = await response.json();

      if (data.success) {
        // Refresh progress data
        await fetchProgress();
      } else {
        setError(data.error?.message || 'Failed to pause goal');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle resume goal
  const handleResumeGoal = async () => {
    if (!progress || actionLoading) return;
    
    setActionLoading(true);
    setError('');
    
    try {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ status: 'ACTIVE' })
      });

      const data = await response.json();

      if (data.success) {
        // Refresh progress data
        await fetchProgress();
      } else {
        setError(data.error?.message || 'Failed to resume goal');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  // Handle edit goal (placeholder - can be extended later)
  const handleEditGoal = () => {
    // For now, just show a message that edit functionality is coming
    // This can be extended to show a modal or redirect to an edit page
    alert('Edit goal functionality will be available soon. You can update goal settings from the goals page.');
  };

  // Show loading while checking auth
  if (!ready || !authenticated || !user) {
    return (
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-text-primary-light dark:text-text-primary-dark">Loading...</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center bg-[var(--bg-main)] text-[var(--text-primary)]">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          <p className="text-sm uppercase tracking-[0.22em] text-[var(--text-secondary)]">Loading goal</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative flex min-h-screen w-full items-center justify-center bg-[var(--bg-main)] text-[var(--text-primary)]">
        <div className="rounded-3xl border border-red-800/40 bg-red-900/20 px-6 py-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <p className="text-sm text-red-200">{error}</p>
          <button
            type="button"
            onClick={() => router.push('/goals')}
            className="btn-ghost mt-4 px-6 py-3 text-xs font-semibold uppercase tracking-[0.18em]"
          >
            Back to Goals
          </button>
        </div>
      </div>
    );
  }

  if (!progress) {
    return null;
  }

  const nextInvestmentAt = progress.nextInvestmentDate ?? progress.nextInvestmentAt ?? null;
  const estimatedCompletionAt =
    progress.estimatedCompletion?.estimatedCompletionDate ?? progress.estimatedCompletionAt ?? null;

  const summaryData = {
    progress: {
      progressPct,
      investedAmount,
      targetAmount,
      asset: progress.coin,
      estimatedCompletion: formatDurationLabel(progress.estimatedCompletion),
    },
    financial: {
      currentPrice,
      currentValue,
      targetValue,
      remainingValue,
      remainingAsset,
      asset: progress.coin,
    },
    plan: {
      frequency: progress.frequency,
      amountPerIntervalUSD: progress.amountPerInterval,
      nextInvestmentAt,
      estimatedCompletionAt,
    },
  };

  return (
    <div className="relative min-h-screen bg-[var(--bg-main)] bg-gradient-to-b from-[var(--bg-main)] via-[#17110b] to-[#120904] text-[var(--text-primary)]">
      <div className="hero-gradient" />
      <header className="relative z-20 border-b border-[var(--border-subtle)]/70 bg-[#0d0804]/85 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4 sm:px-8 md:px-10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-[#0d0804] font-bold shadow-[0_12px_40px_rgba(255,159,28,0.25)]">
              <svg className="h-4 w-4" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  clipRule="evenodd"
                  d="M24 4H6V17.3333V30.6667H24V44H42V30.6667V17.3333H24V4Z"
                  fill="currentColor"
                  fillRule="evenodd"
                />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-tight sm:text-base">Wholecoiner</span>
          </div>
          <UserProfileBadge
            displayName={displayName}
            walletAddress={walletAddress}
            avatarUrl={avatarUrl}
            size="sm"
            orientation="horizontal"
            className="bg-[#22160d] border-none shadow-none px-3 py-2"
          />
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-10 sm:px-8 md:px-10">
        <BreadcrumbTitle
          asset={progress.coin}
          goalName={`${formatNumber(progress.targetAmount, 6)} ${progress.coin} Goal`}
          status={progress.status}
          createdAt={progress.createdAt}
        />

        <SummaryRow {...summaryData} />

        <InvestPanel
          progress={progress}
          refreshProgress={handleInvestSuccess}
          goalId={goalId}
          status={progress.status}
          onDebugOnramp={() => console.log('Debug: trigger onramp for', goalId)}
          onDebugSwap={() => console.log('Debug: trigger swap for', goalId)}
        />

        <TransactionsSection
          goalId={goalId}
          onRefresh={() => transactionHistoryRef.current?.refresh()}
          transactionsRef={transactionHistoryRef}
        />

        <FooterActions
          onBack={() => router.push('/goals')}
          onPause={handlePauseGoal}
          onResume={handleResumeGoal}
          onEdit={handleEditGoal}
          status={progress.status}
          loading={actionLoading}
        />
      </main>
    </div>
  );
}
