'use client';

import { useState, useEffect, useRef } from 'react';
import { useSolanaWallet, signSolanaTransaction } from '@/lib/solana-wallet';
import { useToast } from '@/components/ToastContainer';
import { useRouter } from 'next/navigation';
import { launchCelebration } from '@/lib/celebration';
import { getInvestmentSuccessMessage, getFloatingBadgeText } from '@/lib/celebrationMessages';
import FloatingBadge from '@/components/FloatingBadge';

const MIN_INVEST_USDC = 0.00001;

/**
 * Clean user-facing investment flow
 * Steps: amount → preparing → confirm → signing → executing → success
 * Uses friendly language (no technical jargon)
 */
export default function InvestSimpleView({ goal, walletAddress, onSuccess, onStepChange }) {
  const router = useRouter();
  const solanaWallet = useSolanaWallet();
  const { addToast } = useToast();
  
  const [step, setStep] = useState('amount'); // amount | preparing | confirm | signing | executing | success
  const [amountUsd, setAmountUsd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState(null);
  const [batchId, setBatchId] = useState(null);
  const [investmentResult, setInvestmentResult] = useState(null);
  const [showFloatingBadge, setShowFloatingBadge] = useState(false);
  const [floatingBadgeText, setFloatingBadgeText] = useState('');
  const confirmButtonRef = useRef(null);

  const formatAmount = (value, decimals = 6) => {
    const num = Number(value);
    if (isNaN(num) || value === null || value === undefined) return '0';
    return num.toFixed(decimals);
  };

  const handleContinue = async () => {
    const numericAmount = Number(amountUsd);
    
    if (!numericAmount || Number.isNaN(numericAmount) || numericAmount < MIN_INVEST_USDC) {
      setError(`Amount must be at least ${MIN_INVEST_USDC} USDC`);
      return;
    }

    setError('');
    setLoading(true);
    setStep('preparing');
    onStepChange?.('preparing');

    try {
      const response = await fetch('/api/invest/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          goalId: goal.id,
          amountUsd: numericAmount,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setQuote(data.quote);
        setBatchId(data.batchId);
        setStep('confirm');
        onStepChange?.('confirm');
      } else {
        setError(data.error?.message || 'Failed to prepare investment. Please try again.');
        setStep('amount');
        onStepChange?.('amount');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      setStep('amount');
      onStepChange?.('amount');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!solanaWallet) {
      setError('Please connect your wallet to continue.');
      return;
    }

    setError('');
    setLoading(true);
    setStep('signing');
    onStepChange?.('signing');

    try {
      // Sign the transaction
      const signedTx = await signSolanaTransaction(solanaWallet, quote.swapTransaction);
      
      setStep('executing');
      onStepChange?.('executing');

      // Execute the investment
      const response = await fetch('/api/invest/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          goalId: goal.id,
          batchId: batchId,
          signedTransaction: signedTx,
          quoteResponse: quote.quoteResponse,
          lastValidBlockHeight: quote.lastValidBlockHeight,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        const coinAmount = data.btcAmount || data.amount || 0;
        const coin = goal.coin || 'BTC';
        
        setInvestmentResult({
          btcAmount: coinAmount,
          transactionHash: data.transactionHash,
        });
        
        // Launch celebration
        if (confirmButtonRef.current) {
          launchCelebration({ element: confirmButtonRef.current });
        } else {
          launchCelebration();
        }
        
        // Show floating badge
        const badgeText = getFloatingBadgeText(coin, coinAmount);
        setFloatingBadgeText(badgeText);
        setShowFloatingBadge(true);
        
        // Show enhanced toast with coin-specific message
        const successMessage = getInvestmentSuccessMessage(coin, coinAmount);
        addToast(successMessage.title, 'success', 5000);
        
        setStep('success');
        onStepChange?.('success');
        onSuccess?.();
      } else {
        setError(data.error?.message || 'Investment execution failed. Please try again.');
        setStep('confirm');
        onStepChange?.('confirm');
      }
    } catch (err) {
      setError(err.message || 'Failed to complete investment. Please try again.');
      setStep('confirm');
      onStepChange?.('confirm');
    } finally {
      setLoading(false);
    }
  };

  const handleInvestAgain = () => {
    setStep('amount');
    onStepChange?.('amount');
    setQuote(null);
    setInvestmentResult(null);
    setError('');
    // Keep amountUsd prefilled
  };

  // Amount step
  if (step === 'amount') {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <label htmlFor="amountUsd" className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              How much do you want to invest today?
            </label>
            <input
              type="number"
              id="amountUsd"
              min={MIN_INVEST_USDC}
              step="0.01"
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              placeholder="10"
              className="w-full px-4 py-3 border border-[#292018] bg-[#120a05] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <p className="text-xs text-[var(--text-secondary)] mt-2">
              Minimum: {MIN_INVEST_USDC} USDC
            </p>
          </div>

          {quote && (
            <div className="p-4 bg-[#1b120a] border border-[#292018] rounded-lg">
              <p className="text-sm text-[var(--text-secondary)]">
                You'll receive approximately <span className="font-semibold text-[var(--text-primary)]">{formatAmount(quote.estimatedBtc, 8)} {goal.coin}</span>
              </p>
            </div>
          )}

          {!quote && (
            <p className="text-xs text-[var(--text-secondary)]">
              We'll fetch a live conversion once you continue.
            </p>
          )}

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-800/40 rounded-lg">
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          <button
            onClick={handleContinue}
            disabled={loading || !amountUsd}
            className="w-full bg-[var(--accent)] text-[#0d0804] px-6 py-3 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Preparing step
  if (step === 'preparing') {
    return (
      <div className="space-y-6 text-center py-8">
        <div className="flex justify-center">
          <div className="h-12 w-12 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Preparing your investment…
          </h3>
          <p className="text-sm text-[var(--text-secondary)]">
            Checking your wallet and getting a live {goal.coin} conversion.
          </p>
        </div>
      </div>
    );
  }

  // Confirm step
  if (step === 'confirm') {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
          Confirm your investment
        </h3>

        <div className="space-y-4 p-4 bg-[#1b120a] border border-[#292018] rounded-lg">
          <div className="flex justify-between">
            <span className="text-sm text-[var(--text-secondary)]">You're investing</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">${formatAmount(amountUsd, 2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-[var(--text-secondary)]">Estimated return</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">{formatAmount(quote.estimatedBtc, 8)} {goal.coin}</span>
          </div>
          {quote.estimatedFeeUsd && (
            <div className="flex justify-between">
              <span className="text-sm text-[var(--text-secondary)]">Network fee</span>
              <span className="text-sm text-[var(--text-primary)]">~ ${formatAmount(quote.estimatedFeeUsd, 2)}</span>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-900/20 border border-red-800/40 rounded-lg">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => {
              setStep('amount');
              onStepChange?.('amount');
              setError('');
            }}
            className="flex-1 px-6 py-3 border border-[#292018] bg-[#120a05] text-[var(--text-primary)] rounded-lg font-semibold hover:bg-[#1b120a] transition-colors"
          >
            Back
          </button>
          <button
            ref={confirmButtonRef}
            onClick={handleConfirm}
            disabled={loading || !solanaWallet}
            className="flex-1 bg-[var(--accent)] text-[#0d0804] px-6 py-3 rounded-lg font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            Confirm & Invest
          </button>
        </div>

        {!solanaWallet && (
          <p className="text-xs text-center text-[var(--text-secondary)]">
            Please connect your wallet to continue.
          </p>
        )}
      </div>
    );
  }

  // Signing step
  if (step === 'signing') {
    return (
      <div className="space-y-6 text-center py-8">
        <div className="flex justify-center">
          <div className="h-12 w-12 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Waiting for approval…
          </h3>
          <p className="text-sm text-[var(--text-secondary)]">
            A secure wallet popup may appear. Please confirm to complete your investment.
          </p>
        </div>
      </div>
    );
  }

  // Executing step
  if (step === 'executing') {
    return (
      <div className="space-y-6 text-center py-8">
        <div className="flex justify-center">
          <div className="h-12 w-12 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
            Executing your investment…
          </h3>
          <p className="text-sm text-[var(--text-secondary)]">
            This usually takes a few seconds.
          </p>
        </div>
      </div>
    );
  }

  // Success step
  if (step === 'success') {
    const coin = goal.coin || 'BTC';
    const coinAmount = investmentResult?.btcAmount || 0;
    const decimals = coin === 'BTC' ? 8 : coin === 'ETH' ? 6 : 4;
    
    return (
      <>
        <FloatingBadge 
          text={floatingBadgeText}
          show={showFloatingBadge}
          onComplete={() => setShowFloatingBadge(false)}
        />
        <div className="space-y-6 text-center py-8">
          <div className="text-4xl mb-4">🎉</div>
          <h3 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">
            Investment complete!
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            You now own <span className="font-semibold text-[var(--text-primary)]">{formatAmount(coinAmount, decimals)} {coin}</span> toward your {coin} goal.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => router.push(`/goals/${goal.id}`)}
              className="flex-1 px-6 py-3 border border-[#292018] bg-[#120a05] text-[var(--text-primary)] rounded-lg font-semibold hover:bg-[#1b120a] transition-colors"
            >
              View Goal Summary
            </button>
            <button
              onClick={handleInvestAgain}
              className="flex-1 bg-[var(--accent)] text-[#0d0804] px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity animate-glow"
            >
              Invest Again
            </button>
          </div>
        </div>
      </>
    );
  }

  return null;
}

