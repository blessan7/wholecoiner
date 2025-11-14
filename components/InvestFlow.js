'use client';

import { useState, useEffect, useRef } from 'react';
import { useSolanaWallet, signSolanaTransaction } from '@/lib/solana-wallet';
import InvestmentStatus from './InvestmentStatus';
import CancelInvestmentModal from './CancelInvestmentModal';
import RetryCard from './RetryCard';
import { useToast } from './ToastContainer';
import { launchCelebration } from '@/lib/celebration';
import { getInvestmentSuccessMessage } from '@/lib/celebrationMessages';

/**
 * Complete investment flow component
 * Handles: onramp → quote → sign → execute
 */
export default function InvestFlow({ goalId, goalCoin, onSuccess }) {
  const solanaWallet = useSolanaWallet();
  const { addToast } = useToast();
  const [amountUsdc, setAmountUsdc] = useState(1); // Default to 1 USDC for testing mode
  const [batchId, setBatchId] = useState(null);
  const [currentStep, setCurrentStep] = useState('input'); // input, onramping, quoting, signing, executing, complete
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [quote, setQuote] = useState(null);
  const [swapTransaction, setSwapTransaction] = useState(null);
  const [lastValidBlockHeight, setLastValidBlockHeight] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [goalInfo, setGoalInfo] = useState(null);
  const [progressInfo, setProgressInfo] = useState(null);
  const [debugMode, setDebugMode] = useState(true); // Enable debug mode by default
  const [signedTx, setSignedTx] = useState(null); // Store signed transaction separately
  const [solBalance, setSolBalance] = useState(null);
  const [solBalanceLoading, setSolBalanceLoading] = useState(false);
  const [quoteExpiresIn, setQuoteExpiresIn] = useState(null);
  const MIN_INVEST_USDC = 0.00001;

  // Fetch goal info and progress
  useEffect(() => {
    if (goalId) {
      fetchGoalProgress();
    }
  }, [goalId]);

  // Fetch SOL balance on mount and when step changes
  useEffect(() => {
    if (currentStep === 'input') {
      fetchSolBalance();
    }
  }, [currentStep]);

  // Quote expiry countdown
  useEffect(() => {
    if (!quote || !quote.expiresAt) {
      setQuoteExpiresIn(null);
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const expiresAt = new Date(quote.expiresAt).getTime();
      const remainingMs = expiresAt - now;
      
      if (remainingMs <= 0) {
        setQuoteExpiresIn(0);
        return;
      }
      
      setQuoteExpiresIn(Math.floor(remainingMs / 1000));
    };

    // Update immediately
    updateCountdown();

    // Update every second
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [quote]);

  // Auto re-quote when quote expires or is about to expire
  useEffect(() => {
    if (quoteExpiresIn !== null && quoteExpiresIn <= 10 && quoteExpiresIn > 0 && currentStep === 'signing' && !loading) {
      console.log('[InvestFlow] Quote expiring soon, auto re-quoting...');
      handleQuote();
    }
  }, [quoteExpiresIn, currentStep, loading]);

  const fetchGoalProgress = async () => {
    try {
      const response = await fetch(`/api/progress/${goalId}`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setGoalInfo({
          coin: data.coin,
          targetAmount: data.targetAmount,
          investedAmount: data.investedAmount,
        });
        setProgressInfo({
          progressPercentage: data.progressPercentage,
          investedAmount: data.investedAmount,
        });
      }
    } catch (err) {
      console.error('Failed to fetch goal progress:', err);
    }
  };

  const fetchSolBalance = async () => {
    setSolBalanceLoading(true);
    try {
      const response = await fetch('/api/wallet/sol-balance', {
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setSolBalance(data.balance.sol);
      }
    } catch (err) {
      console.error('Failed to fetch SOL balance:', err);
    } finally {
      setSolBalanceLoading(false);
    }
  };

  const showNotification = (message, type = 'info') => {
    addToast(message, type);
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  // Helper function to safely format price impact (handles string/null/undefined from Jupiter API)
  const formatPriceImpact = (value) => {
    const num = Number(value);
    if (isNaN(num) || value === null || value === undefined) return 'N/A';
    return `${num.toFixed(2)}%`;
  };

  // Helper function to safely format numeric amounts (handles string/null/undefined from Jupiter API)
  const formatAmount = (value, decimals = 6) => {
    const num = Number(value);
    if (isNaN(num) || value === null || value === undefined) return '0';
    return num.toFixed(decimals);
  };

  // Step 1: Onramp
  const handleOnramp = async (skipAutoQuote = false) => {
    const numericAmount = Number(amountUsdc);
    console.log('[TEST] Starting Onramp...', { goalId, amountUsdc: numericAmount, skipAutoQuote });
    
    if (!numericAmount || Number.isNaN(numericAmount) || numericAmount < MIN_INVEST_USDC) {
      const errorMsg = `Amount must be at least ${MIN_INVEST_USDC} USDC`;
      setError(errorMsg);
      console.error('[TEST] Onramp validation failed:', errorMsg);
      return;
    }

    setLoading(true);
    setError('');
    setCurrentStep('onramping');
    const newBatchId = crypto.randomUUID();
    setBatchId(newBatchId);

    try {
      const requestBody = {
        goalId,
        amountUsdc: numericAmount,
        batchId: newBatchId,
      };
      
      console.log('[TEST] Calling /api/onramp/simulate-usdc...', requestBody);

      const response = await fetch('/api/onramp/simulate-usdc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      console.log('[TEST] Onramp Response Status:', response.status);
      console.log('[TEST] Onramp Response OK:', response.ok);
      console.log('[TEST] Onramp Response StatusText:', response.statusText);

      // Safe JSON parsing with error handling
      let data;
      let rawResponseText = '';
      try {
        rawResponseText = await response.text();
        console.log('[TEST] Raw Response Text:', rawResponseText);
        data = JSON.parse(rawResponseText);
        console.log('[TEST] Onramp Response Data:', data);
        console.log('[TEST] Onramp Response Data (stringified):', JSON.stringify(data, null, 2));
      } catch (parseError) {
        console.error('[TEST] Failed to parse response as JSON:', parseError);
        console.error('[TEST] Raw response that failed to parse:', rawResponseText);
        setError(`Invalid response from server (status ${response.status}). Response may not be valid JSON. Check console for details.`);
        setCurrentStep('input');
        setLoading(false);
        return;
      }

      // Check if response indicates success
      if (response.ok && data.success) {
        showNotification('Funds received! Getting swap quote...', 'success');
        setCurrentStep('quoting');
        
        if (!skipAutoQuote) {
          // Automatically proceed to quote (normal flow)
          await handleQuote(newBatchId);
        } else {
          // Stop here for testing
          setLoading(false);
          console.log('[TEST] Onramp complete, stopping (debug mode)');
        }
      } else {
        // Enhanced error extraction from multiple possible locations
        const errorCode = data.error?.code || data.code || 'UNKNOWN_ERROR';
        const errorMessage = data.error?.message || data.message || 
                           (typeof data.error === 'string' ? data.error : null) ||
                           `Server error (status ${response.status})`;
        
        // Comprehensive error logging
        // Safely stringify error objects (they might have circular references)
        let errorObjectStringified = 'N/A';
        let fullResponseStringified = 'N/A';
        
        try {
          errorObjectStringified = JSON.stringify(data.error, null, 2);
        } catch (stringifyError) {
          errorObjectStringified = `[Error stringifying: ${stringifyError.message}] ${String(data.error)}`;
        }
        
        try {
          fullResponseStringified = JSON.stringify(data, null, 2);
        } catch (stringifyError) {
          fullResponseStringified = `[Error stringifying: ${stringifyError.message}]`;
        }
        
        console.error('[TEST] Onramp Error Details:', {
          status: response.status,
          statusText: response.statusText,
          responseOk: response.ok,
          errorCode,
          errorMessage,
          errorObject: data.error,
          fullResponse: data,
          errorObjectStringified,
          fullResponseStringified
        });

        setError(`Onramp step failed (${errorCode}): ${errorMessage}. Check console for details.`);
        setCurrentStep('input');
        setLoading(false);
      }
    } catch (err) {
      console.error('[TEST] Onramp Exception:', err);
      setError(`Onramp step network error: ${err.message}. Check console for details.`);
      setCurrentStep('input');
      setLoading(false);
    }
  };

  // Step 2: Get Quote
  const handleQuote = async (existingBatchId = null) => {
    const activeBatchId = existingBatchId || batchId;
    console.log('[TEST] Starting Quote...', { batchId: activeBatchId, goalId, goalCoin });
    
    if (!activeBatchId) {
      const errorMsg = 'No batchId available. Run onramp first.';
      setError(errorMsg);
      console.error('[TEST] Quote validation failed:', errorMsg);
      return;
    }

    if (!goalId || !goalCoin) {
      const errorMsg = 'Missing goalId or goalCoin. Cannot get quote.';
      setError(errorMsg);
      console.error('[TEST] Quote validation failed:', errorMsg);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const requestBody = {
        goalId,
        batchId: activeBatchId,
        inputMint: 'USDC',
        outputMint: goalCoin,
        mode: 'quote',
      };
      
      console.log('[TEST] Calling /api/swap/execute (quote mode)...', requestBody);

      const response = await fetch('/api/swap/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      console.log('[TEST] Quote Response Status:', response.status);
      console.log('[TEST] Quote Response OK:', response.ok);
      console.log('[TEST] Quote Response StatusText:', response.statusText);

      // Safe JSON parsing with error handling
      let data;
      let rawResponseText = '';
      try {
        rawResponseText = await response.text();
        console.log('[TEST] Raw Response Text:', rawResponseText);
        data = JSON.parse(rawResponseText);
        console.log('[TEST] Quote Response Data:', data);
        console.log('[TEST] Quote Response Data (stringified):', JSON.stringify(data, null, 2));
      } catch (parseError) {
        console.error('[TEST] Failed to parse response as JSON:', parseError);
        console.error('[TEST] Raw response that failed to parse:', rawResponseText);
        setError(`Invalid response from server (status ${response.status}). Response may not be valid JSON. Check console for details.`);
        setLoading(false);
        return;
      }

      // Check if response indicates success
      if (response.ok && data.success) {
        setQuote(data.quote);
        setSwapTransaction(data.swapTransaction); // Store swap transaction for signing
        setLastValidBlockHeight(data.lastValidBlockHeight); // Store for confirmation
        setCurrentStep('signing');
        showNotification('Quote ready! Please sign the transaction.', 'info');
        console.log('[TEST] Quote successful:', {
          outputAmount: data.quote?.outputAmount,
          priceImpact: data.quote?.priceImpactPct,
          hasSwapTransaction: !!data.swapTransaction,
          lastValidBlockHeight: data.lastValidBlockHeight,
        });
      } else {
        // Enhanced error extraction from multiple possible locations
        const errorCode = data.error?.code || data.code || 'UNKNOWN_ERROR';
        const errorMessage = data.error?.message || data.message || 
                           (typeof data.error === 'string' ? data.error : null) ||
                           `Server error (status ${response.status})`;
        
        // Improved error logging with string-based logs to avoid React overlay
        console.warn(`[TEST] Quote failed: status=${response.status} code=${errorCode} message=${errorMessage}`);
        console.log('[TEST] Quote raw response body:', rawResponseText);
        
        // Log full details for debugging (as separate logs to avoid object serialization issues)
        console.log('[TEST] Quote response status:', response.status);
        console.log('[TEST] Quote response statusText:', response.statusText);
        console.log('[TEST] Quote response ok:', response.ok);
        console.log('[TEST] Quote error code:', errorCode);
        console.log('[TEST] Quote error message:', errorMessage);
        console.log('[TEST] Quote full response data:', data);
        
        if (errorCode === 'QUOTE_EXPIRED') {
          setError(`Quote step failed (${errorCode}): Quote expired. Please try again. Check console for details.`);
          setCurrentStep('input');
        } else {
          setError(`Quote step failed (${errorCode}): ${errorMessage}. Check console for details.`);
        }
      }
    } catch (err) {
      console.error('[TEST] Quote Exception:', err);
      setError(`Quote step network error: ${err.message}. Check console for details.`);
    } finally {
      setLoading(false);
    }
  };

  // Step 3a: Sign Transaction Only (testable separately)
  const handleSignOnly = async () => {
    console.log('[TEST] Starting Sign Only...');
    
    if (!solanaWallet) {
      const errorMsg = 'Please connect your Solana wallet first';
      setError(errorMsg);
      console.error('[TEST] Sign validation failed: No wallet connected');
      return;
    }

    if (!swapTransaction) {
      const errorMsg = 'No swap transaction available. Please get a quote first.';
      setError(errorMsg);
      console.error('[TEST] Sign validation failed: No swap transaction available');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('[TEST] Signing transaction with wallet...', {
        walletAddress: solanaWallet.address,
        hasSwapTransaction: !!swapTransaction,
      });

      // Sign transaction with Privy wallet
      const signedTxResult = await signSolanaTransaction(solanaWallet, swapTransaction);
      
      console.log('[TEST] Transaction signed successfully!', {
        signedTxLength: signedTxResult?.length,
      });
      
      setSignedTx(signedTxResult);
      showNotification('Transaction signed! Use "Test Execute" button to submit.', 'success');
      
    } catch (err) {
      console.error('[TEST] Sign Exception:', err);
      setError(`Sign step failed: ${err.message}. Check console for details.`);
    } finally {
      setLoading(false);
    }
  };

  // Step 3b: Execute Signed Transaction (testable separately)
  const handleExecuteOnly = async () => {
    console.log('[TEST] Starting Execute Only...');
    
    const txToExecute = signedTx || swapTransaction;
    
    if (!txToExecute) {
      const errorMsg = 'No signed transaction available. Please sign first or run full flow.';
      setError(errorMsg);
      console.error('[TEST] Execute validation failed: No transaction to execute');
      return;
    }

    if (!batchId || !quote) {
      const errorMsg = 'Missing batchId or quote. Please run quote step first.';
      setError(errorMsg);
      console.error('[TEST] Execute validation failed:', { batchId, hasQuote: !!quote });
      return;
    }

    // Enhanced pre-execution quote expiration check (Option B from help.txt)
    if (quote.expiresAt) {
      const now = Date.now();
      const expiresAt = new Date(quote.expiresAt).getTime();
      const bufferMs = 10000; // 10 second buffer for safety (increased from 5s)
      const remainingMs = expiresAt - now - bufferMs;
      
      if (remainingMs <= 0) {
        const expiredSeconds = Math.abs(Math.round(remainingMs / 1000));
        console.warn('[TEST] Quote expired before execution:', {
          expiresAt: new Date(expiresAt).toISOString(),
          now: new Date(now).toISOString(),
          remainingMs,
          expiredSeconds
        });
        
        // Auto re-quote like sher-web (they call getSwapInfo automatically)
        setLoading(false); // Stop loading for this action
        try {
          setError('Quote expired. Fetching new quote...');
          await handleQuote();
          setError('New quote fetched. Please sign again before executing.');
          setCurrentStep('signing');
          showNotification('Quote expired. New quote fetched - please sign again.', 'info');
          return;
        } catch (quoteError) {
          console.error('[TEST] Auto re-quote failed:', quoteError);
          setError(`Quote expired and failed to fetch new quote: ${quoteError.message}. Please try again.`);
          setCurrentStep('quoting');
          return;
        }
      }
      
      const remainingSeconds = Math.round(remainingMs / 1000);
      console.log(`[TEST] Quote expires in ${remainingSeconds} seconds`);
      
      // Proactive re-quote if less than 10 seconds remaining
      if (remainingMs < 10000) {
        console.warn(`[TEST] Warning: Quote expires soon (${remainingSeconds}s). Proactively re-quoting...`);
        setLoading(false);
        try {
          setError('Quote about to expire. Fetching new quote...');
          await handleQuote();
          setError('New quote fetched. Please sign again before executing.');
          setCurrentStep('signing');
          showNotification('Quote about to expire. New quote fetched - please sign again.', 'info');
          return;
        } catch (quoteError) {
          console.error('[TEST] Proactive re-quote failed:', quoteError);
          // Continue with execution if proactive re-quote fails
          console.warn('[TEST] Continuing with existing quote despite re-quote failure');
        }
        setLoading(true); // Resume loading if we continue
      }
    }

    setLoading(true);
    setError('');
    setCurrentStep('executing');

    try {
      const requestBody = {
        goalId,
        batchId,
        signedTransaction: txToExecute,
        quoteResponse: quote,
        lastValidBlockHeight,
        mode: 'execute',
      };
      
      console.log('[TEST] Calling /api/swap/execute (execute mode)...', {
        goalId,
        batchId,
        hasSignedTx: !!txToExecute,
        hasQuote: !!quote,
        lastValidBlockHeight,
      });

      const response = await fetch('/api/swap/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      });

      console.log('[TEST] Execute Response Status:', response.status);
      console.log('[TEST] Execute Response OK:', response.ok);
      console.log('[TEST] Execute Response StatusText:', response.statusText);

      // Safe JSON parsing with error handling
      let data;
      let rawResponseText = '';
      try {
        rawResponseText = await response.text();
        console.log('[TEST] Raw Response Text:', rawResponseText);
        data = JSON.parse(rawResponseText);
        console.log('[TEST] Execute Response Data:', data);
        console.log('[TEST] Execute Response Data (stringified):', JSON.stringify(data, null, 2));
      } catch (parseError) {
        console.error('[TEST] Failed to parse response as JSON:', parseError);
        console.error('[TEST] Raw response that failed to parse:', rawResponseText);
        setError(`Invalid response from server (status ${response.status}). Response may not be valid JSON. Check console for details.`);
        setCurrentStep('signing');
        setLoading(false);
        return;
      }

      // Check if response indicates success
      if (response.ok && data.success) {
        if (data.pending) {
          showNotification('Transaction submitted! Waiting for confirmation...', 'info');
          setCurrentStep('executing');
        } else {
          // Launch celebration for investment success
          launchCelebration();
          
          // Show enhanced toast with coin-specific message
          const coin = goalCoin || goalInfo?.coin || 'BTC';
          const coinAmount = data.btcAmount || data.amount || 0;
          const successMessage = getInvestmentSuccessMessage(coin, coinAmount);
          addToast(successMessage.title, 'success', 5000);
          
          showNotification('Investment complete!', 'success');
          setCurrentStep('complete');
          if (onSuccess) {
            onSuccess();
          }
          fetchGoalProgress();
        }
      } else {
        // Enhanced error extraction from multiple possible locations
        const errorCode = data.error?.code || data.code || 'UNKNOWN_ERROR';
        const errorMessage = data.error?.message || data.message || 
                           (typeof data.error === 'string' ? data.error : null) ||
                           `Server error (status ${response.status})`;
        
        // Comprehensive error logging
        // Safely stringify error objects (they might have circular references)
        let errorObjectStringified = 'N/A';
        let fullResponseStringified = 'N/A';
        
        try {
          errorObjectStringified = JSON.stringify(data.error, null, 2);
        } catch (stringifyError) {
          errorObjectStringified = `[Error stringifying: ${stringifyError.message}] ${String(data.error)}`;
        }
        
        try {
          fullResponseStringified = JSON.stringify(data, null, 2);
        } catch (stringifyError) {
          fullResponseStringified = `[Error stringifying: ${stringifyError.message}]`;
        }
        
        console.error('[TEST] Execute Error Details:', {
          status: response.status,
          statusText: response.statusText,
          responseOk: response.ok,
          errorCode,
          errorMessage,
          errorObject: data.error,
          errorName: data.error?.name,
          errorStack: data.error?.stack || data.error?.details,
          fullResponse: data,
          errorObjectStringified,
          fullResponseStringified
        });
        
        if (errorCode === 'QUOTE_EXPIRED') {
          // AUTO-RETRY: Handle retryable errors with new quote (like sher-web pattern)
          if (data.retryable && data.newQuote && data.newSwapTransaction) {
            console.log('[TEST] Quote expired but auto-requoted. Re-signing with new quote...');
            setLoading(false); // Stop loading for this action
            
            try {
              // Update state with new quote and transaction
              setQuote(data.newQuote);
              setSwapTransaction(data.newSwapTransaction);
              setLastValidBlockHeight(data.newLastValidBlockHeight);
              if (data.newLastValidBlockHeight) {
                // Store lastValidBlockHeight if needed
                console.log('[TEST] New lastValidBlockHeight:', data.newLastValidBlockHeight);
              }
              
              // Auto-sign new transaction (seamless retry like sher-web)
              if (solanaWallet) {
                setError('New quote fetched. Signing automatically...');
                showNotification('Quote expired. New quote fetched - signing automatically...', 'info');
                
                const newSignedTx = await signSolanaTransaction(solanaWallet, data.newSwapTransaction);
                setSignedTx(newSignedTx);
                
                // Automatically retry execution with new signed transaction
                setError('Transaction re-signed. Retrying execution...');
                showNotification('Transaction re-signed. Retrying execution...', 'info');
                
                // Small delay to update UI
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Retry execution by calling handleExecuteOnly recursively
                // Update state first, then retry
                setLoading(true);
                setError('');
                setCurrentStep('executing');
                
                // Create new request body with updated quote and signed transaction
                const retryRequestBody = {
                  goalId,
                  batchId,
                  signedTransaction: newSignedTx,
                  quoteResponse: data.newQuote,
                  lastValidBlockHeight: data.newLastValidBlockHeight,
                  mode: 'execute',
                };
                
                console.log('[TEST] Retrying execution with new quote and signed transaction...', {
                  goalId,
                  batchId,
                  hasSignedTx: !!newSignedTx,
                  hasQuote: !!data.newQuote,
                  lastValidBlockHeight: data.newLastValidBlockHeight,
                });

                const retryResponse = await fetch('/api/swap/execute', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify(retryRequestBody),
                });

                const retryData = await retryResponse.json();

                if (retryResponse.ok && retryData.success) {
                  if (retryData.pending) {
                    showNotification('Transaction submitted! Waiting for confirmation...', 'info');
                    setCurrentStep('executing');
                  } else {
                    // Launch celebration for investment success
                    launchCelebration();
                    
                    // Show enhanced toast with coin-specific message
                    const coin = goalCoin || goalInfo?.coin || 'BTC';
                    const coinAmount = retryData.btcAmount || retryData.amount || 0;
                    const successMessage = getInvestmentSuccessMessage(coin, coinAmount);
                    addToast(successMessage.title, 'success', 5000);
                    
                    showNotification('Investment complete!', 'success');
                    setCurrentStep('complete');
                    if (onSuccess) {
                      onSuccess();
                    }
                    fetchGoalProgress();
                  }
                  return;
                } else {
                  // If retry also fails, show error
                  const retryErrorCode = retryData.error?.code || 'UNKNOWN_ERROR';
                  const retryErrorMessage = retryData.error?.message || `Server error (status ${retryResponse.status})`;
                  setError(`Retry failed (${retryErrorCode}): ${retryErrorMessage}. Please try again.`);
                  setCurrentStep('signing');
                  return;
                }
              } else {
                // If wallet not available, prompt user to sign
                setError('New quote fetched. Please sign again before executing.');
                setCurrentStep('signing');
                showNotification('Quote expired. New quote fetched - please sign again.', 'info');
                return;
              }
            } catch (retryError) {
              console.error('[TEST] Auto retry failed:', retryError);
              setError(`Quote expired. Failed to auto-retry: ${retryError.message}. Please try again manually.`);
              setCurrentStep('signing');
              return;
            }
          } else {
            // Fallback: Manual re-quote if auto-requote not available
            console.log('[TEST] Quote expired during execution. Fetching new quote...');
            setLoading(false);
            try {
              setError('Transaction expired. Fetching new quote...');
              await handleQuote();
              setError('New quote fetched. Please sign again before executing.');
              setCurrentStep('signing');
              showNotification('Transaction expired. New quote fetched - please sign again.', 'info');
            } catch (quoteError) {
              console.error('[TEST] Auto re-quote failed:', quoteError);
              setError(`Execute step failed (${errorCode}): Quote expired. Failed to fetch new quote: ${quoteError.message}. Please try again manually.`);
              setCurrentStep('quoting');
            }
            return;
          }
        } else {
          setError(`Execute step failed (${errorCode}): ${errorMessage}. Check console for details.`);
          setCurrentStep('signing');
        }
      }
    } catch (err) {
      // Handle blockheight exceeded errors (like sher-web pattern)
      const errorStr = JSON.stringify(err).toLowerCase();
      const errorMsg = err?.message?.toLowerCase() || '';
      const isBlockheightError =
        err?.message?.includes('TransactionExpiredBlockheightExceededError') ||
        err?.message?.includes('block height exceeded') ||
        err?.message?.includes('blockheight') ||
        err?.message?.includes('expired') ||
        err?.name === 'TransactionExpiredBlockheightExceededError' ||
        errorStr.includes('transactionexpiredblockheightexceedederror') ||
        errorStr.includes('block height exceeded') ||
        errorStr.includes('blockheight') ||
        errorStr.includes('expired');

      if (isBlockheightError) {
        console.log('[TEST] Transaction confirmation failed due to blockheight exceeded. Fetching new quote...');
        setLoading(false);
        try {
          setError('Transaction expired. Fetching new quote...');
          await handleQuote();
          setError('New quote fetched. Please sign again before executing.');
          setCurrentStep('signing');
          showNotification('Transaction expired. New quote fetched - please sign again.', 'info');
          return;
        } catch (quoteError) {
          console.error('[TEST] Error fetching new quote after blockheight error:', quoteError);
          setError('Transaction expired. Please refresh and try again.');
          setCurrentStep('quoting');
          return;
        }
      }

      // Handle Error instances properly (they stringify to {})
      let errorMessage = 'Unknown error';
      let errorName = 'Error';
      let errorStack = null;
      
      if (err instanceof Error) {
        errorMessage = err.message || 'Unknown error';
        errorName = err.name || 'Error';
        errorStack = err.stack;
      } else if (typeof err === 'string') {
        errorMessage = err;
      } else if (err && typeof err === 'object') {
        errorMessage = err.message || JSON.stringify(err);
        errorName = err.name || 'Error';
      }
      
      console.error('[TEST] Execute Exception:', err);
      console.error('[TEST] Execute Error Details (expanded):', {
        message: errorMessage,
        name: errorName,
        stack: errorStack,
        originalError: err,
      });
      
      setError(`Execute step failed: ${errorMessage}. Check console for details.`);
      setCurrentStep('signing');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Sign and Execute (full flow)
  const handleSignAndExecute = async () => {
      console.log('[TEST] Starting Sign & Execute (Full Flow)...');
    if (!solanaWallet) {
      setError('Please connect your Solana wallet first');
      return;
    }

    if (!swapTransaction) {
      setError('No swap transaction available. Please get a quote first.');
      return;
    }

    setLoading(true);
    setError('');
    setCurrentStep('executing');

    try {
      // Sign transaction with Privy wallet
      console.log('[TEST] Signing transaction (full flow)...');
      const signedTx = await signSolanaTransaction(solanaWallet, swapTransaction);
      console.log('[TEST] Transaction signed, now executing...');

      // Submit signed transaction
      const response = await fetch('/api/swap/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          goalId,
          batchId,
          signedTransaction: signedTx,
          quoteResponse: quote,
          lastValidBlockHeight,
          mode: 'execute',
        }),
      });

      console.log('[TEST] Full Flow Execute Response Status:', response.status);
      console.log('[TEST] Full Flow Execute Response OK:', response.ok);
      console.log('[TEST] Full Flow Execute Response StatusText:', response.statusText);

      // Safe JSON parsing with error handling
      let data;
      let rawResponseText = '';
      try {
        rawResponseText = await response.text();
        console.log('[TEST] Raw Response Text:', rawResponseText);
        data = JSON.parse(rawResponseText);
        console.log('[TEST] Full Flow Execute Response:', data);
        console.log('[TEST] Full Flow Execute Response (stringified):', JSON.stringify(data, null, 2));
      } catch (parseError) {
        console.error('[TEST] Failed to parse response as JSON:', parseError);
        console.error('[TEST] Raw response that failed to parse:', rawResponseText);
        setError(`Invalid response from server (status ${response.status}). Response may not be valid JSON. Check console for details.`);
        setCurrentStep('signing');
        setLoading(false);
        return;
      }

      // Check if response indicates success
      if (response.ok && data.success) {
        if (data.pending) {
          // Transaction submitted but pending confirmation
          showNotification('Transaction submitted! Waiting for confirmation...', 'info');
          setCurrentStep('executing');
          // Status component will handle polling
        } else {
          // Confirmed immediately
          // Launch celebration for investment success
          launchCelebration();
          
          // Show enhanced toast with coin-specific message
          const coin = goalCoin || goalInfo?.coin || 'BTC';
          const coinAmount = data.btcAmount || data.amount || 0;
          const successMessage = getInvestmentSuccessMessage(coin, coinAmount);
          addToast(successMessage.title, 'success', 5000);
          
          showNotification('Investment complete!', 'success');
          setCurrentStep('complete');
          if (onSuccess) {
            onSuccess();
          }
          // Refresh progress
          fetchGoalProgress();
        }
      } else {
        // Enhanced error extraction from multiple possible locations
        const errorCode = data.error?.code || data.code || 'UNKNOWN_ERROR';
        const errorMessage = data.error?.message || data.message || 
                           (typeof data.error === 'string' ? data.error : null) ||
                           `Server error (status ${response.status})`;
        
        // Comprehensive error logging
        // Safely stringify error objects (they might have circular references)
        let errorObjectStringified = 'N/A';
        let fullResponseStringified = 'N/A';
        
        try {
          errorObjectStringified = JSON.stringify(data.error, null, 2);
        } catch (stringifyError) {
          errorObjectStringified = `[Error stringifying: ${stringifyError.message}] ${String(data.error)}`;
        }
        
        try {
          fullResponseStringified = JSON.stringify(data, null, 2);
        } catch (stringifyError) {
          fullResponseStringified = `[Error stringifying: ${stringifyError.message}]`;
        }
        
        console.error('[TEST] Full Flow Execute Error Details:', {
          status: response.status,
          statusText: response.statusText,
          responseOk: response.ok,
          errorCode,
          errorMessage,
          errorObject: data.error,
          fullResponse: data,
          errorObjectStringified,
          fullResponseStringified
        });
        
        if (errorCode === 'QUOTE_EXPIRED') {
          setError(`Quote expired (${errorCode}). Click "Re-quote" to get a new quote. Check console for details.`);
          setCurrentStep('signing');
        } else {
          setError(`Swap execution failed (${errorCode}): ${errorMessage}. Check console for details.`);
          setCurrentStep('signing');
        }
      }
    } catch (err) {
      console.error('[TEST] Full Flow Exception:', err);
      setError(`Failed to sign or execute transaction: ${err.message}. Check console for details.`);
      setCurrentStep('signing');
    } finally {
      setLoading(false);
    }
  };

  // Reset flow to initial state
  const resetFlow = () => {
    console.log('[TEST] Resetting flow...');
    setCurrentStep('input');
    setBatchId(null);
    setQuote(null);
    setSwapTransaction(null);
    setSignedTx(null);
    setError('');
    setLoading(false);
  };

  const handleCancel = async () => {
    if (!batchId) return;

    try {
      const response = await fetch(`/api/investments/${batchId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      });

      const data = await response.json();

      if (data.success) {
        showNotification('Investment canceled', 'info');
        setCurrentStep('input');
        setBatchId(null);
        setQuote(null);
        setSwapTransaction(null);
        setSignedTx(null);
      } else {
        setError(data.error?.message || 'Failed to cancel');
      }
    } catch (err) {
      setError('Failed to cancel investment');
    }
  };

  const handleConfirmCancel = async () => {
    await handleCancel();
    setShowCancelModal(false);
  };

  // Render based on current step
  if (currentStep === 'input') {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-black">Invest Now</h3>
        <p className="text-sm text-black">
          Enter the amount in USDC to invest in {goalCoin}
        </p>

        {/* SOL Balance Warning */}
        {solBalance !== null && (
          <div className={`p-3 border rounded-md ${
            solBalance < 0.02 ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'
          }`}>
            <p className="text-sm font-medium text-black">
              SOL Balance: {solBalance.toFixed(4)} SOL
            </p>
            {solBalance < 0.02 && (
              <p className="text-xs text-yellow-700 mt-1">
                ⚠️ Low SOL balance. You need SOL to pay for swap transactions. Please add more SOL to your wallet.
              </p>
            )}
          </div>
        )}

        {/* Debug Mode Toggle */}
        <div className="flex items-center gap-2 mb-4 p-3 bg-gray-50 border border-gray-200 rounded-md">
          <input
            type="checkbox"
            id="debugMode"
            checked={debugMode}
            onChange={(e) => setDebugMode(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="debugMode" className="text-sm text-black cursor-pointer">
            Enable Debug Mode (Separate Test Buttons)
          </label>
        </div>
        {debugMode && (
          <p className="text-xs text-gray-600 mb-2">
            Debug mode allows you to test each step independently. Check browser console for detailed logs.
          </p>
        )}

        <form onSubmit={(e) => { 
          e.preventDefault(); 
          handleOnramp(debugMode); 
        }} className="space-y-4">
          <div>
            <label htmlFor="amountUsdc" className="block text-sm font-medium text-black mb-2">
              Amount (USDC)
            </label>
            <input
              type="number"
              id="amountUsdc"
              min={MIN_INVEST_USDC}
              step={MIN_INVEST_USDC}
              value={amountUsdc}
              onChange={(e) => setAmountUsdc(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
            <p className="text-xs text-black mt-1">Minimum: {MIN_INVEST_USDC} USDC</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <p className="text-sm text-red-700 font-semibold">Error:</p>
              <p className="text-sm text-red-700">{error}</p>
              <p className="text-xs text-red-600 mt-2">Check browser console for detailed logs</p>
            </div>
          )}

          {debugMode ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleOnramp(true)}
                disabled={loading}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Test Onramp Only'}
              </button>
              <p className="text-xs text-gray-600 text-center">
                Tests onramp step and stops (no auto-quote)
              </p>
            </div>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Invest Now'}
            </button>
          )}
        </form>
      </div>
    );
  }

  // Show status component for ongoing investments
  if (batchId && currentStep !== 'input' && currentStep !== 'complete') {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-black">Investment in Progress</h3>

        {/* Debug Info Panel */}
        {debugMode && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
            <p className="font-semibold text-sm mb-2 text-black">Debug Info:</p>
            <div className="text-xs space-y-1 text-black">
              <p>Current Step: <strong>{currentStep}</strong></p>
              <p>Batch ID: <strong>{batchId.substring(0, 8)}...</strong></p>
              <p>Has Quote: <strong>{quote ? 'Yes' : 'No'}</strong></p>
              <p>Has Swap Transaction: <strong>{swapTransaction ? 'Yes' : 'No'}</strong></p>
              <p>Has Signed TX: <strong>{signedTx ? 'Yes' : 'No'}</strong></p>
              <p>Wallet Connected: <strong>{solanaWallet ? 'Yes' : 'No'}</strong></p>
            </div>
          </div>
        )}

        <InvestmentStatus
          batchId={batchId}
          onCancel={() => setShowCancelModal(true)}
          onReQuote={() => handleQuote()}
        />

        {/* Test Buttons in Debug Mode */}
        {debugMode && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
            <h4 className="font-semibold text-black mb-2">Debug Test Buttons:</h4>
            
            {(currentStep === 'quoting' || (currentStep !== 'signing' && !quote)) && (
              <button
                onClick={() => handleQuote()}
                disabled={loading || !batchId}
                className="w-full bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
              >
                {loading ? 'Processing...' : 'Test Quote Only'}
              </button>
            )}

            {quote && currentStep === 'signing' && (
              <>
                <button
                  onClick={handleSignOnly}
                  disabled={loading || !solanaWallet || !swapTransaction}
                  className="w-full bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                >
                  {loading ? 'Processing...' : 'Test Sign Only'}
                </button>
                {!solanaWallet && (
                  <p className="text-xs text-gray-600 text-center">
                    Connect wallet to enable Sign button
                  </p>
                )}
                
                {signedTx && (
                  <button
                    onClick={handleExecuteOnly}
                    disabled={loading}
                    className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm"
                  >
                    {loading ? 'Processing...' : 'Test Execute Only'}
                  </button>
                )}
              </>
            )}
            
            <button
              onClick={resetFlow}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 text-sm"
            >
              Reset Flow
            </button>
          </div>
        )}

        {/* Quote Display */}
        {quote && currentStep === 'signing' && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold text-black">Swap Quote</h4>
              {quoteExpiresIn !== null && (
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  quoteExpiresIn <= 10 ? 'bg-red-100 text-red-700' : 
                  quoteExpiresIn <= 30 ? 'bg-yellow-100 text-yellow-700' : 
                  'bg-green-100 text-green-700'
                }`}>
                  {quoteExpiresIn > 0 ? `Expires in ${quoteExpiresIn}s` : 'Expired - Re-quoting...'}
                </span>
              )}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-black">Input:</span>
                <span className="font-medium text-black">{amountUsdc} USDC</span>
              </div>
              <div className="flex justify-between">
                <span className="text-black">Output:</span>
                <span className="font-medium text-black">{formatAmount(quote.outputAmount, 6)} {goalCoin}</span>
              </div>
              {quote.priceImpactPct !== undefined && quote.priceImpactPct !== null && (
                <div className="flex justify-between">
                  <span className="text-black">Price Impact:</span>
                  <span className={Number(quote.priceImpactPct) > 1 ? 'text-yellow-600' : 'text-green-600'}>
                    {formatPriceImpact(quote.priceImpactPct)}
                  </span>
                </div>
              )}
              {!debugMode && (
                <button
                  onClick={handleSignAndExecute}
                  disabled={loading || !solanaWallet}
                  className="w-full mt-4 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {loading ? 'Processing...' : 'Sign & Execute'}
                </button>
              )}
              {!solanaWallet && (
                <p className="text-xs text-black mt-2 text-center">
                  Please connect your Solana wallet to execute the swap
                </p>
              )}
            </div>
          </div>
        )}

        {error && (
          <RetryCard
            error={error}
            onRetry={() => {
              setError('');
              if (currentStep === 'signing' || currentStep === 'quoting') {
                handleQuote();
              } else if (currentStep === 'input' || currentStep === 'onramping') {
                handleOnramp(debugMode);
              }
            }}
            onCancel={() => {
              setError('');
              setCurrentStep('input');
            }}
          />
        )}

        <CancelInvestmentModal
          isOpen={showCancelModal}
          onClose={() => setShowCancelModal(false)}
          onConfirm={handleConfirmCancel}
          batchId={batchId}
          goalInfo={goalInfo}
          progressInfo={progressInfo}
        />
      </div>
    );
  }

  // Complete state
  if (currentStep === 'complete') {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-green-800 mb-2">✓ Investment Complete!</h3>
          <p className="text-sm text-green-700">
            Your investment has been successfully processed.
          </p>
        </div>
        <button
          onClick={resetFlow}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          Make Another Investment
        </button>
      </div>
    );
  }

  return null;
}

