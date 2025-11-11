'use client';

import { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';
import InvestFlow from '@/components/InvestFlow';
import TransactionHistory from '@/components/TransactionHistory';

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

  useEffect(() => {
    if (ready && authenticated) {
      fetchProgress();
    }
  }, [goalId, ready, authenticated]);

  const fetchProgress = async () => {
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
  };

  // Get user avatar URL
  const getAvatarUrl = () => {
    if (user?.linkedAccounts && Array.isArray(user.linkedAccounts)) {
      const googleAccount = user.linkedAccounts.find(
        account => account.type === 'google_oauth'
      );
      if (googleAccount?.picture) {
        return googleAccount.picture;
      }
    }
    return null;
  };

  const avatarUrl = getAvatarUrl();

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(new Date(dateString));
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(dateString));
  };

  const formatCurrencyUSD = (amount) => {
    if (amount === null || amount === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatDuration = (months) => {
    if (!months) return 'N/A';
    if (months >= 12) {
      const years = Math.floor(months / 12);
      const remainingMonths = months % 12;
      if (remainingMonths === 0) {
        return `${years} ${years === 1 ? 'year' : 'years'}`;
      }
      return `${years} ${years === 1 ? 'year' : 'years'} ${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}`;
    }
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  };

  // Calculate USD values
  const calculateUSDValues = () => {
    if (!progress || !progress.currentPriceUSD) return null;

    const targetValueUSD = progress.targetAmount * progress.currentPriceUSD;
    const totalInvestedUSD = progress.currentValueUSDC || 0; // Use current value as invested value
    
    // Calculate profit/loss in USD (for now 0, but structure for future)
    const profitLossUSD = 0;
    const profitLossPercentage = 0;

    return {
      targetValueUSD,
      totalInvestedUSD,
      profitLossUSD,
      profitLossPercentage
    };
  };

  const usdValues = calculateUSDValues();

  // Handle pause goal
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
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-text-primary-light dark:text-text-primary-dark">Loading progress...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative flex h-auto min-h-screen w-full flex-col dark group/design-root overflow-x-hidden">
        <div className="layout-container flex h-full grow flex-col">
          <main className="px-4 sm:px-10 lg:px-40 flex flex-1 justify-center py-5">
            <div className="layout-content-container flex flex-col max-w-[960px] flex-1">
              <div className="bg-red-900/30 border border-red-700 text-red-400 px-4 py-3 rounded-full text-sm mb-4">
                {error}
              </div>
              <button
                onClick={() => router.push('/goals')}
                className="text-[#c9b292] text-sm font-bold leading-normal hover:text-white transition-colors"
              >
                ← Back to Goals
              </button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-background-light dark:bg-background-dark">
        <div className="text-text-primary-light dark:text-text-primary-dark">No progress data found</div>
      </div>
    );
  }

  return (
    <div className="relative flex h-auto min-h-screen w-full flex-col dark group/design-root overflow-x-hidden">
      <div className="layout-container flex h-full grow flex-col">
        {/* TopNavBar */}
        <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-[#483923] px-4 sm:px-6 md:px-10 py-3">
          <div className="flex items-center gap-4 text-white">
            <Link href="/dashboard" className="flex items-center gap-3">
              <div className="size-6 text-primary">
                <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                  <path clipRule="evenodd" d="M24 4H6V17.3333V30.6667H24V44H42V30.6667V17.3333H24V4Z" fill="currentColor" fillRule="evenodd"></path>
                </svg>
              </div>
              <h2 className="text-white text-lg font-bold leading-tight tracking-[-0.015em]">Wholecoiner</h2>
            </Link>
          </div>
          <div className="hidden md:flex flex-1 justify-end gap-8">
            <div className="flex items-center gap-9">
              <Link href="/dashboard" className="text-white/70 hover:text-white transition-colors text-sm font-medium leading-normal">
                Dashboard
              </Link>
              <Link href="/goals" className="text-white text-sm font-medium leading-normal">
                Goals
              </Link>
              <a href="#" className="text-white/70 hover:text-white transition-colors text-sm font-medium leading-normal">
                Portfolio
              </a>
              <a href="#" className="text-white/70 hover:text-white transition-colors text-sm font-medium leading-normal">
                Reports
              </a>
            </div>
            <div className="flex gap-2">
              <button className="flex min-w-[84px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 px-4 bg-primary text-[#221b11] text-sm font-bold leading-normal tracking-[0.015em]">
                <span className="truncate">Add Transaction</span>
              </button>
              <button className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 bg-[#483923] text-white gap-2 text-sm font-bold leading-normal tracking-[0.015em] min-w-0 px-2.5">
                <span className="material-symbols-outlined text-xl">notifications</span>
              </button>
              <button className="flex max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-10 bg-[#483923] text-white gap-2 text-sm font-bold leading-normal tracking-[0.015em] min-w-0 px-2.5">
                <span className="material-symbols-outlined text-xl">toggle_on</span>
              </button>
            </div>
            {avatarUrl ? (
              <div 
                className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-10" 
                data-alt="User avatar image" 
                style={{ backgroundImage: `url("${avatarUrl}")` }}
              ></div>
            ) : (
              <div className="bg-primary/20 rounded-full size-10 flex items-center justify-center text-primary font-bold text-sm">
                {user?.email?.address?.[0]?.toUpperCase() || user?.linkedAccounts?.[0]?.address?.[0]?.toUpperCase() || 'U'}
              </div>
            )}
          </div>
        </header>

        <main className="px-4 sm:px-10 lg:px-40 flex flex-1 justify-center py-5">
          <div className="layout-content-container flex flex-col max-w-[960px] flex-1">
            {/* Breadcrumbs */}
            <div className="flex flex-wrap gap-2 p-4">
              <Link href="/goals" className="text-[#c9b292] text-base font-medium leading-normal hover:text-white">
                Goals
              </Link>
              <span className="text-[#c9b292] text-base font-medium leading-normal">/</span>
              <span className="text-white text-base font-medium leading-normal">Goal Details</span>
            </div>

            {/* Page Heading */}
            <div className="flex flex-wrap justify-between gap-3 p-4 mb-6">
              <div className="flex-1">
                <h1 className="text-white text-4xl font-black leading-tight tracking-[-0.033em] min-w-72 mb-2">
                  {progress.targetAmount} {progress.coin} Goal
                </h1>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`inline-flex px-3 py-1 text-xs font-semibold rounded-full ${
                    progress.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    progress.status === 'PAUSED' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                    'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                  }`}>
                    {progress.status}
                  </span>
                  <span className="text-[#c9b292] text-sm">
                    Created {formatDate(progress.createdAt)}
                  </span>
                </div>
              </div>
            </div>

            {/* Progress Overview */}
            <div className="flex flex-col gap-6 mb-6">
              <div className="rounded-xl bg-[#483923] p-6">
                <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em] mb-6">Progress Overview</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="flex flex-col gap-2">
                    <span className="text-[#c9b292] text-sm font-medium">Completion</span>
                    <span className="text-white text-4xl font-bold">
                      {progress.progressPercentage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[#c9b292] text-sm font-medium">Time Remaining</span>
                    <span className="text-white text-4xl font-bold">
                      {formatDuration(progress.estimatedCompletion?.monthsToComplete)}
                    </span>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="mt-6">
                  <div className="flex justify-between text-sm text-[#c9b292] mb-3">
                    <span>{progress.investedAmount.toFixed(6)} {progress.coin}</span>
                    <span>{progress.targetAmount} {progress.coin}</span>
                  </div>
                  <div className="w-full bg-[#221a10] rounded-full h-3">
                    <div
                      className="bg-primary h-3 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(progress.progressPercentage, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Financial Summary */}
            <div className="flex flex-col gap-6 mb-6">
              <div className="rounded-xl bg-[#483923] p-6">
                <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em] mb-6">Financial Summary</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[#c9b292] text-sm font-medium">Current Price</span>
                      <span className="text-white text-lg font-bold">
                        {progress.currentPriceUSD ? formatCurrencyUSD(progress.currentPriceUSD) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#c9b292] text-sm font-medium">Target Value</span>
                      <span className="text-white text-lg font-bold">
                        {usdValues ? formatCurrencyUSD(usdValues.targetValueUSD) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#c9b292] text-sm font-medium">Total Invested</span>
                      <span className="text-white text-lg font-bold">
                        {progress.currentValueUSDC ? formatCurrencyUSD(progress.currentValueUSDC) : 'N/A'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[#c9b292] text-sm font-medium">Current Value</span>
                      <span className="text-white text-lg font-bold">
                        {progress.currentValueUSDC ? formatCurrencyUSD(progress.currentValueUSDC) : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#c9b292] text-sm font-medium">Profit/Loss</span>
                      <span className={`text-lg font-bold ${
                        usdValues && usdValues.profitLossUSD >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {usdValues ? formatCurrencyUSD(usdValues.profitLossUSD) : '$0.00'} ({usdValues?.profitLossPercentage.toFixed(1) || '0.0'}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#c9b292] text-sm font-medium">Remaining</span>
                      <span className="text-white text-lg font-bold">
                        {progress.remainingAmount.toFixed(6)} {progress.coin}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Investment Plan */}
            <div className="flex flex-col gap-6 mb-6">
              <div className="rounded-xl bg-[#483923] p-6">
                <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em] mb-6">Investment Plan</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-[#c9b292] text-sm font-medium">Frequency</span>
                      <span className="text-white text-lg font-bold">
                        {progress.frequency.charAt(0) + progress.frequency.slice(1).toLowerCase()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#c9b292] text-sm font-medium">Amount per Interval</span>
                      <span className="text-white text-lg font-bold">
                        {formatCurrencyUSD(progress.amountInr)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-[#c9b292] text-sm font-medium">Next Investment</span>
                      <span className="text-white text-lg font-bold">
                        {formatDate(progress.nextInvestmentDate)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-4">
                    {progress.estimatedCompletion && (
                      <>
                        <div className="flex justify-between items-center">
                          <span className="text-[#c9b292] text-sm font-medium">Estimated Completion</span>
                          <span className="text-white text-lg font-bold">
                            {formatDate(progress.estimatedCompletion.estimatedCompletionDate)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[#c9b292] text-sm font-medium">Intervals Needed</span>
                          <span className="text-white text-lg font-bold">
                            {progress.estimatedCompletion.intervalsNeeded}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between items-center">
                      <span className="text-[#c9b292] text-sm font-medium">Last Updated</span>
                      <span className="text-white text-lg font-bold">
                        {formatTime(progress.updatedAt)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Investment Section */}
            <div className="flex flex-col gap-6 mb-6">
              <div className="rounded-xl bg-[#483923] p-6">
                <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em] mb-6">Invest in This Goal</h2>
                <InvestFlow
                  goalId={goalId}
                  goalCoin={progress.coin}
                  onSuccess={() => {
                    // Refresh progress and transaction history after successful investment
                    fetchProgress();
                    if (transactionHistoryRef.current) {
                      transactionHistoryRef.current.refresh();
                    }
                  }}
                />
              </div>
            </div>

            {/* Transaction History */}
            <div className="mb-6">
              <TransactionHistory ref={transactionHistoryRef} goalId={goalId} />
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-4 p-4 mt-8 border-t border-solid border-[#483923]">
              <button 
                onClick={() => router.push('/goals')}
                className="text-[#c9b292] text-sm font-bold leading-normal tracking-[0.015em] hover:text-white transition-colors"
              >
                Back to Goals
              </button>
              {progress.status === 'ACTIVE' ? (
                <button 
                  onClick={handlePauseGoal}
                  disabled={actionLoading}
                  className="flex min-w-[120px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-12 px-6 bg-yellow-600 text-white text-base font-bold leading-normal tracking-[0.015em] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="truncate">{actionLoading ? 'Pausing...' : 'Pause Goal'}</span>
                </button>
              ) : (
                <button 
                  onClick={handleResumeGoal}
                  disabled={actionLoading}
                  className="flex min-w-[120px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-12 px-6 bg-green-600 text-white text-base font-bold leading-normal tracking-[0.015em] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="truncate">{actionLoading ? 'Resuming...' : 'Resume Goal'}</span>
                </button>
              )}
              <button 
                onClick={handleEditGoal}
                className="flex min-w-[120px] max-w-[480px] cursor-pointer items-center justify-center overflow-hidden rounded-full h-12 px-6 bg-primary text-[#221b11] text-base font-bold leading-normal tracking-[0.015em] hover:opacity-90 transition-opacity"
              >
                <span className="truncate">Edit Goal</span>
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
