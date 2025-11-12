'use client';

import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { getTxExplorerUrl } from '@/lib/solana-explorer';

const TransactionHistory = forwardRef(function TransactionHistory(
  { goalId, className = '', showHeader = true, title = 'Transaction History' },
  ref
) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTransactions();
  }, [goalId]);

  // Expose refresh function to parent components
  useImperativeHandle(ref, () => ({
    refresh: fetchTransactions
  }));

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/transactions?goalId=${goalId}&limit=10`);
      const data = await response.json();

      if (data.success) {
        setTransactions(data.transactions || []);
      } else {
        setError(data.error?.message || 'Failed to fetch transactions');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  };

  const formatCurrency = (amount) => {
    if (!amount) return '0 USDC';
    return `${amount.toFixed(2)} USDC`;
  };

  const formatAmount = (amount, decimals = 6) => {
    if (!amount) return '0';
    return parseFloat(amount).toFixed(decimals);
  };

  const getStatusBadgeClassDark = (status) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-500/20 text-green-400 border border-green-500/30';
      case 'PENDING':
        return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30';
      case 'FAILED':
        return 'bg-red-500/20 text-red-400 border border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border border-gray-500/30';
    }
  };

  const getTypeBadgeClassDark = (type) => {
    return type === 'ONRAMP' 
      ? 'bg-primary/20 text-primary border border-primary/30' 
      : 'bg-purple-500/20 text-purple-400 border border-purple-500/30';
  };

  if (loading) {
    return (
      <div className={`rounded-xl bg-[#483923] p-6 ${className}`}>
        {showHeader && (
          <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em] mb-4">{title}</h2>
        )}
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-[#c9b292] text-sm">Loading transactions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-xl bg-[#483923] p-6 ${className}`}>
        {showHeader && (
          <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em] mb-4">{title}</h2>
        )}
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-4">
          <p className="text-red-400">{error}</p>
          <button
            onClick={fetchTransactions}
            className="mt-2 text-sm text-red-400 hover:text-red-300 underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className={`rounded-xl bg-[#483923] p-6 ${className}`}>
        {showHeader && (
          <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em] mb-4">{title}</h2>
        )}
        <div className="text-center py-8">
          <svg className="mx-auto h-12 w-12 text-[#c9b292] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-lg font-medium text-white mb-1">No transactions yet</p>
          <p className="text-sm text-[#c9b292]">Start investing to see your transaction history here</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl bg-[#483923] p-6 ${className}`}>
      {showHeader && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-[22px] font-bold leading-tight tracking-[-0.015em]">{title}</h2>
          <button
            onClick={fetchTransactions}
            className="text-sm text-primary hover:text-primary/80 transition-colors"
          >
            Refresh
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[#221a10]">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#c9b292] uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#c9b292] uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#c9b292] uppercase tracking-wider">
                Amount (USDC)
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#c9b292] uppercase tracking-wider">
                Amount (Crypto)
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#c9b292] uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-[#c9b292] uppercase tracking-wider">
                Transaction
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#221a10]">
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-[#221a10]/50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap text-sm text-white">
                  {formatDate(tx.timestamp)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeBadgeClassDark(tx.type)}`}>
                    {tx.type}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-white">
                  {formatCurrency(tx.amountUsd)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-white">
                  {formatAmount(tx.amountCrypto)} {tx.type === 'ONRAMP' ? 'USDC' : ''}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClassDark(tx.status || 'COMPLETED')}`}>
                    {tx.status || 'COMPLETED'}
                  </span>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm">
                  {tx.txnHash ? (
                    <a
                      href={getTxExplorerUrl(tx.txnHash, tx.network.toLowerCase())}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 font-mono text-xs transition-colors"
                    >
                      {tx.txnHash.slice(0, 8)}...{tx.txnHash.slice(-8)}
                    </a>
                  ) : (
                    <span className="text-white/50">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export default TransactionHistory;
