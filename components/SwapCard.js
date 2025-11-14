/**
 * SwapCard Component
 * 
 * Simplified swap interface ported from Sher's CryptoTradeCardSwap
 * Adapted to work with Wholecoiner's backend APIs
 */

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { VersionedTransaction } from '@solana/web3.js';
import { useSolanaWallet, signSolanaTransaction } from '@/lib/solana-wallet';

// ========================
// CONSTANTS
// ========================
const SLIPPAGE_OPTIONS = [
  { id: 'slip1', value: '0.5%', bps: 50 },
  { id: 'slip2', value: '1%', bps: 100 },
  { id: 'slip3', value: '1.5%', bps: 150 },
  { id: 'slip4', value: '2%', bps: 200 },
];

const QUOTE_REFRESH_INTERVAL = 30000; // 30 seconds
const QUOTE_EXPIRY_BUFFER = 5000; // 5 seconds before expiry

// ========================
// CUSTOM HOOKS
// ========================

/**
 * Hook to fetch user's wallet tokens
 */
const useWalletTokens = (shouldFetch = true) => {
  const [tokens, setTokens] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchTokens = useCallback(async () => {
    if (!shouldFetch) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/wallet/tokens');
      
      if (!response.ok) {
        throw new Error('Failed to fetch wallet tokens');
      }

      const data = await response.json();
      setTokens(data.tokens || []);
    } catch (err) {
      console.error('Error fetching wallet tokens:', err);
      setError(err.message);
      setTokens([]);
    } finally {
      setIsLoading(false);
    }
  }, [shouldFetch]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  return {
    tokens,
    isLoading,
    error,
    refetch: fetchTokens,
  };
};

// ========================
// MAIN COMPONENT
// ========================

