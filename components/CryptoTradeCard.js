'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import {
  getAssociatedTokenAddress,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { useSolanaWallet, signSolanaTransaction } from '@/lib/solana-wallet';
import { getSolanaConnection, getFormattedTokenBalance, getTokens, getSOLBalance } from '@/lib/solana';
import { ChevronRight } from 'lucide-react';
import { useToast } from './ToastContainer';

// Constants
const SLIPPAGE_OPTIONS = [
  { id: 'slip1', value: '0.1%', bps: 10 },
  { id: 'slip2', value: '0.5%', bps: 50 },
  { id: 'slip3', value: '0.7%', bps: 70 },
];

// Custom hook for token search
const useTokenSearch = (addToast) => {
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const transformJupiterToken = (jupiterToken) => {
    return {
      address: jupiterToken.id,
      symbol: jupiterToken.symbol,
      name: jupiterToken.name,
      decimals: jupiterToken.decimals,
      logoURI: jupiterToken.icon,
      balance: 0,
      formattedBalance: '0.000000',
      title: jupiterToken.symbol || jupiterToken.name,
      isVerified: jupiterToken.isVerified || false,
      source: 'jupiter',
    };
  };

  const transformBackendToken = (backendToken) => {
    return {
      address: backendToken.id,
      symbol: backendToken.symbol,
      name: backendToken.name,
      decimals: backendToken.decimals,
      logoURI: backendToken.icon,
      balance: 0,
      formattedBalance: '0.000000',
      title: backendToken.symbol || backendToken.name,
      isVerified: backendToken.isVerified || false,
      usdPrice: backendToken.usdPrice || null,
      source: 'backend',
    };
  };

  const searchJupiterTokens = async (query, limit = 50) => {
    try {
      const url = `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Jupiter API error: ${response.status}`);
      }

      const jupiterTokens = await response.json();
      const filteredTokens = jupiterTokens.filter((token) => token.isVerified === true);
      return filteredTokens.map(transformJupiterToken);
    } catch (error) {
      console.error('Error searching Jupiter tokens:', error);
      return [];
    }
  };

  const searchTokens = useCallback(async (query = '', limit = 50) => {
    setIsSearching(true);
    setSearchError(null);

    try {
      let backendTokens = [];
      let backendError = null;

      try {
        const backendResponse = await fetch(`/api/tokens/search?q=${encodeURIComponent(query)}&limit=${limit}`);
        const backendData = await backendResponse.json();
        const rawBackendTokens = backendData.tokens || [];
        backendTokens = rawBackendTokens.map(transformBackendToken);
      } catch (error) {
        backendError = error;
      }

      if (query && query.length >= 2) {
        try {
          const jupiterTokens = await searchJupiterTokens(query, limit);
          if (jupiterTokens.length > 0) {
            const backendAddresses = new Set(backendTokens.map((token) => token.address.toLowerCase()));
            const uniqueJupiterTokens = jupiterTokens.filter(
              (jupiterToken) => !backendAddresses.has(jupiterToken.address.toLowerCase())
            );
            const combinedTokens = [...backendTokens, ...uniqueJupiterTokens];
            setSearchResults(combinedTokens);
          } else {
            setSearchResults(backendTokens);
          }
        } catch (jupiterError) {
          setSearchResults(backendTokens);
        }
      } else {
        setSearchResults(backendTokens);
      }

      if (backendError && query && query.length >= 2 && searchResults.length === 0) {
        setSearchError('Failed to search tokens');
        if (addToast) addToast('Failed to search tokens', 'error');
      }
    } catch (error) {
      setSearchError('Failed to search tokens');
      if (addToast) addToast('Failed to search tokens', 'error');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [addToast]);

  useEffect(() => {
    searchTokens();
  }, [searchTokens]);

  return { searchResults, isSearching, searchError, searchTokens };
};

// Main Component
export default function CryptoTradeCard({ userTokens = [], action = 'buy', onClose, goalCoin, goalId, batchId }) {
  const { addToast } = useToast();
  const wallet = useSolanaWallet();
  const connection = getSolanaConnection();

  const [tokens, setTokens] = useState(userTokens);
  const [selectedCrypto1, setSelectedCrypto1] = useState(userTokens[0] || null);
  const [selectedCrypto2, setSelectedCrypto2] = useState(null);
  const [selectedSlippage, setSelectedSlippage] = useState(SLIPPAGE_OPTIONS[1]);
  const [depositToken, setDepositToken] = useState('0');
  const [receiveToken, setReceiveToken] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const [quotedRes, setQuoteRes] = useState(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [activeInput, setActiveInput] = useState('send');
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [tokenModalType, setTokenModalType] = useState('send');
  const [searchQuery, setSearchQuery] = useState('');
  const [depositTokenPrice, setDepositTokenPrice] = useState(null);
  const [receiveTokenPrice, setReceiveTokenPrice] = useState(null);
  const [isPriceLoading, setIsPriceLoading] = useState(false);
  const [tokensWithBalances, setTokensWithBalances] = useState([]);
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const { searchResults, isSearching, searchTokens } = useTokenSearch(addToast);

  // Set goalCoin as default selectedCrypto2
  useEffect(() => {
    if (goalCoin && searchResults.length > 0) {
      const goalToken = searchResults.find(
        (token) => token.symbol?.toUpperCase() === goalCoin.toUpperCase()
      );
      if (goalToken) {
        setSelectedCrypto2(goalToken);
      }
    }
  }, [goalCoin, searchResults]);

  // Initialize selectedCrypto1 with SOL if not set
  useEffect(() => {
    if (!selectedCrypto1 && searchResults.length > 0) {
      const solToken = searchResults.find(
        (token) => token.symbol === 'SOL' || token.address === 'So11111111111111111111111111111111111111112'
      );
      if (solToken) {
        setSelectedCrypto1(solToken);
      } else if (searchResults[0]) {
        setSelectedCrypto1(searchResults[0]);
      }
    }
  }, [searchResults, selectedCrypto1]);

  const getSolBalance = async (userPublicKey) => {
    try {
      const balance = await getSOLBalance(userPublicKey);
      return balance.sol; // Return SOL amount
    } catch (error) {
      console.error('Error fetching SOL balance:', error);
      throw error;
    }
  };

  const formatDisplayValue = (value) => {
    const numValue = parseFloat(value);
    if (numValue === 0 || isNaN(numValue)) return '0';
    if (numValue < 0.000001 && numValue > 0) {
      return numValue.toFixed(8).replace(/\.?0+$/, '');
    }
    if (numValue < 0.01 && numValue >= 0.000001) {
      return numValue.toFixed(6).replace(/\.?0+$/, '');
    }
    if (numValue < 1000) {
      return numValue.toFixed(4).replace(/\.?0+$/, '');
    }
    return numValue.toLocaleString('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 0,
    });
  };

  const fetchTokenPrice = async (address, symbol) => {
    try {
      setIsPriceLoading(true);
      const priceResponse = await fetch(`https://lite-api.jup.ag/price/v3?ids=${address}`);
      const priceData = await priceResponse.json();
      return priceData[address]?.usdPrice || null;
    } catch (error) {
      console.error(`Error fetching price for ${symbol}:`, error);
      return null;
    } finally {
      setIsPriceLoading(false);
    }
  };

  const fetchSelectedTokenBalance = async () => {
    if (!wallet?.address || !selectedCrypto1) return;

    try {
      setIsLoadingBalances(true);
      const userPublicKey = new PublicKey(wallet.address);

      try {
        let balance = 0;

        if (
          selectedCrypto1.symbol === 'SOL' ||
          selectedCrypto1.address === 'So11111111111111111111111111111111111111112'
        ) {
          const solBalance = await getSolBalance(userPublicKey);
          balance = solBalance;
        } else {
          const formattedBalance = await getFormattedTokenBalance(
            userPublicKey,
            selectedCrypto1.address
          );
          balance = formattedBalance || 0;
        }

        const updatedSelectedToken = {
          ...selectedCrypto1,
          balance: balance,
          formattedBalance: balance,
          title: selectedCrypto1.symbol || selectedCrypto1.name,
        };

        setSelectedCrypto1(updatedSelectedToken);

        setTokens((prevTokens) =>
          prevTokens.map((token) =>
            token.address === selectedCrypto1.address
              ? updatedSelectedToken
              : token
          )
        );
      } catch (error) {
        console.log(`Error fetching balance for ${selectedCrypto1.symbol}:`, error);
        const updatedSelectedToken = {
          ...selectedCrypto1,
          balance: 0,
          formattedBalance: '0.000000',
          title: selectedCrypto1.symbol || selectedCrypto1.name,
        };
        setSelectedCrypto1(updatedSelectedToken);
      }
    } catch (error) {
      console.error('Error fetching selected token balance:', error);
    } finally {
      setIsLoadingBalances(false);
    }
  };

  const getUserToken = async (address) => {
    try {
      setIsLoadingTokens(true);
      const tokenList = await getTokens(new PublicKey(address));
      setTokens(tokenList);
      if (tokenList.length > 0 && !selectedCrypto1) {
        setSelectedCrypto1(tokenList[0]);
      }
    } catch (error) {
      console.log(error);
      addToast('Something went wrong! Please try after sometime', 'error');
    } finally {
      setIsLoadingTokens(false);
    }
  };

  const getSwapInfo = async () => {
    if (!selectedCrypto1 || !selectedCrypto2) return;

    const amount = BigInt(Math.floor(Number(depositToken) * 10 ** selectedCrypto1.decimals));

    try {
      const quoteResponse = await fetch(
        `https://lite-api.jup.ag/swap/v1/quote?inputMint=${selectedCrypto1.address}&outputMint=${selectedCrypto2.address}&amount=${amount}&slippageBps=50`
      ).then((res) => res.json());

      if (quoteResponse.error) {
        if (quoteResponse.errorCode === 'COULD_NOT_FIND_ANY_ROUTE') {
          addToast('No route found for trade. Please try some other combination', 'error');
          return;
        }
        if (quoteResponse.errorCode === 'TOKEN_NOT_TRADABLE') {
          addToast('Token not tradeable', 'error');
          return;
        }
        if (quoteResponse.errorCode === 'ROUTE_PLAN_DOES_NOT_CONSUME_ALL_THE_AMOUNT') {
          addToast('Try reducing input amount, trade value too large', 'error');
          return;
        }
        addToast('Something went wrong while fetching trade route. Please try again.', 'error');
        return;
      }

      setReceiveToken((quoteResponse.outAmount / Math.pow(10, selectedCrypto2.decimals)).toString());
      setQuoteRes(quoteResponse);
    } catch (err) {
      addToast('Error getting swap quote', 'error');
    }
  };

  const swapViaDex = async () => {
    if (isLoading) return;

    if (!selectedCrypto1) {
      addToast(`Please select token to ${action === 'buy' ? 'pay' : 'sell'}`, 'error');
      return;
    }

    let shouldResetTokens = true;

    if (!selectedCrypto2 || selectedCrypto1.address === selectedCrypto2.address) {
      addToast("Tokens can't be same", 'error');
      return;
    }

    if (depositToken === '' || Number(depositToken) === 0 || receiveToken === '' || Number(receiveToken) === 0) {
      addToast("Tokens can't be Zero", 'error');
      return;
    }

    if (!wallet?.address) {
      addToast('Please connect your wallet', 'error');
      return;
    }

    setIsLoading(true);
    try {
      let solBalance = await getSolBalance(wallet.address);

      if (solBalance < 0.000105) {
        addToast('SOL balance must be more than 0.000105 to cover transaction fees', 'error');
        return;
      }

      if (selectedCrypto1?.symbol === 'SOL') {
        if (solBalance < 0.00211) {
          addToast('SOL balance must be more than 0.00211 to cover account maintenance and transaction fees', 'error');
          return;
        }
        if (solBalance < Number(depositToken)) {
          addToast(`you have ${solBalance} SOL balance`, 'error');
          setIsLoading(false);
          return;
        }
      } else {
        let tokBalance = await getFormattedTokenBalance(
          wallet.address,
          selectedCrypto1.address
        );

        if (tokBalance < Number(depositToken)) {
          addToast(`you have ${tokBalance} ${selectedCrypto1.symbol || 'Token'} balance`, 'error');
          setIsLoading(false);
          return;
        }
      }

      let mintInfoInput;
      let mintInfoOutput;
      let isToken2022Input;
      let isToken2022Output;
      if (selectedCrypto1.symbol !== 'SOL') {
        mintInfoInput = await connection.getAccountInfo(new PublicKey(selectedCrypto1.address));
        isToken2022Input = mintInfoInput?.owner.equals(TOKEN_2022_PROGRAM_ID);
      }
      if (selectedCrypto2.symbol !== 'SOL') {
        mintInfoOutput = await connection.getAccountInfo(new PublicKey(selectedCrypto2.address));
        isToken2022Output = mintInfoOutput?.owner.equals(TOKEN_2022_PROGRAM_ID);
      }

      const isOutputTokenSol = selectedCrypto2.symbol === 'SOL';

      let userTokenAccount;
      let userAccountInfo;
      if (!isOutputTokenSol) {
        userTokenAccount = await getAssociatedTokenAddress(
          new PublicKey(selectedCrypto2.address),
          new PublicKey(wallet.address),
          true,
          isToken2022Output ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID
        );

        userAccountInfo = await connection.getAccountInfo(userTokenAccount);
      }

      const swapBody = {
        quoteResponse: quotedRes,
        userPublicKey: wallet.address,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: 10000,
            priorityLevel: 'medium',
          },
        },
      };

      const { swapTransaction } = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapBody),
      }).then((res) => res.json());

      const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      const signedTransactionSerialized = await signSolanaTransaction(wallet, swapTransaction);
      const latestBlockHash = await connection.getLatestBlockhash('confirmed');

      const signedTxBuffer = Buffer.from(signedTransactionSerialized, 'base64');
      const signedTx = VersionedTransaction.deserialize(signedTxBuffer);

      const rawTransaction = signedTx.serialize();
      const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 2,
        preflightCommitment: 'confirmed',
      });

      try {
        const res = await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: txid,
        });
        const jupErr = res.value.err;

        if (jupErr) {
          let errorMessage = 'Kindly ensure your balance has at least 0.003 additional SOL before proceeding, or try again after some time.';

          if (JSON.stringify(jupErr).includes('6001') || JSON.stringify(jupErr).includes('6017')) {
            errorMessage = 'Your trade did not complete because the market price changed before your order was processed. No funds were lost';
          }

          addToast(errorMessage, 'error');
          return;
        }

        addToast('Trade successful!', 'success');
        if (onClose) {
          setTimeout(() => {
            onClose();
          }, 1000);
        }
      } catch (confirmError) {
        const confirmErrorString = JSON.stringify(confirmError).toLowerCase();
        const isBlockheightError =
          confirmError?.message?.includes('TransactionExpiredBlockheightExceededError') ||
          confirmError?.message?.includes('block height exceeded') ||
          confirmError?.message?.includes('expired') ||
          confirmError?.name === 'TransactionExpiredBlockheightExceededError' ||
          confirmErrorString.includes('transactionexpiredblockheightexceedederror') ||
          confirmErrorString.includes('block height exceeded') ||
          confirmErrorString.includes('expired');

        if (isBlockheightError) {
          console.log('Transaction confirmation failed due to blockheight exceeded. Fetching new quote...');
          try {
            await getSwapInfo();
            shouldResetTokens = false;
            addToast('Transaction expired. New quote fetched - please try again.', 'error');
            setIsLoading(false);
            return;
          } catch (quoteError) {
            console.log('Error fetching new quote:', quoteError);
            addToast('Transaction expired. Please refresh and try again.', 'error');
          }
          setIsLoading(false);
          return;
        }

        throw confirmError;
      }
    } catch (err) {
      console.log('dex error', err);

      const errorString = JSON.stringify(err).toLowerCase();
      const isBlockheightError =
        err?.message?.includes('TransactionExpiredBlockheightExceededError') ||
        err?.message?.includes('block height exceeded') ||
        err?.message?.includes('expired') ||
        err?.name === 'TransactionExpiredBlockheightExceededError' ||
        errorString.includes('transactionexpiredblockheightexceedederror') ||
        errorString.includes('block height exceeded') ||
        errorString.includes('expired');

      if (isBlockheightError) {
        console.log('Transaction expired due to blockheight exceeded. Fetching new quote...');
        try {
          await getSwapInfo();
          shouldResetTokens = false;
          addToast('Transaction expired. New quote fetched - please try again.', 'error');
          setIsLoading(false);
          return;
        } catch (quoteError) {
          console.log('Error fetching new quote:', quoteError);
          addToast('Transaction expired. Please refresh and try again.', 'error');
        }
        setIsLoading(false);
        return;
      }

      if (JSON.stringify(err).includes('InstructionError')) {
        await getSwapInfo();
        shouldResetTokens = false;
        addToast('Price updated', 'error');
        setIsLoading(false);
        return;
      }

      addToast('Something went wrong! Please try after sometime', 'error');
    } finally {
      setIsLoading(false);
      if (shouldResetTokens) {
        setReceiveToken('0');
        setDepositToken('0');
      }
    }
  };

  const handleKeypadPress = async (value) => {
    if (!wallet?.address) return;
    const currentValue = activeInput === 'send' ? depositToken : receiveToken;
    const setValue = activeInput === 'send' ? setDepositToken : setReceiveToken;
    const currentToken = activeInput === 'send' ? selectedCrypto1 : selectedCrypto2;

    if (value === 'CLEAR') {
      setValue('0');
    } else if (value === 'MAX' || value === '75%' || value === '50%') {
      if (!currentToken || !wallet.address) {
        setValue('0');
        addToast('No token selected or wallet not connected', 'error');
        return;
      }
      try {
        let balance;

        if (
          currentToken.symbol === 'SOL' ||
          currentToken.address === 'So11111111111111111111111111111111111111112'
        ) {
          const solBalance = await getSolBalance(wallet.address);
          balance = solBalance;
        } else {
          balance = await getFormattedTokenBalance(wallet.address, currentToken.address);
        }

        if (balance) {
          let calculatedAmount;
          if (value === 'MAX') {
            if (selectedCrypto1.symbol === 'SOL') {
              if (balance < 0.00211) {
                addToast('SOL balance must be more than 0.00211', 'error');
              } else {
                calculatedAmount = balance - 0.00211;
              }
            } else {
              calculatedAmount = balance;
            }
          } else if (value === '75%') {
            const seventyFivePercent = parseFloat(balance) * 0.75;
            calculatedAmount = seventyFivePercent;
          } else if (value === '50%') {
            const fiftyPercent = parseFloat(balance) * 0.5;
            calculatedAmount = fiftyPercent;
          }

          if (calculatedAmount !== undefined) {
            setValue(calculatedAmount.toString());
          }
        } else {
          setValue('0');
          addToast('Token balance is zero', 'error');
        }
      } catch (error) {
        console.log('Error fetching balance:', error);
        setValue('0');
        addToast('Failed to get token balance', 'error');
      }
    } else if (value === '.') {
      if (!currentValue.includes('.')) {
        setValue(currentValue === '0' ? '0.' : currentValue + '.');
      }
    } else if (value === '⌫') {
      if (currentValue.length > 1) {
        setValue(currentValue.slice(0, -1));
      } else {
        setValue('0');
      }
    } else {
      if (currentValue === '0') {
        setValue(value);
      } else {
        setValue(currentValue + value);
      }
    }
  };

  const openKeypad = (inputType) => {
    setActiveInput(inputType);
    setShowKeypad(true);
  };

  const toggleTooltip = () => {
    setShowTooltip((prev) => !prev);
  };

  const filteredUserTokens = useMemo(() => {
    if (!searchQuery.trim()) {
      return tokens;
    }
    const query = searchQuery.toLowerCase().trim();
    return tokens.filter(
      (token) =>
        token.symbol?.toLowerCase().includes(query) ||
        token.name?.toLowerCase().includes(query) ||
        token.address?.toLowerCase().includes(query)
    );
  }, [tokens, searchQuery]);

  const depositUsdValue = useMemo(() => {
    if (!depositToken || !depositTokenPrice) return '0.00';
    return (parseFloat(depositToken) * depositTokenPrice).toFixed(2);
  }, [depositToken, depositTokenPrice]);

  const receiveUsdValue = useMemo(() => {
    if (!receiveToken || !receiveTokenPrice) return '0.00';
    return (parseFloat(receiveToken) * receiveTokenPrice).toFixed(2);
  }, [receiveToken, receiveTokenPrice]);

  const getCurrentAmount = () => {
    return activeInput === 'send' ? depositToken : receiveToken;
  };

  const getCurrentTokenSymbol = () => {
    if (activeInput === 'send') {
      return selectedCrypto1?.symbol || selectedCrypto1?.name || '';
    } else {
      return selectedCrypto2?.symbol || selectedCrypto2?.name || '';
    }
  };

  const getCurrentUsdValue = () => {
    if (activeInput === 'send') {
      return depositUsdValue;
    } else {
      return receiveUsdValue;
    }
  };

  useEffect(() => {
    async function updateTokenPrices() {
      if (selectedCrypto1?.symbol) {
        const price = await fetchTokenPrice(selectedCrypto1.address, selectedCrypto1.symbol);
        setDepositTokenPrice(price);
      }
    }
    updateTokenPrices();
  }, [selectedCrypto1]);

  useEffect(() => {
    async function updateTokenPrices() {
      if (selectedCrypto2?.symbol) {
        const price = await fetchTokenPrice(selectedCrypto2.address, selectedCrypto2.symbol);
        setReceiveTokenPrice(price);
      }
    }
    updateTokenPrices();
  }, [selectedCrypto2]);

  useEffect(() => {
    if (!selectedCrypto2 && searchResults.length > 0) {
      const defaultToken =
        searchResults.find((token) => token.symbol === 'SOL' || token.symbol === 'USDC') ||
        searchResults[0];
      setSelectedCrypto2(defaultToken);
    }
  }, [searchResults, selectedCrypto2]);

  useEffect(() => {
    let interval;

    if (
      selectedCrypto1 &&
      selectedCrypto2 &&
      depositToken &&
      Number(depositToken) > 0 &&
      !isLoading &&
      selectedCrypto1?.address !== selectedCrypto2?.address
    ) {
      getSwapInfo();

      interval = setInterval(() => {
        if (
          selectedCrypto1 &&
          selectedCrypto2 &&
          depositToken &&
          Number(depositToken) > 0 &&
          !isLoading &&
          selectedCrypto1?.address !== selectedCrypto2?.address
        ) {
          getSwapInfo();
        }
      }, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [selectedCrypto1?.address, selectedCrypto2?.address, depositToken, selectedSlippage, isLoading]);

  useEffect(() => {
    if (wallet?.address) {
      getUserToken(new PublicKey(wallet.address));
    }
  }, [wallet?.address]);

  useEffect(() => {
    if (selectedCrypto1 && wallet?.address) {
      fetchSelectedTokenBalance();
    }
  }, [selectedCrypto1?.address, wallet?.address]);

  return (
    <div className="flex-1 bg-[#0A1E1E] p-2 min-h-screen lg:p-10 relative">
      <div className="flex items-center justify-between mb-7">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="flex items-center gap-1 focus:outline-none">
            <ChevronRight className="rotate-180 text-[#FFB217]" width={18} height={18} />
            <span className="text-[#FFB217] text-xs font-normal mt-0.5">BACK</span>
          </button>
        </div>
      </div>

      <div className="w-full bg-[#0c2626] rounded-[32px] p-6 font-['Montserrat']">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white text-xl font-bold">
            {action === 'buy' ? 'Buy Tokens' : 'Sell Tokens'}
          </h2>
        </div>

        {/* You Pay Section */}
        <div className="mb-6">
          <button
            onClick={() => {
              setTokenModalType('send');
              setShowTokenModal(true);
            }}
            className="w-full"
          >
            <div className="flex flex-row justify-between border-b border-[#ffffff61] pb-2.5 items-center">
              <span className="text-white text-xs">You Pay:</span>
              <div className="flex flex-row items-center gap-2 max-w-[200px]">
                {selectedCrypto1?.logoURI && (
                  <img
                    src={selectedCrypto1.logoURI}
                    alt={selectedCrypto1.symbol}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div className="flex flex-col flex-1">
                  <span className="text-white text-base font-semibold">
                    {selectedCrypto1?.symbol || selectedCrypto1?.name || ''}
                  </span>
                  <span className="text-[#e0cdcd] text-xs italic">
                    {selectedCrypto1?.formattedBalance?.toFixed(6) || '0.000000'}{' '}
                    {selectedCrypto1?.symbol || ''}
                  </span>
                </div>
                <div className="rotate-90">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </div>
            </div>
          </button>

          <div className="flex flex-row justify-between mt-4">
            <button onClick={() => openKeypad('send')} className="flex flex-col gap-1">
              <span className="text-white text-4xl font-bold">{formatDisplayValue(depositToken)}</span>
              <span className="text-[#FFB217] text-sm">≈ ${depositUsdValue}</span>
            </button>
            <button
              onClick={() => handleKeypadPress('MAX')}
              className="self-end bg-[#214C4F] px-4 py-2 rounded-xl"
            >
              <span className="text-white text-lg font-semibold">MAX</span>
            </button>
          </div>
        </div>

        {/* Swap Icon */}
        <div className="flex justify-center my-4">
          <div className="bg-transparent">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFB217" strokeWidth="2">
              <path d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
            </svg>
          </div>
        </div>

        {/* You Receive Section */}
        <div className="mb-6">
          <button
            onClick={() => {
              setTokenModalType('receive');
              setShowTokenModal(true);
            }}
            className="w-full"
          >
            <div className="flex flex-row justify-between border-b border-[#ffffff61] pb-2.5 items-center">
              <span className="text-white text-xs">You Receive:</span>
              <div className="flex flex-row items-center gap-2 max-w-[160px]">
                {selectedCrypto2?.logoURI && (
                  <img
                    src={selectedCrypto2.logoURI}
                    alt={selectedCrypto2.symbol}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <div className="flex flex-col flex-1">
                  <span className="text-white text-base font-semibold">
                    {selectedCrypto2?.symbol || selectedCrypto2?.name || 'Select Token'}
                  </span>
                </div>
                <div className="rotate-90">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              </div>
            </div>
          </button>

          <div className="flex flex-row justify-between mt-4 relative">
            <div className="flex flex-col gap-1">
              <span className="text-[#248368] text-4xl font-bold">{receiveToken}</span>
              <span className="text-[#FFB217] text-sm">≈ ${receiveUsdValue}</span>
            </div>

            {/* Warning Icon with Disclaimer */}
            <div className="absolute bottom-3 right-3">
              <div className="relative">
                <button
                  className="bg-[#36676E] p-2 rounded-full"
                  onClick={toggleTooltip}
                  onMouseEnter={() => setShowTooltip(true)}
                  onMouseLeave={() => setShowTooltip(false)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2L2 22h20L12 2zm0 3.5L19.5 20h-15L12 5.5z" />
                    <path d="M11 10h2v5h-2zm0 6h2v2h-2z" />
                  </svg>
                </button>

                {showTooltip && (
                  <div className="absolute bottom-full right-0 mb-2 w-64 bg-[#36676E] rounded-2xl rounded-br-none p-4 z-50">
                    <p className="text-white text-sm leading-6">
                      DISCLAIMER: Before purchasing any token, always verify its logo, symbol, and rating. Scammers
                      often create lookalike tokens that mimic the name or branding of legitimate projects. Ensure
                      you're interacting with the correct token.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Trade Button */}
        <button
          onClick={swapViaDex}
          disabled={isLoading}
          className={`w-full py-4 rounded-2xl font-bold text-lg mt-auto mb-4 ${
            isLoading
              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
              : 'bg-[#FFB217] text-[#0c2626] hover:bg-[#e5a015]'
          }`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading...
            </span>
          ) : action === 'buy' ? (
            'BUY NOW'
          ) : (
            'SELL NOW'
          )}
        </button>

        {/* TOKEN SELECTION MODAL */}
        {showTokenModal && (
          <div className="fixed inset-0 bg-[#0c2626] z-50 flex flex-col">
            <div className="flex justify-between items-center px-5 py-4 border-b border-[#174545]">
              <h3 className="text-[#FFB217] text-xl font-bold">
                {tokenModalType === 'send' ? 'Select Token to Send' : 'Select Token to Receive'}
              </h3>
              <button onClick={() => setShowTokenModal(false)} className="text-[#FFB217] text-2xl font-bold">
                ✕
              </button>
            </div>

            {isLoadingTokens && (
              <div className="flex justify-center p-4">
                <svg className="animate-spin h-6 w-6 text-[#FFB217]" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              </div>
            )}

            {tokenModalType === 'send' ? (
              <>
                <div className="px-5 py-4 border-b border-[#174545]">
                  <input
                    type="text"
                    placeholder="Search your tokens..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#174545] text-white px-4 py-4 rounded-full placeholder-gray-500 outline-none"
                    autoCorrect="off"
                    autoComplete="off"
                  />
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  <h4 className="text-[#FFB217] text-base font-semibold mb-3">Your Tokens</h4>
                  <div className="flex flex-col">
                    {filteredUserTokens.map((item) => (
                      <button
                        key={item.address}
                        onClick={() => {
                          setSelectedCrypto1(item);
                          setShowTokenModal(false);
                          setSearchQuery('');
                        }}
                        className="flex items-center py-4 px-1 border-b border-[#174545]"
                      >
                        <img src={item.logoURI} alt={item.symbol} width={32} height={32} className="w-8 h-8 rounded-full" />
                        <div className="flex-1 ml-2 text-left">
                          <div className="flex items-center justify-between">
                            <span className="text-white text-base font-semibold">{item.symbol || item.name}</span>
                            <span className="text-[#4CAF50] text-xs">Verified</span>
                          </div>
                          {item.name && item.symbol && item.name !== item.symbol && (
                            <span className="text-gray-400 text-xs">{item.name}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-[#174545] relative">
                  <input
                    type="text"
                    placeholder="Search token by name, symbol or address"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      searchTokens(e.target.value);
                    }}
                    className="w-full bg-[#174545] text-white px-4 py-4 rounded-full placeholder-gray-500 outline-none"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-8 top-1/2 -translate-y-1/2 bg-[#FFB217] px-2 py-1 rounded text-[#0c2626] text-xs font-semibold"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4">
                  {isSearching ? (
                    <div className="flex items-center justify-center py-5">
                      <svg className="animate-spin h-6 w-6 text-[#FFB217]" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-gray-400 text-base">No results found</p>
                      {searchQuery && <p className="text-gray-500 text-sm mt-2">Try a different search term</p>}
                    </div>
                  ) : (
                    <>
                      <h4 className="text-[#FFB217] text-base font-semibold mb-3">All Tokens</h4>
                      <div className="flex flex-col">
                        {searchResults.map((item) => (
                          <button
                            key={item.address}
                            onClick={() => {
                              setSelectedCrypto2(item);
                              setShowTokenModal(false);
                              setSearchQuery('');
                            }}
                            className="flex items-center py-4 px-1 border-b border-[#174545]"
                          >
                            <img src={item.logoURI} alt={item.symbol} className="w-8 h-8 rounded-full" />
                            <div className="flex-1 ml-2 text-left">
                              <div className="flex items-center gap-2">
                                <span className="text-white text-base font-semibold">{item.symbol || item.name}</span>
                                {item.isVerified && <span className="text-[#4CAF50] text-xs">✓ Verified</span>}
                              </div>
                              {item.name && item.symbol && item.name !== item.symbol && (
                                <span className="text-gray-400 text-xs">{item.name}</span>
                              )}
                              {item.source === 'backend' && item.organicScoreLabel && (
                                <span className="text-[#4CAF50] text-[11px]">Score: {item.organicScoreLabel}</span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* KEYPAD MODAL */}
        {showKeypad && (
          <div className="fixed inset-0 bg-black/80 flex items-end justify-center z-50">
            <div className="bg-[#0c2626] rounded-t-3xl w-full p-5 pb-10">
              <div className="flex justify-between items-start mb-6">
                <div className="flex-1">
                  <p className="text-[#FFB217] text-sm font-bold mb-2">Enter Amount</p>
                  <div className="flex items-center gap-2">
                    <span className="text-white text-4xl font-bold">{getCurrentAmount()}</span>
                    <span className="text-white text-2xl font-bold">{getCurrentTokenSymbol()}</span>
                  </div>
                  <p className="text-[#FFB217] text-base mt-1">${getCurrentUsdValue()}</p>
                  {activeInput === 'send' && selectedCrypto1 && (
                    <p className="text-gray-500 text-sm italic mt-1">
                      Balance: {selectedCrypto1.formattedBalance || '0.000000'} {selectedCrypto1.symbol || ''}
                    </p>
                  )}
                </div>
                <button onClick={() => setShowKeypad(false)} className="text-[#FFB217] text-xl font-bold p-2">
                  ✕
                </button>
              </div>

              <div className="flex flex-wrap justify-between">
                <button
                  onClick={() => handleKeypadPress('MAX')}
                  disabled={activeInput !== 'send'}
                  className={`w-[22%] h-12 bg-[#124D4B] rounded-xl mb-3 ${
                    activeInput === 'send' ? 'text-white' : 'text-gray-500'
                  } text-sm font-semibold`}
                >
                  MAX
                </button>
                <button onClick={() => handleKeypadPress('1')} className="w-[22%] h-12 rounded-xl mb-3 text-white text-2xl font-semibold">
                  1
                </button>
                <button onClick={() => handleKeypadPress('2')} className="w-[22%] h-12 rounded-xl mb-3 text-white text-2xl font-semibold">
                  2
                </button>
                <button onClick={() => handleKeypadPress('3')} className="w-[22%] h-12 rounded-xl mb-3 text-white text-2xl font-semibold">
                  3
                </button>

                <button
                  onClick={() => handleKeypadPress('75%')}
                  disabled={activeInput !== 'send'}
                  className={`w-[22%] h-12 bg-[#124D4B] rounded-xl mb-3 ${
                    activeInput === 'send' ? 'text-white' : 'text-gray-500'
                  } text-sm font-semibold`}
                >
                  75%
                </button>
                <button onClick={() => handleKeypadPress('4')} className="w-[22%] h-12 rounded-xl mb-3 text-white text-2xl font-semibold">
                  4
                </button>
                <button onClick={() => handleKeypadPress('5')} className="w-[22%] h-12 rounded-xl mb-3 text-white text-2xl font-semibold">
                  5
                </button>
                <button onClick={() => handleKeypadPress('6')} className="w-[22%] h-12 rounded-xl mb-3 text-white text-2xl font-semibold">
                  6
                </button>

                <button
                  onClick={() => handleKeypadPress('50%')}
                  disabled={activeInput !== 'send'}
                  className={`w-[22%] h-12 bg-[#124D4B] rounded-xl mb-3 ${
                    activeInput === 'send' ? 'text-white' : 'text-gray-500'
                  } text-sm font-semibold`}
                >
                  50%
                </button>
                <button onClick={() => handleKeypadPress('7')} className="w-[22%] h-12 rounded-xl mb-3 text-white text-2xl font-semibold">
                  7
                </button>
                <button onClick={() => handleKeypadPress('8')} className="w-[22%] h-12 rounded-xl mb-3 text-white text-2xl font-semibold">
                  8
                </button>
                <button onClick={() => handleKeypadPress('9')} className="w-[22%] h-12 rounded-xl mb-3 text-white text-2xl font-semibold">
                  9
                </button>

                <button onClick={() => handleKeypadPress('CLEAR')} className="w-[22%] h-12 bg-[#124D4B] rounded-xl mb-3 text-white text-sm font-semibold">
                  CLEAR
                </button>
                <button onClick={() => handleKeypadPress('.')} className="w-[22%] h-12 rounded-xl mb-3 text-white text-2xl font-semibold">
                  .
                </button>
                <button onClick={() => handleKeypadPress('0')} className="w-[22%] h-12 bg-[#124D4B] rounded-xl mb-3 text-white text-2xl font-semibold">
                  0
                </button>
                <button onClick={() => handleKeypadPress('⌫')} className="w-[22%] h-12 rounded-xl mb-3 text-white text-2xl font-semibold">
                  ⌫
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

