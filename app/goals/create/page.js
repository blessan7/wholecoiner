'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';
import UserProfileBadge from '@/components/UserProfileBadge';
import { getWalletAddressFromPrivy } from '@/lib/user';
import { useToast } from '@/components/ToastContainer';
import { launchCelebration } from '@/lib/celebration';
import { getGoalCreationToast } from '@/lib/celebrationMessages';

const COIN_OPTIONS = [
  {
    value: 'BTC',
    label: 'Bitcoin',
    caption: 'Stack sats toward a full BTC.'
  },
  {
    value: 'ETH',
    label: 'Ethereum',
    caption: 'Own 32 ETH to run your own validator.'
  },
  {
    value: 'SOL',
    label: 'Solana',
    caption: 'Catch the next protocol run with SOL.'
  }
];

const FREQUENCY_OPTIONS = [
  { value: 'DAILY', label: 'Daily', helper: 'Micro-purchases every day' },
  { value: 'WEEKLY', label: 'Weekly', helper: 'Automate your weekend buys' },
  { value: 'MONTHLY', label: 'Monthly', helper: 'Align with payday momentum' }
];

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value >= 1000 ? 0 : 2
  }).format(Number(value || 0));

export default function CreateGoalPage() {
  const router = useRouter();
  const { ready, authenticated, user, logout } = usePrivy();
  const { addToast } = useToast();
  const submitButtonRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    coin: 'BTC',
    targetAmount: 1,
    frequency: 'MONTHLY',
    amountPerInterval: 5000
  });
  const [goalName, setGoalName] = useState('BTC Investment Goal');
  const [estimatedCompletion, setEstimatedCompletion] = useState(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [coinPriceUSD, setCoinPriceUSD] = useState(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      router.push('/');
    }
  }, [ready, authenticated, router]);

  // Update goal name when coin changes
  useEffect(() => {
    const coinNames = {
      'BTC': 'Bitcoin',
      'ETH': 'Ethereum',
      'SOL': 'Solana'
    };
    setGoalName(`${coinNames[formData.coin] || formData.coin} Investment Goal`);
  }, [formData.coin]);

  // Calculate estimated completion time
  useEffect(() => {
    const calculateEstimate = async () => {
      if (
        !formData.coin ||
        !formData.targetAmount ||
        !formData.amountPerInterval ||
        !formData.frequency ||
        formData.targetAmount <= 0 ||
        formData.amountPerInterval <= 0
      ) {
        setEstimatedCompletion(null);
        setCoinPriceUSD(null);
        return;
      }

      setLoadingEstimate(true);
      try {
        // Fetch current price in USD
        const priceResponse = await fetch(
          `/api/price/current?coins=${formData.coin}&currency=USD`,
          { credentials: 'include' }
        );
        
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          const priceUSD = priceData.prices?.[formData.coin] || 0;
          
          if (priceUSD === 0 || typeof priceUSD !== 'number') {
            setEstimatedCompletion(null);
            setCoinPriceUSD(null);
            setLoadingEstimate(false);
            return;
          }

          setCoinPriceUSD(priceUSD);

          // Calculate completion in USD
          const totalCostUSD = formData.targetAmount * priceUSD;
          const intervalsNeeded = Math.ceil(totalCostUSD / formData.amountPerInterval);

          if (!Number.isFinite(intervalsNeeded) || intervalsNeeded <= 0) {
            setEstimatedCompletion({
              error: 'Unable to project completion with the current contribution amount.',
              totalCostUSD: Math.round(totalCostUSD * 100) / 100
            });
            setLoadingEstimate(false);
            return;
          }
          
          const daysPerInterval = {
            'DAILY': 1,
            'WEEKLY': 7,
            'MONTHLY': 30
          }[formData.frequency];
          
          const daysToComplete = intervalsNeeded * daysPerInterval;
          const monthsToComplete = Math.ceil(daysToComplete / 30);
          
          const estimatedDate = new Date();
          estimatedDate.setDate(estimatedDate.getDate() + daysToComplete);

          setEstimatedCompletion({
            monthsToComplete,
            daysToComplete,
            intervalsNeeded,
            totalCostUSD: Math.round(totalCostUSD * 100) / 100,
            estimatedDate
          });
        } else {
          setEstimatedCompletion(null);
          setCoinPriceUSD(null);
        }
      } catch (error) {
        console.error('Failed to calculate estimate:', error);
        setEstimatedCompletion(null);
        setCoinPriceUSD(null);
      } finally {
        setLoadingEstimate(false);
      }
    };

    // Debounce calculation
    const timeoutId = setTimeout(calculateEstimate, 500);
    return () => clearTimeout(timeoutId);
  }, [formData.coin, formData.targetAmount, formData.amountPerInterval, formData.frequency]);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.success) {
        // Launch celebration
        if (submitButtonRef.current) {
          launchCelebration({ element: submitButtonRef.current });
        } else {
          launchCelebration();
        }
        
        // Show success toast
        addToast(getGoalCreationToast(), 'success', 5000);
        
        // Small delay to let celebration be visible before redirect
        setTimeout(() => {
          router.push('/dashboard');
        }, 1500);
      } else {
        setError(data.error?.message || 'Failed to create goal');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const formatDate = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      year: 'numeric'
    }).format(date);
  };

  const formatDuration = (months, days) => {
    if (months >= 12) {
      const years = Math.floor(months / 12);
      const remainingMonths = months % 12;
      if (remainingMonths === 0) {
        return `${years} ${years === 1 ? 'year' : 'years'}`;
      }
      return `${years} ${years === 1 ? 'year' : 'years'} ${remainingMonths} ${remainingMonths === 1 ? 'month' : 'months'}`;
    }
    if (days < 30) {
      return `${days} ${days === 1 ? 'day' : 'days'}`;
    }
    return `${months} ${months === 1 ? 'month' : 'months'}`;
  };

  if (!ready || !authenticated || !user) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg-main)] bg-gradient-to-b from-[var(--bg-main)] via-[#17110b] to-[#120904] flex flex-col items-center justify-center text-[var(--text-primary)]">
        <div className="w-12 h-12 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-[var(--text-secondary)]">Loading your workspace…</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[var(--bg-main)] bg-gradient-to-b from-[var(--bg-main)] via-[#17110b] to-[#120904] text-[var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="hero-gradient" />
      </div>

      <header className="relative z-20 w-full px-6 pt-6 sm:px-8 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/dashboard" className="flex items-center gap-3 text-[var(--text-primary)]">
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
          </Link>

          <nav className="flex items-center gap-5 text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">
            <Link href="/dashboard" className="hover:text-[var(--accent)] transition-colors">
              Dashboard
            </Link>
            <span className="text-[var(--text-primary)]">Goals</span>
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-right text-[10px] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
              <span>Goal builder</span>
              <span className="text-[var(--accent)]">Create</span>
            </div>
            <UserProfileBadge
              displayName={displayName}
              walletAddress={walletAddress}
              avatarUrl={avatarUrl}
              size="sm"
              orientation="horizontal"
              onLogout={handleLogout}
              className="bg-[#22160d] border-none shadow-none px-3 py-2"
            />
          </div>
        </div>
      </header>

      <main className="relative z-10 w-full">
        <div className="mx-auto max-w-6xl px-6 pb-16 pt-12 sm:px-8 md:px-10">
          <section className="rounded-3xl border border-[#292018] bg-[#17110b]/85 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)] backdrop-blur-sm sm:p-8">
            <nav className="flex items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-[var(--text-secondary)]">
              <Link href="/dashboard" className="hover:text-[var(--accent)] transition-colors">
                Dashboard
              </Link>
              <span>•</span>
              <span className="text-[var(--text-primary)]">Create</span>
            </nav>

            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="space-y-4">
                <h1 className="text-3xl font-bold leading-tight sm:text-4xl">
                  Build the path to your next whole coin.
                </h1>
                <p className="text-sm text-[var(--text-secondary)]">
                  Choose a coin, set the finish line, and we’ll pace the journey. Every contribution stacks momentum toward your {formData.coin} target.
                </p>
              </div>

              <div className="flex flex-col gap-4 rounded-2xl border border-[#292018] bg-[#150e08] p-6 shadow-[0_18px_70px_rgba(0,0,0,0.45)]">
                <div className="flex items-center justify-between">
                  <span className="text-[0.62rem] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                    Current price
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                    Auto-refreshed
                  </span>
                </div>
                <div className="text-3xl font-semibold text-[var(--text-primary)]">
                  {coinPriceUSD ? formatCurrency(coinPriceUSD) : '—'}
                </div>
                <p className="text-xs text-[var(--text-secondary)]">
                  Latest {formData.coin} spot price powers your completion estimate. Adjust contributions to see the timeline update.
                </p>
              </div>
            </div>
          </section>

          <form onSubmit={handleSubmit} className="mt-10 grid gap-6">
            <section className="rounded-3xl border border-[#292018] bg-[#17110b]/85 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                    Step 1
                  </p>
                  <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Choose your asset</h2>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  Focus on one race—switch assets later if needed.
                </span>
              </header>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {COIN_OPTIONS.map((option) => {
                  const isActive = formData.coin === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, coin: option.value })}
                      className={`group flex h-full flex-col justify-between rounded-2xl border p-5 text-left transition-all duration-200 ${
                        isActive
                          ? 'border-[var(--accent)] bg-[#1f150c] shadow-[0_18px_60px_rgba(255,159,28,0.15)]'
                          : 'border-[#2a2016] bg-[#140d08] hover:border-[var(--accent)]/50 hover:bg-[#1a120a]'
                      }`}
                      aria-pressed={isActive}
                    >
                      <span className="text-[0.7rem] uppercase tracking-[0.32em] text-[var(--text-secondary)]">
                        {option.value}
                      </span>
                      <div className="mt-4 text-lg font-semibold text-[var(--text-primary)]">
                        {option.label}
                      </div>
                      <p className="mt-2 text-sm text-[var(--text-secondary)]">{option.caption}</p>
                      <span
                        className={`mt-4 inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.26em] transition-colors ${
                          isActive ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'bg-[#22160d] text-[var(--text-secondary)]'
                        }`}
                      >
                        {isActive ? 'Selected' : 'Tap to select'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-[#292018] bg-[#17110b]/85 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                    Step 2
                  </p>
                  <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Set the finish line</h2>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  Aim for the amount that makes your story brag-worthy.
                </span>
              </header>

              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
                  Goal name
                  <input
                    id="goal-name"
                    value={goalName}
                    readOnly
                    className="h-12 rounded-full border border-[#292018] bg-[#150e08] px-5 text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
                  />
                  <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-secondary)]/70">
                    Auto-generated from your asset
                  </span>
                </label>

                <label className="flex flex-col gap-2 text-sm text-[var(--text-secondary)]">
                  Target amount
                  <div className="relative">
                    <input
                      id="target-amount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={formData.targetAmount}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          targetAmount: parseFloat(e.target.value) || 0
                        })
                      }
                      required
                      placeholder="1.0"
                      className="h-12 w-full rounded-full border border-[#292018] bg-[#150e08] pl-5 pr-16 text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-5 flex items-center text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">
                      coins
                    </span>
                  </div>
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-[#292018] bg-[#17110b]/85 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                    Step 3
                  </p>
                  <h2 className="text-2xl font-semibold text-[var(--text-primary)]">Design your cadence</h2>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  Micro-investing keeps momentum alive.
                </span>
              </header>

              <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="flex flex-col gap-4">
                  <span className="text-xs uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                    Investment frequency
                  </span>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {FREQUENCY_OPTIONS.map((freq) => {
                      const isActive = formData.frequency === freq.value;
                      return (
                        <button
                          key={freq.value}
                          type="button"
                          onClick={() => setFormData({ ...formData, frequency: freq.value })}
                          className={`flex h-full flex-col items-start gap-2 rounded-2xl border p-4 text-left transition ${
                            isActive
                              ? 'border-[var(--accent)] bg-[#1f150c] text-[var(--text-primary)] shadow-[0_18px_60px_rgba(255,159,28,0.15)]'
                              : 'border-[#2a2016] bg-[#140d08] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]'
                          }`}
                          aria-pressed={isActive}
                        >
                          <span className="text-sm font-semibold uppercase tracking-[0.24em]">
                            {freq.label}
                          </span>
                          <span className="text-xs text-[var(--text-secondary)]/80">{freq.helper}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="flex flex-col gap-3 rounded-2xl border border-[#292018] bg-[#150e08] p-5 text-sm text-[var(--text-secondary)]">
                  Amount per interval (USDC)
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-[var(--text-secondary)]">$</span>
                    <input
                      id="amount-per-interval"
                      type="number"
                      step="10"
                      min="10"
                      value={formData.amountPerInterval}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          amountPerInterval: parseFloat(e.target.value) || 0
                        })
                      }
                      required
                      className="h-12 w-full rounded-full border border-[#392715] bg-[#1a120a] pl-8 pr-4 text-sm text-[var(--text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
                    />
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-secondary)]/70">
                    Minimum 10 USDC per interval
                  </span>
                </label>
              </div>
            </section>

            <section className="rounded-3xl border border-[#292018] bg-[#17110b]/85 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8">
              <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[0.62rem] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                    Step 4
                  </p>
                  <h2 className="text-2xl font-semibold text-[var(--text-primary)]">
                    Preview your runway
                  </h2>
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  Estimates update as you tweak the plan.
                </span>
              </header>

              <div className="mt-6 rounded-2xl border border-[#292018] bg-[#150e08] p-6">
                {loadingEstimate ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-10">
                    <div className="h-10 w-10 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
                    <span className="text-sm text-[var(--text-secondary)]">Crunching the numbers…</span>
                  </div>
                ) : estimatedCompletion?.error ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-red-500/40 bg-red-900/20 p-4 text-sm text-red-300">
                      {estimatedCompletion.error}
                    </div>
                    {estimatedCompletion.totalCostUSD && (
                      <div className="flex items-center justify-between rounded-2xl border border-[#292018] bg-[#1a120a] p-4">
                        <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">
                          Total investment required
                        </span>
                        <span className="text-lg font-semibold text-[var(--text-primary)]">
                          {formatCurrency(estimatedCompletion.totalCostUSD)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : estimatedCompletion ? (
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                        Estimated timeline
                      </p>
                      <p className="text-2xl font-semibold text-[var(--text-primary)]">
                        {formatDuration(
                          estimatedCompletion.monthsToComplete,
                          estimatedCompletion.daysToComplete
                        )}
                      </p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        You’ll cross the finish line around{' '}
                        <span className="text-[var(--text-primary)] font-medium">
                          {formatDate(estimatedCompletion.estimatedDate)}
                        </span>
                        .
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between rounded-2xl border border-[#292018] bg-[#1a120a] p-4">
                        <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">
                          Total investment
                        </span>
                        <span className="text-lg font-semibold text-[var(--text-primary)]">
                          {formatCurrency(estimatedCompletion.totalCostUSD)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between rounded-2xl border border-[#292018] bg-[#1a120a] p-4">
                        <span className="text-xs uppercase tracking-[0.24em] text-[var(--text-secondary)]">
                          Contributions needed
                        </span>
                        <span className="text-lg font-semibold text-[var(--text-primary)]">
                          {estimatedCompletion.intervalsNeeded}
                        </span>
                      </div>
                    </div>

                    {coinPriceUSD && (
                      <div className="sm:col-span-2 rounded-2xl border border-[#292018] bg-[#1a120a] p-4 text-xs text-[var(--text-secondary)]">
                        Based on the current {formData.coin} price of{' '}
                        <span className="text-[var(--text-primary)] font-medium">
                          {formatCurrency(coinPriceUSD)}
                        </span>
                        . Your timeline adapts automatically as the market moves.
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-[var(--text-secondary)]">
                    <span>Fill in your target and cadence to preview milestones.</span>
                  </div>
                )}
              </div>
            </section>

            {error && (
              <div className="rounded-3xl border border-red-500/30 bg-red-900/20 p-5 text-sm text-red-200 shadow-[0_20px_70px_rgba(0,0,0,0.45)]">
                {error}
              </div>
            )}

            <section className="flex flex-col gap-4 rounded-3xl border border-[#292018] bg-[#17110b]/85 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:flex-row sm:items-center sm:justify-between sm:p-8">
              <div className="text-xs text-[var(--text-secondary)]">
                By creating this goal you agree to our stacking cadence and understand that market prices can shift the completion date.
              </div>
              <div className="flex sm:flex-row sm:items-center">
                <button
                  ref={submitButtonRef}
                  type="submit"
                  disabled={loading || loadingEstimate}
                  className="btn-primary flex h-11 items-center justify-center px-8 text-sm font-semibold uppercase tracking-[0.18em] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-flex h-4 w-4 items-center justify-center">
                        <span className="h-full w-full rounded-full border-2 border-[#0d0804] border-t-transparent animate-spin" />
                      </span>
                      Creating…
                    </span>
                  ) : (
                    'Create goal'
                  )}
                </button>
              </div>
            </section>
          </form>
        </div>
      </main>
    </div>
  );
}