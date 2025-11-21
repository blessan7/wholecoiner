'use client';

import { useState, useEffect, useRef } from 'react';
import { useSolanaWallet, signSolanaTransaction } from '@/lib/solana-wallet';
import { useToast } from '@/components/ToastContainer';
import { useWallets } from '@privy-io/react-auth/solana';
import { Connection } from '@solana/web3.js';
import { launchCelebration } from '@/lib/celebration';
import { getInvestmentSuccessMessage, getFloatingBadgeText } from '@/lib/celebrationMessages';
import { TOKEN_MINTS, getTokenMint } from '@/lib/tokens';
import FloatingBadge from '@/components/FloatingBadge';

const MIN_INVEST_SOL = 0.01;

// Jupiter Lite API endpoints
const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_API = 'https://lite-api.jup.ag/swap/v1/swap';

// Default RPC URL
const DEFAULT_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 
  'https://mainnet.helius-rpc.com/?api-key=c61b3693-90f8-46e7-b236-03871dbcdc1e';

const SOL_MINT = TOKEN_MINTS.SOL.mint;

/**
 * Clean user-facing investment flow
 * Steps: amount → preparing → confirm → signing → executing → success
 * Uses friendly language (no technical jargon)
 */
export default function InvestSimpleView({ goal, walletAddress, onSuccess, onStepChange }) {
  const solanaWallet = useSolanaWallet();
  const { wallets, ready } = useWallets();
  const { addToast } = useToast();
  
  const [step, setStep] = useState('amount'); // amount | preparing | confirm | signing | executing | success
  const [amountUsd, setAmountUsd] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState(null);
  const [investmentResult, setInvestmentResult] = useState(null);
  const [showFloatingBadge, setShowFloatingBadge] = useState(false);
  const [floatingBadgeText, setFloatingBadgeText] = useState('');
  const [outputAmount, setOutputAmount] = useState(null);
  const [swapTransaction, setSwapTransaction] = useState(null);
  const [lastValidBlockHeight, setLastValidBlockHeight] = useState(null);
  const [quoteResponse, setQuoteResponse] = useState(null);
  const confirmButtonRef = useRef(null);

  const formatAmount = (value, decimals = 6) => {
    const num = Number(value);
    if (isNaN(num) || value === null || value === undefined) return '0';
    return num.toFixed(decimals);
  };

  const handleContinue = async () => {
    const numericAmount = Number(amountUsd);
    
    if (!numericAmount || Number.isNaN(numericAmount) || numericAmount < MIN_INVEST_SOL) {
      setError(`Amount must be at least ${MIN_INVEST_SOL} SOL`);
      return;
    }

    // Get goal coin mint address
    let outputTokenInfo;
    try {
      outputTokenInfo = getTokenMint(goal.coin, 'mainnet');
    } catch (mintError) {
      setError(`Invalid goal coin: ${mintError.message}`);
      return;
    }

    if (!solanaWallet || !wallets[0]) {
      setError('Please connect your wallet to continue.');
      return;
    }

    if (!ready) {
      setError('Wallets not ready yet. Please wait...');
      return;
    }

    console.log('[InvestSimpleView] Starting swap flow', {
      goalId: goal.id,
      goalCoin: goal.coin,
      amountSol: numericAmount,
      outputMint: outputTokenInfo.mint,
      timestamp: new Date().toISOString()
    });

    setError('');
    setLoading(true);
    setStep('preparing');
    onStepChange?.('preparing');

    try {
      const wallet = wallets[0];
      const amountLamports = Math.floor(numericAmount * 1e9).toString(); // SOL has 9 decimals

      // 1. Get quote from Jupiter Lite API
      const quoteUrl = new URL(JUPITER_QUOTE_API);
      quoteUrl.searchParams.set('inputMint', SOL_MINT);
      quoteUrl.searchParams.set('outputMint', outputTokenInfo.mint);
      quoteUrl.searchParams.set('amount', amountLamports);
      quoteUrl.searchParams.set('slippageBps', '50'); // 0.50% slippage

      const quoteRes = await fetch(quoteUrl.toString());
      if (!quoteRes.ok) {
        const errorText = await quoteRes.text();
        throw new Error(`Quote request failed: ${quoteRes.status} - ${errorText}`);
      }
      
      const quoteResponseData = await quoteRes.json();

      if (quoteResponseData.error || quoteResponseData.errorCode || !quoteResponseData.outAmount) {
        console.error('Quote error:', quoteResponseData);
        throw new Error(
          quoteResponseData.errorMessage || 
          quoteResponseData.error ||
          'Jupiter could not find a route for this swap.'
        );
      }

      // Calculate output amount for display
      const coinAmount = Number(quoteResponseData.outAmount) / Math.pow(10, outputTokenInfo.decimals);
      setOutputAmount(coinAmount);
      setQuoteResponse(quoteResponseData);

      // 2. Build swap transaction from Jupiter Lite API
      const swapRequest = {
        quoteResponse: quoteResponseData,
        userPublicKey: wallet.address,
        wrapAndUnwrapSol: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 10000,
            priorityLevel: 'medium',
          },
        },
      };

      const swapRes = await fetch(JUPITER_SWAP_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(swapRequest),
      });

      if (!swapRes.ok) {
        const errorText = await swapRes.text();
        throw new Error(`Swap request failed: ${swapRes.status} - ${errorText}`);
      }

      const swapJson = await swapRes.json();

      if (!swapJson.swapTransaction) {
        console.error('Swap response:', swapJson);
        throw new Error('No swapTransaction returned from Jupiter.');
      }

      const { swapTransaction: swapTx, lastValidBlockHeight: blockHeight } = swapJson;

      // Store swap data for confirmation step
      setSwapTransaction(swapTx);
      setLastValidBlockHeight(blockHeight);
      setQuote({
        estimatedBtc: coinAmount,
        estimatedFeeUsd: 0.05, // Rough estimate
        quoteResponse: quoteResponseData,
        swapTransaction: swapTx,
        lastValidBlockHeight: blockHeight,
      });

      setStep('confirm');
      onStepChange?.('confirm');
    } catch (err) {
      console.error('[InvestSimpleView] Prepare error', {
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });
      setError(err.message || 'Failed to prepare investment. Please try again.');
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

    if (!swapTransaction) {
      setError('Swap transaction not found. Please try again.');
      return;
    }

    console.log('[InvestSimpleView] Starting confirm flow', {
      goalId: goal.id,
      hasQuote: !!quote,
      hasSwapTransaction: !!swapTransaction,
      lastValidBlockHeight: lastValidBlockHeight,
      timestamp: new Date().toISOString()
    });

    setError('');
    setLoading(true);
    setStep('signing');
    onStepChange?.('signing');

    try {
      // Sign the transaction
      const signStartTime = Date.now();
      console.log('[InvestSimpleView] Signing transaction', {
        swapTransactionLength: swapTransaction?.length,
        timestamp: new Date().toISOString()
      });

      const signedTx = await signSolanaTransaction(solanaWallet, swapTransaction);
      const signDuration = Date.now() - signStartTime;
      
      console.log('[InvestSimpleView] Transaction signed', {
        signedTxLength: signedTx?.length,
        signDuration: `${signDuration}ms`,
        timestamp: new Date().toISOString()
      });
      
      setStep('executing');
      onStepChange?.('executing');

      // Send transaction directly to Solana RPC
      const executeStartTime = Date.now();
      console.log('[InvestSimpleView] Executing investment', {
        goalId: goal.id,
        lastValidBlockHeight: lastValidBlockHeight,
        signedTxLength: signedTx?.length,
        timestamp: new Date().toISOString()
      });

      const connection = new Connection(DEFAULT_RPC_URL, 'confirmed');
      const txBytes = Uint8Array.from(atob(signedTx), (c) => c.charCodeAt(0));
      
      const signature = await connection.sendRawTransaction(txBytes, {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Confirm transaction
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: lastValidBlockHeight || latestBlockhash.lastValidBlockHeight,
        },
        'confirmed'
      );

      const executeDuration = Date.now() - executeStartTime;

      if (confirmation.value.err) {
        console.error('Confirmation error:', confirmation.value.err);
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log('[InvestSimpleView] Execute response received', {
        success: true,
        duration: `${executeDuration}ms`,
        transactionHash: signature,
        timestamp: new Date().toISOString()
      });

      // Success!
      const coin = goal.coin || 'BTC';
      const coinAmount = outputAmount || 0;
      
      setInvestmentResult({
        btcAmount: coinAmount,
        transactionHash: signature,
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
    } catch (err) {
      console.error('[InvestSimpleView] Execute error', {
        error: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString()
      });
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
    setOutputAmount(null);
    setSwapTransaction(null);
    setLastValidBlockHeight(null);
    setQuoteResponse(null);
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
              How much SOL do you want to invest today?
            </label>
            <input
              type="number"
              id="amountUsd"
              min={MIN_INVEST_SOL}
              step="0.001"
              value={amountUsd}
              onChange={(e) => setAmountUsd(e.target.value)}
              placeholder="0.01"
              className="w-full px-4 py-3 border border-[#292018] bg-[#120a05] rounded-lg text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <p className="text-xs text-[var(--text-secondary)] mt-2">
              Minimum: {MIN_INVEST_SOL} SOL
            </p>
          </div>

          {outputAmount && (
            <div className="p-4 bg-[#1b120a] border border-[#292018] rounded-lg">
              <p className="text-sm text-[var(--text-secondary)]">
                You'll receive approximately <span className="font-semibold text-[var(--text-primary)]">{formatAmount(outputAmount, 8)} {goal.coin}</span>
              </p>
            </div>
          )}

          {!outputAmount && (
            <p className="text-xs text-[var(--text-secondary)]">
              We'll fetch a live conversion from Jupiter once you continue.
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
            Getting a live {goal.coin} conversion from Jupiter.
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
            <span className="text-sm font-semibold text-[var(--text-primary)]">{formatAmount(amountUsd, 4)} SOL</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-[var(--text-secondary)]">Estimated return</span>
            <span className="text-sm font-semibold text-[var(--text-primary)]">{formatAmount(outputAmount || 0, 8)} {goal.coin}</span>
          </div>
          {quote?.estimatedFeeUsd && (
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

          {investmentResult?.transactionHash && (
            <div className="mb-4 p-3 rounded-lg bg-green-900/20 border border-green-800/40">
              <p className="text-sm text-green-200 font-semibold mb-1">Transaction:</p>
              <a
                href={`https://explorer.solana.com/tx/${investmentResult.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono break-all text-green-300 hover:underline"
              >
                {investmentResult.transactionHash}
              </a>
              <p className="text-xs text-green-200/70 mt-2">
                Click to view on Solana Explorer
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
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

