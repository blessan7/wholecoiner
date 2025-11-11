'use client';

import { useState } from 'react';
import { getTxExplorerUrl } from '@/lib/solana-explorer';
import { useSolanaWallet, signSolanaTransaction } from '@/lib/solana-wallet';

export default function SwapExecute({ goalId, goalCoin, onSuccess }) {
  const solanaWallet = useSolanaWallet();
  
  const [inputToken, setInputToken] = useState('SOL');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [txStatus, setTxStatus] = useState('idle'); // idle, signing, submitting, success, error
  const [batchId, setBatchId] = useState(null);
  
  // Switched to mainnet - Jupiter swaps enabled
  const isDevnet = false;

  const handleGetQuote = async () => {
    setLoading(true);
    setError('');
    setQuote(null);
    const newBatchId = crypto.randomUUID();
    setBatchId(newBatchId);

    try {
      const response = await fetch('/api/swap/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          goalId,
          inputMint: inputToken,
          outputMint: goalCoin,
          amount: parseFloat(amount),
          batchId: newBatchId,
        }),
      });

      const data = await response.json();

      if (data.success && data.quote) {
        // Store the full response including swapTransaction
        setQuote(data);
      } else {
        setError(data.error?.message || 'Failed to get swap quote');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteSwap = async () => {
    if (!quote || !solanaWallet || !quote.swapTransaction) {
      setError('Please get a quote first and ensure wallet is connected');
      return;
    }

    try {
      setTxStatus('signing');
      setError('');

      // Sign transaction with Privy wallet
      const signedTransaction = await signSolanaTransaction(
        solanaWallet,
        quote.swapTransaction
      );

      setTxStatus('submitting');

      // Submit signed transaction
      const submitResponse = await fetch('/api/swap/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          goalId,
          batchId,
          signedTransaction,
          quoteResponse: quote.quote,
        }),
      });

      const submitData = await submitResponse.json();

      if (submitData.success) {
        setTxStatus('success');
        setQuote(null);
        setAmount('');
        if (onSuccess) onSuccess();
      } else {
        throw new Error(submitData.error?.message || 'Swap failed');
      }

    } catch (err) {
      setTxStatus('error');
      setError(err.message || 'Failed to execute swap');
    } finally {
      setTimeout(() => setTxStatus('idle'), 3000);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-black">Swap to Goal Token</h3>

      {/* Devnet Warning Banner */}
      {isDevnet && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-yellow-800 mb-1">
                Jupiter Swap - Mainnet Only
              </h4>
              <p className="text-sm text-yellow-700 mb-2">
                Jupiter aggregator only works on Solana mainnet. This feature will be enabled when the app moves to production.
              </p>
              <a
                href="https://docs.jup.ag/docs/apis/swap-api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-yellow-700 hover:text-yellow-900 underline"
              >
                Learn More →
              </a>
            </div>
          </div>
        </div>
      )}

      <p className="text-sm text-gray-900">
        Swap SOL or USDC to {goalCoin} using Jupiter aggregator
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="input-token" className="block text-sm font-medium text-black mb-2">
            Swap From
          </label>
          <select
            id="input-token"
            value={inputToken}
            onChange={(e) => setInputToken(e.target.value)}
            disabled={isDevnet}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="SOL">SOL</option>
            <option value="USDC">USDC</option>
          </select>
        </div>

        <div>
          <label htmlFor="swap-amount" className="block text-sm font-medium text-black mb-2">
            Amount
          </label>
          <input
            type="number"
            id="swap-amount"
            min="0"
            step="0.1"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.0"
            disabled={isDevnet}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          />
        </div>

        <button
          onClick={handleGetQuote}
          disabled={loading || !amount}
          className={`w-full px-4 py-2 rounded-lg text-white transition-colors ${
            isDevnet || loading || !amount
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
          title={isDevnet ? 'Jupiter swap is disabled on devnet' : 'Get swap quote'}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Getting quote...
            </span>
          ) : isDevnet ? (
            'Swap (Disabled on Devnet)'
          ) : (
            'Get Swap Quote'
          )}
        </button>
      </div>

      {quote && !isDevnet && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-medium text-blue-900 mb-2">Quote Details</p>
          <div className="space-y-1 text-sm text-blue-800">
            <div className="flex justify-between">
              <span>In:</span>
              <span className="font-mono">{quote.quote.inAmount} {inputToken}</span>
            </div>
            <div className="flex justify-between">
              <span>Out:</span>
              <span className="font-mono">{quote.quote.outAmount} {goalCoin}</span>
            </div>
            <div className="flex justify-between">
              <span>Price per unit:</span>
              <span className="font-mono">{quote.quote.pricePerUnit.toFixed(6)}</span>
            </div>
          </div>
          
          {/* Execute Swap Button */}
          {solanaWallet ? (
            <button
              onClick={handleExecuteSwap}
              disabled={txStatus === 'signing' || txStatus === 'submitting'}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg transition-colors"
            >
              {txStatus === 'signing' && 'Signing Transaction...'}
              {txStatus === 'submitting' && 'Submitting Transaction...'}
              {txStatus === 'idle' && 'Execute Swap'}
              {txStatus === 'success' && '✓ Swap Successful!'}
              {txStatus === 'error' && '✗ Try Again'}
            </button>
          ) : (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-sm text-yellow-800 text-center">
                ⚠️ Please connect your Solana wallet to execute swap
              </p>
            </div>
          )}
        </div>
      )}

      {error && !isDevnet && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-red-600 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}