export default function SwapCard({
  goalId,
  batchId,
  goalCoin,
  inputMint = 'SOL',
  initialAmount = '',
  onSwapComplete,
  className = '',
}) {
  console.log('[SwapCard] Component initialized with props:', {
    goalId,
    batchId,
    goalCoin,
    inputMint,
    initialAmount
  });
  
  const wallet = useSolanaWallet();
  const publicKey = wallet?.address || null;

  // State
  const [fromToken, setFromToken] = useState(null);
  const [toToken, setToToken] = useState(null);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [selectedSlippage, setSelectedSlippage] = useState(SLIPPAGE_OPTIONS[0]);
  const [quote, setQuote] = useState(null);
  const [swapTransaction, setSwapTransaction] = useState(null);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState(null);
  const [priceInfo, setPriceInfo] = useState(null);
  const [quoteExpiresAt, setQuoteExpiresAt] = useState(null);

  // Refs
  const quoteRefreshTimer = useRef(null);
  const quoteExpiryTimer = useRef(null);

  // Custom hooks
  const { tokens: walletTokens, refetch: refetchWalletTokens } = useWalletTokens(!!publicKey);

  // Fetch token metadata
  const fetchTokenMetadata = useCallback(async (symbol) => {
    try {
      console.log('[SwapCard] fetchTokenMetadata called with symbol:', symbol);
      const response = await fetch(`/api/tokens/search?q=${encodeURIComponent(symbol)}&limit=10`);
      const data = await response.json();
      
      console.log('[SwapCard] Token search response:', {
        query: symbol,
        tokensFound: data.tokens?.length || 0,
        tokens: data.tokens?.map(t => ({ symbol: t.symbol, name: t.name }))
      });
      
      if (!data.tokens || data.tokens.length === 0) {
        console.warn('[SwapCard] No tokens found for symbol:', symbol);
        return null;
      }
      
      // First, try to find exact symbol match (case-insensitive)
      const exactMatch = data.tokens.find(token => 
        token.symbol?.toUpperCase() === symbol.toUpperCase()
      );
      
      if (exactMatch) {
        console.log('[SwapCard] Found exact symbol match:', exactMatch.symbol);
        return exactMatch;
      }
      
      // Fallback to first result if no exact match
      console.log('[SwapCard] No exact match, using first result:', data.tokens[0].symbol);
      return data.tokens[0];
    } catch (error) {
      console.error('[SwapCard] Error fetching token metadata:', error);
      return null;
    }
  }, []);

  // Initialize tokens based on props
  useEffect(() => {
    if (!fromToken && inputMint && walletTokens.length > 0) {
      const token = walletTokens.find(t => t.symbol === inputMint);
      if (token) {
        console.log('[SwapCard] Setting fromToken (SOL):', token);
        setFromToken(token);
      }
    }

    // Fix: Check if toToken needs to be updated (either null or wrong symbol)
    if (goalCoin) {
      const needsUpdate = !toToken || toToken.symbol?.toUpperCase() !== goalCoin.toUpperCase();
      
      if (needsUpdate) {
        console.log('[SwapCard] Fetching token metadata for goalCoin:', goalCoin, {
          currentToToken: toToken?.symbol,
          needsUpdate
        });
        fetchTokenMetadata(goalCoin).then(token => {
          console.log('[SwapCard] Token metadata received for', goalCoin, ':', token);
          if (token) {
            setToToken(token);
          } else {
            console.error('[SwapCard] No token metadata found for:', goalCoin);
          }
        });
      } else {
        console.log('[SwapCard] toToken already matches goalCoin:', goalCoin);
      }
    }
  }, [inputMint, goalCoin, walletTokens, fromToken, toToken, fetchTokenMetadata]);

  // Get quote from backend
  const getQuote = useCallback(async () => {
    if (!fromToken || !toToken || !fromAmount || parseFloat(fromAmount) <= 0) {
      setQuote(null);
      setSwapTransaction(null);
      setToAmount('');
      return;
    }

    if (!goalId || !batchId) {
      setError('Missing goal or batch information');
      return;
    }

    setIsLoadingQuote(true);
    setError(null);

    try {
      // Convert fromAmount to smallest units
      const amountInSmallestUnits = Math.floor(
        parseFloat(fromAmount) * Math.pow(10, fromToken.decimals || 9)
      );

      const response = await fetch('/api/swap/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          goalId,
          batchId,
          inputMint: fromToken.symbol,
          outputMint: toToken.symbol,
          amount: amountInSmallestUnits,
          mode: 'quote',
          slippageBps: selectedSlippage.bps,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to get quote');
      }

      setQuote(data.quote);
      setSwapTransaction(data.swapTransaction);
      
      // Calculate output amount
      if (data.quote?.outAmount) {
        const decimals = toToken.decimals || 9;
        const outAmountFormatted = (data.quote.outAmount / Math.pow(10, decimals)).toFixed(6);
        setToAmount(outAmountFormatted);
      }

      // Set quote expiry
      if (data.quote?.expiresAt) {
        setQuoteExpiresAt(new Date(data.quote.expiresAt));
      }

      // Fetch price info
      fetchPriceInfo(fromToken.address, toToken.address);

    } catch (err) {
      console.error('Quote error:', err);
      setError(err.message);
      setQuote(null);
      setSwapTransaction(null);
      setToAmount('');
    } finally {
      setIsLoadingQuote(false);
    }
  }, [fromToken, toToken, fromAmount, goalId, batchId, selectedSlippage]);

  // Set initial amount from prop when component mounts or initialAmount changes
  useEffect(() => {
    if (initialAmount && !fromAmount && fromToken && toToken) {
      console.log('[SwapCard] Setting initial amount from prop:', initialAmount);
      setFromAmount(initialAmount);
      // Trigger quote fetch automatically after a short delay to ensure tokens are ready
      const timer = setTimeout(() => {
        if (fromToken && toToken && initialAmount && parseFloat(initialAmount) > 0) {
          console.log('[SwapCard] Auto-fetching quote with initial amount');
          // Trigger quote fetch directly
          getQuote();
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [initialAmount, fromToken, toToken, fromAmount, getQuote]);

  // Fetch price info from Jupiter
  const fetchPriceInfo = async (inputMint, outputMint) => {
    try {
      const response = await fetch(
        `https://lite-api.jup.ag/price/v2?ids=${inputMint}&vsToken=${outputMint}`
      );
      const data = await response.json();
      setPriceInfo(data.data?.[inputMint] || null);
    } catch (error) {
      console.error('Price fetch error:', error);
      setPriceInfo(null);
    }
  };

  // Execute swap
  const executeSwap = async () => {
    if (!swapTransaction || !quote || !wallet) {
      setError('Missing required data for swap execution');
      return;
    }

    setIsExecuting(true);
    setError(null);

    try {
      // Sign the transaction using the helper function
      const signedTransactionSerialized = await signSolanaTransaction(wallet, swapTransaction);

      // Execute via backend
      const response = await fetch('/api/swap/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          goalId,
          batchId,
          signedTransaction: signedTransactionSerialized,
          quoteResponse: quote,
          mode: 'execute',
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        // Check for retryable errors (QUOTE_EXPIRED or SLIPPAGE_EXCEEDED)
        if (data.retryable && data.newQuote && data.newSwapTransaction) {
          console.log('[SwapCard] Retryable error detected, auto-retrying...', {
            errorCode: data.error?.code,
            newSlippageBps: data.newSlippageBps
          });
          
          // Update quote and transaction
          setQuote(data.newQuote);
          setSwapTransaction(data.newSwapTransaction);
          
          // Update slippage if provided
          if (data.newSlippageBps) {
            const newSlippageOption = SLIPPAGE_OPTIONS.find(opt => opt.bps === data.newSlippageBps);
            if (newSlippageOption) {
              setSelectedSlippage(newSlippageOption);
            }
          }
          
          // Update quote expiry
          if (data.newQuote?.expiresAt) {
            setQuoteExpiresAt(new Date(data.newQuote.expiresAt));
          }
          
          // Calculate new output amount
          if (data.newQuote?.outAmount && toToken) {
            const decimals = toToken.decimals || 9;
            const outAmountFormatted = (data.newQuote.outAmount / Math.pow(10, decimals)).toFixed(6);
            setToAmount(outAmountFormatted);
          }
          
          // Auto-sign new transaction
          console.log('[SwapCard] Auto-signing new transaction...');
          const newSignedTx = await signSolanaTransaction(wallet, data.newSwapTransaction);
          
          // Auto-retry execution
          console.log('[SwapCard] Auto-retrying execution with new signed transaction...');
          const retryResponse = await fetch('/api/swap/execute', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              goalId,
              batchId,
              signedTransaction: newSignedTx,
              quoteResponse: data.newQuote,
              lastValidBlockHeight: data.newLastValidBlockHeight,
              mode: 'execute',
            }),
          });
          
          const retryData = await retryResponse.json();
          
          if (retryResponse.ok && retryData.success) {
            // Success after retry
            console.log('[SwapCard] Swap successful after retry:', retryData);
            
            // Refresh wallet tokens
            refetchWalletTokens();
            
            // Call completion callback
            if (onSwapComplete) {
              onSwapComplete(retryData);
            }
            
            // Reset form
            setFromAmount('');
            setToAmount('');
            setQuote(null);
            setSwapTransaction(null);
            
            return;
          } else {
            // Retry failed
            throw new Error(retryData.error?.message || 'Retry failed');
          }
        }
        
        // Non-retryable error
        throw new Error(data.error?.message || 'Swap execution failed');
      }

      // Success!
      console.log('Swap successful:', data);
      
      // Refresh wallet tokens
      refetchWalletTokens();

      // Call completion callback
      if (onSwapComplete) {
        onSwapComplete(data);
      }

      // Reset form
      setFromAmount('');
      setToAmount('');
      setQuote(null);
      setSwapTransaction(null);

    } catch (err) {
      console.error('Swap execution error:', err);
      setError(err.message);
    } finally {
      setIsExecuting(false);
    }
  };

  // Auto-refresh quote
  useEffect(() => {
    if (quote && fromAmount && fromToken && toToken) {
      // Clear existing timers
      if (quoteRefreshTimer.current) {
        clearInterval(quoteRefreshTimer.current);
      }

      // Set up refresh interval
      quoteRefreshTimer.current = setInterval(() => {
        console.log('Auto-refreshing quote...');
        getQuote();
      }, QUOTE_REFRESH_INTERVAL);

      return () => {
        if (quoteRefreshTimer.current) {
          clearInterval(quoteRefreshTimer.current);
        }
      };
    }
  }, [quote, fromAmount, fromToken, toToken, getQuote]);

  // Monitor quote expiry
  useEffect(() => {
    if (quoteExpiresAt) {
      const checkExpiry = () => {
        const now = new Date();
        const timeUntilExpiry = quoteExpiresAt.getTime() - now.getTime();

        if (timeUntilExpiry <= QUOTE_EXPIRY_BUFFER) {
          console.log('Quote expiring soon, refreshing...');
          getQuote();
        }
      };

      // Check immediately
      checkExpiry();

      // Set up interval
      quoteExpiryTimer.current = setInterval(checkExpiry, 5000);

      return () => {
        if (quoteExpiryTimer.current) {
          clearInterval(quoteExpiryTimer.current);
        }
      };
    }
  }, [quoteExpiresAt, getQuote]);

  // Handle from amount change
  const handleFromAmountChange = (value) => {
    setFromAmount(value);
    // Debounce quote fetching
    if (quoteRefreshTimer.current) {
      clearTimeout(quoteRefreshTimer.current);
    }
    quoteRefreshTimer.current = setTimeout(() => {
      if (value && parseFloat(value) > 0) {
        getQuote();
      }
    }, 500);
  };


  // Handle max button
  const handleMaxClick = () => {
    if (fromToken && fromToken.formattedBalance) {
      const balance = parseFloat(fromToken.formattedBalance);
      // Reserve some for fees if it's SOL
      const maxAmount = fromToken.symbol === 'SOL' 
        ? Math.max(0, balance - 0.01).toFixed(6)
        : balance.toFixed(6);
      setFromAmount(maxAmount);
      handleFromAmountChange(maxAmount);
    }
  };

  // Render
  return (
    <div className={`swap-card ${className}`}>
      <div className="swap-card-header">
        <h3>Swap</h3>
        
        {/* Slippage Selector */}
        <div className="slippage-selector">
          <label>Slippage:</label>
          <div className="slippage-options">
            {SLIPPAGE_OPTIONS.map(option => (
              <button
                key={option.id}
                className={`slippage-option ${selectedSlippage.id === option.id ? 'active' : ''}`}
                onClick={() => setSelectedSlippage(option)}
              >
                {option.value}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* From Token (Locked to SOL) */}
      <div className="token-input-section">
        <label>From</label>
        <div className="token-input-wrapper">
          <div className="token-display">
            {fromToken ? (
              <>
                {fromToken.logoURI && (
                  <img src={fromToken.logoURI} alt={fromToken.symbol} className="token-icon" />
                )}
                <span>{fromToken.symbol}</span>
              </>
            ) : (
              <span>SOL</span>
            )}
          </div>
          
          <input
            type="number"
            value={fromAmount}
            onChange={(e) => handleFromAmountChange(e.target.value)}
            placeholder="0.00"
            className="token-amount-input"
          />
        </div>
        
        {fromToken && (
          <div className="token-balance">
            <span>Balance: {fromToken.formattedBalance || '0.00'}</span>
            <button onClick={handleMaxClick} className="max-button">MAX</button>
          </div>
        )}
      </div>

      {/* Swap Direction Indicator */}
      <div className="swap-arrow">
        <div className="swap-direction-indicator">↓</div>
      </div>

      {/* To Token (Locked to Goal Coin) */}
      <div className="token-input-section">
        <label>To</label>
        <div className="token-input-wrapper">
          <div className="token-display">
            {toToken ? (
              <>
                {toToken.logoURI && (
                  <img src={toToken.logoURI} alt={toToken.symbol} className="token-icon" />
                )}
                <span>{toToken.symbol}</span>
              </>
            ) : (
              <span>{goalCoin}</span>
            )}
          </div>
          
          <input
            type="number"
            value={toAmount}
            readOnly
            placeholder="0.00"
            className="token-amount-input"
          />
        </div>
        
        {toToken && toToken.formattedBalance && (
          <div className="token-balance">
            <span>Balance: {toToken.formattedBalance}</span>
          </div>
        )}
      </div>

      {/* Price Info */}
      {priceInfo && priceInfo.price && (
        <div className="price-info">
          <span>1 {fromToken?.symbol} ≈ {Number(priceInfo.price).toFixed(6)} {toToken?.symbol}</span>
        </div>
      )}

      {/* Quote Info */}
      {quote && (
        <div className="quote-info">
          <div className="quote-row">
            <span>Price Impact:</span>
            <span className={Number(quote.priceImpactPct || 0) > 1 ? 'warning' : ''}>
              {Number(quote.priceImpactPct || 0).toFixed(2)}%
            </span>
          </div>
          <div className="quote-row">
            <span>Minimum Received:</span>
            <span>{(quote.otherAmountThreshold / Math.pow(10, toToken?.decimals || 9)).toFixed(6)} {toToken?.symbol}</span>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* Action Button */}
      <button
        className="swap-button"
        onClick={quote ? executeSwap : getQuote}
        disabled={isLoadingQuote || isExecuting || !fromToken || !toToken || !fromAmount}
      >
        {isExecuting ? 'Executing...' : isLoadingQuote ? 'Getting Quote...' : quote ? 'Swap' : 'Get Quote'}
      </button>

      <style jsx>{`
        .swap-card {
          background: white;
          border-radius: 16px;
          padding: 24px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .swap-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .swap-card-header h3 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #1a1a1a;
        }

        .slippage-selector {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .slippage-selector label {
          font-size: 14px;
          color: #333;
          font-weight: 500;
        }

        .slippage-options {
          display: flex;
          gap: 4px;
        }

        .slippage-option {
          padding: 4px 12px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: white;
          cursor: pointer;
          font-size: 12px;
          transition: all 0.2s;
        }

        .slippage-option:hover {
          border-color: #007bff;
        }

        .slippage-option.active {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }

        .token-input-section {
          margin-bottom: 16px;
        }

        .token-input-section label {
          display: block;
          margin-bottom: 8px;
          font-size: 14px;
          color: #333;
          font-weight: 500;
        }

        .token-input-wrapper {
          display: flex;
          gap: 12px;
          align-items: center;
          padding: 12px;
          border: 1px solid #ddd;
          border-radius: 12px;
          background: #f8f9fa;
        }

        .token-display {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border: 1px solid #ddd;
          border-radius: 8px;
          background: white;
          font-size: 14px;
          font-weight: 500;
          white-space: nowrap;
          color: #1a1a1a;
        }

        .token-icon {
          width: 20px;
          height: 20px;
          border-radius: 50%;
        }

        .token-amount-input {
          flex: 1;
          border: none;
          background: transparent;
          font-size: 18px;
          font-weight: 500;
          text-align: right;
          outline: none;
          color: #1a1a1a;
        }
        
        .token-amount-input::placeholder {
          color: #999;
        }

        .token-amount-input::-webkit-inner-spin-button,
        .token-amount-input::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }

        .token-balance {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
          font-size: 12px;
          color: #444;
          font-weight: 500;
        }

        .max-button {
          padding: 2px 8px;
          border: 1px solid #007bff;
          border-radius: 4px;
          background: transparent;
          color: #007bff;
          cursor: pointer;
          font-size: 11px;
          font-weight: 600;
        }

        .max-button:hover {
          background: #007bff;
          color: white;
        }

        .swap-arrow {
          display: flex;
          justify-content: center;
          margin: 16px 0;
        }

        .swap-direction-indicator {
          width: 40px;
          height: 40px;
          border: 1px solid #ddd;
          border-radius: 50%;
          background: white;
          font-size: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #666;
        }

        .price-info {
          margin: 16px 0;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 8px;
          text-align: center;
          font-size: 14px;
          color: #333;
          font-weight: 500;
        }

        .quote-info {
          margin: 16px 0;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .quote-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
          font-size: 14px;
          color: #333;
        }

        .quote-row:last-child {
          margin-bottom: 0;
        }

        .quote-row .warning {
          color: #f57c00;
          font-weight: 700;
        }
        
        .quote-row span:first-child {
          color: #666;
        }
        
        .quote-row span:last-child {
          color: #1a1a1a;
          font-weight: 600;
        }

        .error-message {
          margin: 16px 0;
          padding: 12px;
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 8px;
          color: #856404;
          font-size: 14px;
        }

        .swap-button {
          width: 100%;
          padding: 16px;
          border: none;
          border-radius: 12px;
          background: #007bff;
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .swap-button:hover:not(:disabled) {
          background: #0056b3;
        }

        .swap-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

