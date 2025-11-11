'use client';

import { useState } from 'react';
import { getTxExplorerUrl } from '@/lib/solana-explorer';

export default function OnrampSimulate({ goalId, onSuccess }) {
  const [amountUsdc, setAmountUsdc] = useState(100);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');
  const [txSignature, setTxSignature] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(null);

    try {
      // Generate a unique batch ID for this transaction
      const batchId = crypto.randomUUID();

      const response = await fetch('/api/onramp/simulate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          goalId,
          amountUsdc: parseFloat(amountUsdc),
          batchId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setTxSignature(data.txnHash);
        setSuccess({
          message: 'Onramp simulation successful!',
          amountCrypto: data.amountCrypto,
        });
        // Notify parent component
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setError(data.error?.message || 'Failed to simulate onramp');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(txSignature);
    alert('Transaction signature copied to clipboard!');
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-black">Simulate Onramp</h3>
      <p className="text-sm text-gray-900">
        Convert USDC to SOL (simulated transfer to your wallet on mainnet)
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-black mb-2">
            Amount (USDC)
          </label>
          <input
            type="number"
            id="amount"
            min="10"
            step="10"
            value={amountUsdc}
            onChange={(e) => setAmountUsdc(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            required
            disabled={loading}
          />
          <p className="mt-1 text-xs text-gray-900">Minimum: 10 USDC</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </span>
          ) : (
            'Simulate Onramp'
          )}
        </button>
      </form>

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-green-800 font-medium">{success.message}</p>
              <p className="text-sm text-green-700 mt-1">
                Amount received: {success.amountCrypto} USDC
              </p>
              {txSignature && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={txSignature}
                      readOnly
                      className="flex-1 px-2 py-1 text-xs bg-white border border-green-300 rounded font-mono"
                    />
                    <button
                      onClick={copyToClipboard}
                      className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                    >
                      Copy
                    </button>
                  </div>
                  <a
                    href={getTxExplorerUrl(txSignature, 'mainnet-beta')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-green-700 hover:text-green-900 underline"
                  >
                    View on Solana Explorer →
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}

