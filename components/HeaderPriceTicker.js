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

// Token icon mapping
const TOKEN_ICONS = {
  'BTC': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij/logo.png',
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

  // Duplicate symbols for seamless loop
  const displaySymbols = [...symbols, ...symbols];

  return (
    <div className="hidden min-w-0 flex-1 items-center justify-center md:flex">
      <div className="relative w-full max-w-3xl overflow-hidden">
        {/* Gradient overlays for fade effect */}
        <div className="absolute left-0 top-0 z-10 h-full w-16 bg-gradient-to-r from-[var(--bg-main)] to-transparent pointer-events-none" />
        <div className="absolute right-0 top-0 z-10 h-full w-16 bg-gradient-to-l from-[var(--bg-main)] to-transparent pointer-events-none" />
        
        {/* Auto-scrolling marquee */}
        <div className="flex gap-3 animate-scroll">
          {displaySymbols.map((symbol, index) => {
            const price = prices[symbol];
            if (!price) return null;
            const iconUrl = TOKEN_ICONS[symbol];

            return (
              <div
                key={`${symbol}-${index}`}
                className="flex min-w-[140px] items-center gap-2 rounded-full border border-[#2a1c11] bg-[#1d140c] px-3 py-2 text-xs text-white/70 transition-all duration-300 hover:border-[var(--accent)]/30 hover:bg-[#24160e]"
              >
                {iconUrl && (
                  <img 
                    src={iconUrl} 
                    alt={symbol}
                    className="w-5 h-5 rounded-full flex-shrink-0"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                )}
                <div className="flex flex-col leading-tight min-w-0">
                  <span className="text-xs font-semibold text-white truncate">{symbol}</span>
                  <span className="text-[0.7rem] text-white/60">${formatPrice(price)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

