'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Ordered list of top Jupiter tokens we care about */
const POPULAR_SYMBOLS = [
  'BTC',
  'ETH',
  'SOL',
  'USDC',
  'USDT',
  'JUP',
  'RAY',
  'BONK',
  'WIF',
  'PYTH',
];

/**
 * HeaderPriceTicker - Minimalist price ticker for dashboard header
 * Shows popular Jupiter tokens with live pricing
 */
export default function HeaderPriceTicker() {
  const [prices, setPrices] = useState({});
  const [symbols, setSymbols] = useState(POPULAR_SYMBOLS);
  const [loading, setLoading] = useState(true);
  const retryTimeoutRef = useRef(null);

  const fetchPrices = useCallback(async () => {
    try {
      const response = await fetch('/api/price/current?currency=USD', {
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        const latestPrices = data.prices || {};

        // Maintain consistent ordering while filtering missing entries
        const orderedSymbols = POPULAR_SYMBOLS.filter(
          (symbol) => latestPrices[symbol] !== undefined
        );

        setSymbols(orderedSymbols);
        setPrices(latestPrices);

        // If the API indicates stale data, queue a quick retry
        if (
          data.stale ||
          (data.source && data.source !== 'jupiter')
        ) {
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }
          retryTimeoutRef.current = setTimeout(() => {
            retryTimeoutRef.current = null;
            fetchPrices();
          }, 10_000);
        }
      }
    } catch (err) {
      console.error('Price fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrices();
    // Refresh every 2 minutes
    const interval = setInterval(fetchPrices, 2 * 60 * 1000);
    return () => {
      clearInterval(interval);
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [fetchPrices]);

  const trackRef = useRef(null);

  const scrollTrack = (direction) => {
    if (!trackRef.current) return;
    const scrollAmount = 160 * direction;
    trackRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
  };

  const formatPrice = (price) => {
    if (!price || price === 0) return '0';
    
    if (price >= 1000) {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0
      }).format(price);
    } else if (price >= 1) {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2
      }).format(price);
    } else {
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 6,
        minimumFractionDigits: 2
      }).format(price);
    }
  };

  if (loading) {
    return (
      <div className="hidden min-w-0 flex-1 items-center justify-center md:flex">
        <div className="flex w-full max-w-3xl items-center justify-center gap-2 rounded-full border border-[#2a1c11] bg-[#1a120a] px-4 py-2">
          <div className="h-8 w-8 rounded-full bg-[#24160e]/60 animate-pulse" />
          <div className="h-6 flex-1 rounded-full bg-[#24160e]/60 animate-pulse" />
          <div className="h-8 w-8 rounded-full bg-[#24160e]/60 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="hidden min-w-0 flex-1 items-center justify-center md:flex">
      <div className="relative flex w-full max-w-3xl items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => scrollTrack(-1)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2a1c11] bg-[#1a120a] text-[var(--text-secondary)] transition hover:text-[var(--accent)]"
          aria-label="Scroll tokens left"
        >
          ‹
        </button>

        <div
          ref={trackRef}
          className="ticker-scroll flex w-full gap-3 overflow-x-auto scroll-smooth px-1 py-1"
        >
          {symbols.map((symbol) => {
            const price = prices[symbol];
            if (!price) return null;

            return (
              <div
                key={symbol}
                className="flex min-w-[150px] items-center justify-between rounded-full border border-[#2a1c11] bg-[#1d140c] px-4 py-2 text-xs text-white/70"
              >
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold text-white">{symbol}</span>
                  <span>${formatPrice(price)}</span>
                </div>
                <span className="rounded-full bg-[#2a1d12] px-2 py-1 text-[0.6rem] font-medium uppercase tracking-[0.18em] text-white/45">
                  —
                </span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => scrollTrack(1)}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-[#2a1c11] bg-[#1a120a] text-[var(--text-secondary)] transition hover:text-[var(--accent)]"
          aria-label="Scroll tokens right"
        >
          ›
        </button>
      </div>
    </div>
  );
}

