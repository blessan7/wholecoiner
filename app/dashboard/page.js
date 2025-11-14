'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import UserProfileBadge from '@/components/UserProfileBadge';
import HoldingsDetailModal from '@/components/HoldingsDetailModal';
import { getWalletAddressFromPrivy } from '@/lib/user';

const STATUS_STYLES = {
  ACTIVE: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  PAUSED: 'border border-amber-400/30 bg-amber-500/10 text-amber-200',
  COMPLETED:
    'border border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]',
};

export default function Dashboard() {
  const router = useRouter();
  const { ready, authenticated, user, logout } = usePrivy();

  const [userData, setUserData] = useState(null);
  const [goals, setGoals] = useState([]);
  const [holdings, setHoldings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalBalance: 0,
    overallProgress: 0,
    activeGoals: 0,
  });
  const [selectedHolding, setSelectedHolding] = useState(null);

  // Redirect unauthenticated users
  useEffect(() => {
    if (ready && !authenticated) {
      router.push('/');
    }
  }, [ready, authenticated, router]);

  // Load user data and goals after authentication
  useEffect(() => {
    if (ready && authenticated) {
      fetchUserAndGoals();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  const fetchUserAndGoals = async () => {
    try {
      const response = await fetch('/api/user', { credentials: 'include' });

      if (response.status === 401) {
        router.push('/');
        return;
      } else if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUserData(data.user);
          fetchGoals();
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setLoading(false);
    }
  };

  const fetchGoals = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/goals', { credentials: 'include' });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const list = data.goals || [];
          setGoals(list);
          calculateStats(list);
        }
      }
      
      // Also fetch holdings
      await fetchHoldings();
    } catch (err) {
      console.error('Error fetching goals:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHoldings = async () => {
    try {
      const response = await fetch('/api/holdings', { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setHoldings(data.holdings || []);
        }
      }
    } catch (err) {
      console.error('Error fetching holdings:', err);
    }
  };

  const calculateStats = (goalsData) => {
    const activeGoals = goalsData.filter((g) => g.status === 'ACTIVE');
    const activeGoalsCount = activeGoals.length;

    let overallProgress = 0;
    if (activeGoalsCount > 0) {
      const totalProgress = activeGoals.reduce(
        (sum, goal) => sum + (goal.progressPercentage || 0),
        0
      );
      overallProgress = Math.round(totalProgress / activeGoalsCount);
    }

    const totalBalance = goalsData.reduce(
      (sum, goal) => sum + (parseFloat(goal.investedAmount) || 0),
      0
    );

    setStats({
      totalBalance,
      overallProgress,
      activeGoals: activeGoalsCount,
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const getUserName = () => {
    if (userData?.email) {
      const emailPrefix = userData.email.split('@')[0];
      return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1);
    }
    return 'Wholecoiner';
  };

  const avatarUrl = useMemo(() => {
    const accounts = user?.linkedAccounts;
    if (!accounts || !Array.isArray(accounts)) return null;

    const googleAccount = accounts.find(
      (account) => account.type === 'google_oauth'
    );

    return googleAccount?.picture ?? null;
  }, [user?.linkedAccounts]);

  // Loading state
  if (!ready || loading) {
    return (
      <div className="min-h-screen w-full bg-[var(--bg-main)] bg-gradient-to-b from-[var(--bg-main)] via-[#17110b] to-[#120904] flex flex-col items-center justify-center text-[var(--text-primary)]">
        <div className="w-12 h-12 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm text-[var(--text-secondary)]">
          {!ready ? 'Loading…' : 'Setting up your dashboard…'}
        </p>
      </div>
    );
  }

  if (!authenticated || !user) return null;

  const userName = getUserName();
  const walletAddress =
    userData?.walletAddress ||
    getWalletAddressFromPrivy(user) ||
    '';

  const formatTokenAmount = (value, coin) => {
    const numeric = Number(value || 0);
    if (Number.isNaN(numeric)) return `0 ${coin}`;
    if (numeric >= 1) return `${numeric.toFixed(2)} ${coin}`;
    return `${numeric.toFixed(4)} ${coin}`;
  };

  const formatFiat = (value) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(value || 0));

  // Helper function to get token icon URL
  const getTokenIcon = (coinSymbol) => {
    const symbol = coinSymbol?.toUpperCase();
    const iconMap = {
      'BTC': 'https://assets.coingecko.com/coins/images/1/large/bitcoin.png',
      'ETH': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs/logo.png',
      'SOL': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
      'USDC': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
      'USDT': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
      'JUP': 'https://static.jup.ag/jup/icon.png',
      'RAY': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png',
      'BONK': 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
      'WIF': 'https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betidfwy3ajsav2vjzyum.ipfs.nftstorage.link',
      'PYTH': 'https://pyth.network/token.svg',
    };
    return iconMap[symbol] || null;
  };

  const humanizeFrequency = (freq) => {
    if (!freq) return 'Flexible cadence';
    return freq.charAt(0) + freq.slice(1).toLowerCase();
  };

  const renderGoalCard = (goal) => {
    const statusStyle =
      STATUS_STYLES[goal.status] ||
      'border border-[#292018] bg-[#17110b] text-[var(--text-secondary)]';

    const progress = Math.max(
      0,
      Math.min(100, Number(goal.progressPercentage) || 0)
    );

    const invested = formatTokenAmount(goal.investedAmount, goal.coin);
    const target = formatTokenAmount(goal.targetAmount, goal.coin);
    const remaining = formatTokenAmount(
      (goal.targetAmount || 0) - (goal.investedAmount || 0),
      goal.coin
    );
    const frequency = humanizeFrequency(goal.frequency);

    const createdAt = goal.createdAt
      ? new Date(goal.createdAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : '—';

    return (
      <div
        key={goal.id}
        onClick={() => router.push(`/goals/${goal.id}`)}
        className="group relative flex h-full cursor-pointer flex-col gap-6 overflow-hidden rounded-3xl border border-[#292018] bg-[#17110b]/95 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.65)] transition-transform duration-200 hover:-translate-y-1 hover:shadow-[0_40px_120px_rgba(0,0,0,0.8)]"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 text-left">
            <p className="text-[10px] uppercase tracking-[0.24em] text-[var(--text-secondary)]">
              {goal.coin} accumulation
            </p>
            <h3 className="text-xl font-semibold text-[var(--text-primary)]">
              Target {target}
            </h3>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${statusStyle}`}
          >
            {goal.status}
          </span>
        </div>

        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
          <div className="flex justify-between gap-3">
            <span>Invested so far</span>
            <span className="text-[var(--text-primary)]">{invested}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Remaining</span>
            <span className="text-[var(--text-primary)]">{remaining}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Contribution cadence</span>
            <span className="text-[var(--text-primary)]">
              {frequency}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Created</span>
            <span className="text-[var(--text-primary)]">
              {createdAt}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
            <span>{invested}</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-[#24160e]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
          <span>Tap to view progress details</span>
          <span className="text-[var(--accent)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:scale-105">
            View goal →
          </span>
        </div>
      </div>
    );
  };

  const totalBalanceFormatted = formatFiat(stats.totalBalance);

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[var(--bg-main)] bg-gradient-to-b from-[var(--bg-main)] via-[#17110b] to-[#120904] text-[var(--text-primary)]">
      {/* Soft background glow */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="hero-gradient" />
      </div>

      {/* Header */}
      <header className="relative z-20 w-full px-6 pt-6 sm:px-8 md:px-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent)] text-[#0d0804] font-bold shadow-[0_12px_40px_rgba(255,159,28,0.25)]">
              <svg
                className="h-4 w-4"
                viewBox="0 0 48 48"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  clipRule="evenodd"
                  d="M24 4H6V17.3333V30.6667H24V44H42V30.6667V17.3333H24V4Z"
                  fill="currentColor"
                  fillRule="evenodd"
                />
              </svg>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
              <span className="text-sm font-semibold tracking-tight sm:text-base">
                Wholecoiner
              </span>
                <nav className="flex items-center gap-6 text-xs font-semibold uppercase tracking-[0.24em] text-[var(--text-secondary)]">
                  <span className="text-[var(--text-primary)] text-sm">
                  Dashboard
                </span>
              </nav>
            </div>
          </div>

          <UserProfileBadge
            displayName={userName}
            walletAddress={walletAddress}
            avatarUrl={avatarUrl}
            size="sm"
            orientation="horizontal"
            onLogout={handleLogout}
            className="bg-[#22160d] border-none shadow-none px-3 py-2"
          />
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 w-full">
        <div className="mx-auto max-w-6xl space-y-12 px-6 pb-16 pt-12 sm:px-8 md:px-10">
          {/* Hero / summary */}
          <section className="space-y-8 rounded-3xl border border-[#292018] bg-[#17110b]/80 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)] backdrop-blur-sm sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-3 text-left">
                <p className="text-[0.68rem] uppercase tracking-[0.32em] text-[var(--text-secondary)]">
                  Wholecoiner Dashboard
                </p>
                <div>
                  <h1 className="text-3xl font-bold text-[var(--text-primary)] sm:text-4xl">
                    Hey {userName}, you’re building your 1.0 story.
                  </h1>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    Track your pace, celebrate your wins, and keep stacking
                    toward your Wholecoiner milestone.
                  </p>
                </div>
              </div>
              <button
                onClick={() => router.push('/goals/create')}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[#0d0804] shadow-[0_20px_60px_rgba(255,159,28,0.35)] transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-[0_28px_80px_rgba(255,159,28,0.45)] sm:w-auto"
              >
                + Create a new goal
              </button>
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-3 rounded-2xl border border-[#292018] bg-[#150e08] p-6 shadow-[0_18px_70px_rgba(0,0,0,0.45)]">
                <span className="text-[0.62rem] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                  Total balance
                </span>
                <span className="text-3xl font-semibold text-[var(--text-primary)]">
                  {totalBalanceFormatted}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  Across all active accumulation goals
                </span>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-[#292018] bg-[#150e08] p-6 shadow-[0_18px_70px_rgba(0,0,0,0.45)]">
                <span className="text-[0.62rem] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                  Overall progress
                </span>
                <span className="text-3xl font-semibold text-[var(--text-primary)]">
                  {stats.overallProgress}%
                </span>
                <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#24160e]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)] transition-all duration-500"
                    style={{ width: `${stats.overallProgress}%` }}
                  />
                </div>
                <span className="text-xs text-[var(--text-secondary)]">
                  Weighted across active goals
                </span>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-[#292018] bg-[#150e08] p-6 shadow-[0_18px_70px_rgba(0,0,0,0.45)]">
                <span className="text-[0.62rem] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                  Active goals
                </span>
                <span className="text-3xl font-semibold text-[var(--text-primary)]">
                  {stats.activeGoals}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">
                  Targets currently in motion
                </span>
              </div>
            </div>
          </section>

          {/* Holdings */}
          {holdings.length > 0 && (
            <section className="space-y-6 rounded-3xl border border-[#292018] bg-[#17110b]/80 p-6 shadow-[0_30px_100px_rgba(0,0,0,0.65)] backdrop-blur-sm sm:p-8">
              <div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                  Your Holdings
                </h2>
                <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                  Tokens accumulated across all goals
                </p>
              </div>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {holdings.map((holding) => {
                  const tokenIcon = getTokenIcon(holding.coin);
                  return (
                    <button
                      type="button"
                      key={holding.coin}
                      onClick={() => setSelectedHolding(holding)}
                      className="flex flex-col gap-3 rounded-2xl border border-[#292018] bg-[#150e08] p-6 text-left shadow-[0_18px_70px_rgba(0,0,0,0.45)] transition-transform duration-150 hover:-translate-y-1 hover:shadow-[0_26px_90px_rgba(0,0,0,0.6)]"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {tokenIcon && (
                            <img 
                              src={tokenIcon} 
                              alt={holding.coin}
                              className="w-5 h-5 rounded-full"
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          )}
                          <span className="text-[0.62rem] uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                            {holding.coin}
                          </span>
                        </div>
                        <span className="text-xs text-[var(--accent)]">
                          {holding.goals.length} {holding.goals.length === 1 ? 'goal' : 'goals'}
                        </span>
                      </div>
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-semibold text-[var(--text-primary)]">
                        {formatTokenAmount(holding.totalAmount, holding.coin)}
                      </span>
                      <span className="text-[0.62rem] uppercase tracking-[0.24em] text-[var(--text-secondary)]">
                        {holding.swaps?.length || 0} swap{holding.swaps?.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--text-secondary)]">
                      Total accumulated
                    </span>
                  </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Goals */}
          <section className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-[var(--text-primary)]">
                  Your goals
                </h2>
                <p className="text-xs uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                  Progress you can feel • Every sat gets you closer to 1.0
                </p>
              </div>
              <div className="flex gap-2 rounded-full border border-[#292018] bg-[#17110b] p-1 text-xs uppercase tracking-[0.18em] text-[var(--text-secondary)]">
                <button className="rounded-full px-3 py-1 bg-[#22160d] text-[var(--text-primary)]">
                  Active
                </button>
                <button className="rounded-full px-3 py-1 hover:text-[var(--accent)] transition-colors">
                  Completed
                </button>
                <button
                  className="rounded-full px-3 py-1 hover:text-[var(--accent)] transition-colors"
                  onClick={() => router.push('/dashboard')}
                >
                  All goals
                </button>
              </div>
            </div>

            {goals.length === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-3xl border border-[#292018] bg-[#17110b]/85 p-12 text-center shadow-[0_26px_90px_rgba(0,0,0,0.6)]">
                <span className="text-sm uppercase tracking-[0.26em] text-[var(--text-secondary)]">
                  No goals yet
                </span>
                <h3 className="text-2xl font-semibold text-[var(--text-primary)]">
                  Start your path to 1.0 with your first accumulation target.
                </h3>
                <button
                  onClick={() => router.push('/goals/create')}
                  className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-[#0d0804] shadow-[0_20px_60px_rgba(255,159,28,0.35)] transition-transform hover:-translate-y-0.5 hover:shadow-[0_26px_80px_rgba(255,159,28,0.45)]"
                >
                  Create your first goal
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {goals.map(renderGoalCard)}
              </div>
            )}
          </section>
        </div>
      </main>

      {selectedHolding && (
        <HoldingsDetailModal
          holding={selectedHolding}
          onClose={() => setSelectedHolding(null)}
        />
      )}

      {/* Footer */}
      <footer className="relative z-10 w-full border-t border-[#292018] bg-[#0f0805]/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-xs text-[var(--text-secondary)] sm:px-8 md:px-10">
          <span>
            © {new Date().getFullYear()} Wholecoiner. All rights reserved.
          </span>
          <div className="flex items-center gap-5">
            <button className="hover:text-[var(--accent)] transition-colors">
              Privacy
            </button>
            <button className="hover:text-[var(--accent)] transition-colors">
              Security
            </button>
            <button className="hover:text-[var(--accent)] transition-colors">
              Support
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}