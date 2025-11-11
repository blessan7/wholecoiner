'use client';

import { useState, useEffect } from 'react';

// Default popular coins - all top 10 tokens
const DEFAULT_COINS = ['SOL', 'USDC', 'USDT', 'BTC', 'ETH', 'JUP', 'RAY', 'BONK', 'WIF', 'PYTH'];

export default function PriceTicker({ coins = DEFAULT_COINS }) {
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fetchedAt, setFetchedAt] = useState(null);
  const [stale, setStale] = useState(false);
  const [source, setSource] = useState('jupiter');

  useEffect(() => {
    fetchPrices();
    // Refresh every 2 minutes (Jupiter cache is 2 min)
    const interval = setInterval(fetchPrices, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [coins.join(',')]); // Re-fetch if coins change

  const fetchPrices = async () => {
    try {
      setError('');
      // Fetch USD prices, don't specify coins to get all 10
      const response = await fetch(`/api/price/current?currency=USD`, {
        credentials: 'include',
      });
      
      const data = await response.json();
      
      if (data.success) {
        setPrices(data.prices);
        setFetchedAt(data.fetchedAt);
        setStale(data.stale || false);
        setSource(data.source || 'jupiter');
        
        // Show warning if prices are from cache or mixed source
        if (data.source === 'cached') {
          console.warn('Using cached prices (Jupiter API unavailable)');
        } else if (data.source === 'mixed') {
          console.warn('Some prices may be from cache');
        }
      } else {
        setError(data.error?.message || 'Failed to fetch prices');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Price fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    if (!price || price === 0) return '0';
    
    // Format based on price magnitude (USD format)
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

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Filter to show only coins that have prices from Jupiter
  const availableCoins = DEFAULT_COINS.filter(coin => prices[coin] !== undefined);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-black">Live Prices (USD)</h2>
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-black">Loading prices from Jupiter...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <h2 className="text-xl font-semibold mb-4 text-black">Live Prices (USD)</h2>
        <div className="bg-red-50 border border-red-200 rounded p-3">
          <p className="text-sm text-red-700">{error}</p>
          <button 
            onClick={fetchPrices}
            className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-black">Live Prices (USD)</h2>
        <div className="flex items-center gap-2">
          {source === 'jupiter' && (
            <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded" title="Prices from Jupiter API">
              ✓ Jupiter
            </span>
          )}
          {stale && (
            <span className="text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded">
              Stale
            </span>
          )}
          {source === 'cached' && (
            <span className="text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded" title="Cached prices (Jupiter unavailable)">
              Cached
            </span>
          )}
          <span className="text-xs text-black">
            Updated: {formatTime(fetchedAt)}
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-5 gap-4">
        {availableCoins.map((coin) => {
          const price = prices[coin];
          if (price === undefined || price === null) return null;
          
          return (
            <div 
              key={coin}
              className="border border-gray-200 rounded-lg p-3 hover:border-blue-300 transition-colors"
            >
              <div className="text-xs font-medium text-black mb-1">{coin}</div>
              <div className="text-lg font-bold text-black">
                ${formatPrice(price)}
              </div>
            </div>
          );
        })}
      </div>
      
      {availableCoins.length === 0 && (
        <div className="text-center py-4 text-black text-sm">
          No prices available from Jupiter API. Please try again later.
        </div>
      )}
      
      {availableCoins.length < DEFAULT_COINS.length && (
        <div className="mt-3 text-xs text-yellow-600 text-center">
          {DEFAULT_COINS.length - availableCoins.length} token(s) unavailable
        </div>
      )}
    </div>
  );
}
