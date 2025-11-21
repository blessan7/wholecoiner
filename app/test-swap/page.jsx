'use client';

import { useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { Connection, PublicKey } from '@solana/web3.js';
import { useSolanaWallet, signSolanaTransaction } from '@/lib/solana-wallet';
import { TOKEN_MINTS } from '@/lib/tokens';

const SOL_MINT = TOKEN_MINTS.SOL.mint;
const USDC_MINT = TOKEN_MINTS.USDC.mint;
const BTC_MINT = TOKEN_MINTS.BTC.mint; // cbBTC mint

// Jupiter Lite API endpoints
const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/swap/v1/quote';
const JUPITER_SWAP_API = 'https://lite-api.jup.ag/swap/v1/swap';

// Default RPC URL (can be overridden by env)
const DEFAULT_RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 
  'https://mainnet.helius-rpc.com/?api-key=c61b3693-90f8-46e7-b236-03871dbcdc1e';

export default function TestSwapPage() {
  const { login, authenticated, user } = usePrivy();
  const { wallets, ready } = useWallets();
  const solanaWallet = useSolanaWallet();

  const [status, setStatus] = useState('');
  const [isSwapping, setIsSwapping] = useState(false);
  const [txSignature, setTxSignature] = useState(null);
  const [outputAmount, setOutputAmount] = useState(null);
  const [swapType, setSwapType] = useState('SOL_BTC');

  // Amount to swap
  const SOL_AMOUNT = 0.01; // 0.01 SOL
  const USDC_AMOUNT = 1.1; // 1.0 USDC

  const handleSwapClick = async () => {
    try {
      setStatus('');
      setIsSwapping(true);
      setTxSignature(null);
      setOutputAmount(null);

      // 1. Ensure Privy is ready
      if (!ready) {
        setStatus('Wallets not ready yet...');
        setIsSwapping(false);
        return;
      }

      // 2. Ensure user is logged in
      if (!authenticated) {
        setStatus('Opening login...');
        await login();
        setIsSwapping(false);
        return;
      }

      // 3. Get the first Solana wallet from Privy
      const wallet = wallets[0];
      if (!wallet || !solanaWallet) {
        setStatus('No Solana wallet connected.');
        setIsSwapping(false);
        return;
      }

      // 4. Determine swap parameters based on swap type
      let inputMint;
      let outputMint;
      let amount;
      let inputDecimals;
      let outputDecimals;
      let inputSymbol;
      let outputSymbol;

      if (swapType === 'USDC_SOL') {
        inputMint = USDC_MINT;
        outputMint = SOL_MINT;
        amount = USDC_AMOUNT;
        inputDecimals = TOKEN_MINTS.USDC.decimals; // 6
        outputDecimals = TOKEN_MINTS.SOL.decimals; // 9
        inputSymbol = 'USDC';
        outputSymbol = 'SOL';
      } else {
        // SOL_BTC (default)
        inputMint = SOL_MINT;
        outputMint = BTC_MINT;
        amount = SOL_AMOUNT;
        inputDecimals = TOKEN_MINTS.SOL.decimals; // 9
        outputDecimals = TOKEN_MINTS.BTC.decimals; // 8
        inputSymbol = 'SOL';
        outputSymbol = 'BTC';
      }

      // Build Jupiter Lite API quote request
      setStatus(`Fetching quote from Jupiter (${inputSymbol} → ${outputSymbol})...`);

      const amountInSmallestUnits = Math.floor(amount * Math.pow(10, inputDecimals)).toString();

      const quoteUrl = new URL(JUPITER_QUOTE_API);
      quoteUrl.searchParams.set('inputMint', inputMint);
      quoteUrl.searchParams.set('outputMint', outputMint);
      quoteUrl.searchParams.set('amount', amountInSmallestUnits);
      quoteUrl.searchParams.set('slippageBps', '50'); // 0.50% slippage

      const quoteRes = await fetch(quoteUrl.toString());
      if (!quoteRes.ok) {
        const errorText = await quoteRes.text();
        throw new Error(`Quote request failed: ${quoteRes.status} - ${errorText}`);
      }
      
      const quoteResponse = await quoteRes.json();

      if (quoteResponse.error || quoteResponse.errorCode || !quoteResponse.outAmount) {
        console.error('Quote error:', quoteResponse);
        throw new Error(
          quoteResponse.errorMessage || 
          quoteResponse.error ||
          `Jupiter could not find a route for ${inputSymbol} → ${outputSymbol} swap.`
        );
      }

      // Calculate output amount for display
      const outputAmountValue = Number(quoteResponse.outAmount) / Math.pow(10, outputDecimals);
      setOutputAmount(outputAmountValue);
      setStatus(`Quote received: ${outputAmountValue.toFixed(outputDecimals === 9 ? 6 : 8)} ${outputSymbol}`);

      // 5. Build Jupiter Lite API swap request
      setStatus('Building swap transaction...');

      const swapRequest = {
        quoteResponse,
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

      const { swapTransaction, lastValidBlockHeight } = swapJson;

      // 6. Sign transaction using existing signSolanaTransaction function
      setStatus('Signing transaction...');

      const signedTx = await signSolanaTransaction(solanaWallet, swapTransaction);

      // 7. Send transaction to Solana RPC
      setStatus('Sending transaction to Solana...');

      const connection = new Connection(DEFAULT_RPC_URL, 'confirmed');
      // Convert base64 to Uint8Array (browser-compatible)
      const txBytes = Uint8Array.from(atob(signedTx), (c) => c.charCodeAt(0));
      
      const signature = await connection.sendRawTransaction(txBytes, {
        skipPreflight: false,
        maxRetries: 3,
      });

      setStatus('Waiting for confirmation...');

      // 8. Confirm transaction
      const latestBlockhash = await connection.getLatestBlockhash('confirmed');
      
      const confirmation = await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: lastValidBlockHeight || latestBlockhash.lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmation.value.err) {
        console.error('Confirmation error:', confirmation.value.err);
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      setTxSignature(signature);
      setStatus(`✅ Swap complete!`);
    } catch (err) {
      console.error('Swap error:', err);
      setStatus(`❌ Error: ${err.message || 'Something went wrong'}`);
    } finally {
      setIsSwapping(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg-main)] p-4">
      <div className="w-full max-w-md rounded-2xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] p-6 shadow-lg">
        <h1 className="text-xl font-semibold mb-2 text-[var(--text-primary)]">
          Swap Test Page
        </h1>

        {/* Swap Type Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-[var(--text-primary)] mb-2">
            Swap Type:
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setSwapType('SOL_BTC')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${
                swapType === 'SOL_BTC'
                  ? 'bg-[var(--accent)] text-[var(--bg-main)]'
                  : 'bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              SOL → BTC
            </button>
            <button
              onClick={() => setSwapType('USDC_SOL')}
              className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${
                swapType === 'USDC_SOL'
                  ? 'bg-[var(--accent)] text-[var(--bg-main)]'
                  : 'bg-[var(--bg-main)] border border-[var(--border-subtle)] text-[var(--text-secondary)]'
              }`}
            >
              USDC → SOL
            </button>
          </div>
        </div>

        <p className="text-sm text-[var(--text-secondary)] mb-4">
          {swapType === 'USDC_SOL' ? (
            <>This swaps <span className="font-mono font-semibold">{USDC_AMOUNT} USDC</span> into SOL using Jupiter Lite API. No swap UI is shown – it all happens after clicking the button.</>
          ) : (
            <>This swaps <span className="font-mono font-semibold">{SOL_AMOUNT} SOL</span> into Wrapped BTC (cbBTC) on Solana using Jupiter Lite API. No swap UI is shown – it all happens after clicking the button.</>
          )}
        </p>

        <div className="mb-4 text-sm space-y-2">
          <div>
            <span className="font-semibold text-[var(--text-primary)]">Logged in: </span>
            <span className={authenticated ? 'text-green-400' : 'text-red-400'}>
              {authenticated ? 'Yes' : 'No'}
            </span>
          </div>
          <div>
            <span className="font-semibold text-[var(--text-primary)]">Wallet address: </span>
            <span className="font-mono text-xs break-all text-[var(--text-secondary)]">
              {wallets[0]?.address || '–'}
            </span>
          </div>
          <div>
            <span className="font-semibold text-[var(--text-primary)]">Wallets ready: </span>
            <span className={ready ? 'text-green-400' : 'text-yellow-400'}>
              {ready ? 'Yes' : 'No'}
            </span>
          </div>
        </div>

        <button
          onClick={handleSwapClick}
          disabled={isSwapping || !ready}
          className={`w-full py-3 rounded-lg font-semibold text-sm transition
            ${
              isSwapping || !ready
                ? 'bg-[var(--border-subtle)] text-[var(--text-secondary)] cursor-not-allowed'
                : 'bg-[var(--accent)] hover:opacity-90 text-[var(--bg-main)]'
            }`}
        >
          {isSwapping 
            ? 'Swapping...' 
            : swapType === 'USDC_SOL' 
              ? `Swap ${USDC_AMOUNT} USDC → SOL`
              : `Swap ${SOL_AMOUNT} SOL → BTC`
          }
        </button>

        {outputAmount && (
          <div className="mt-4 p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-subtle)]">
            <p className="text-sm text-[var(--text-primary)]">
              <span className="font-semibold">Expected output: </span>
              <span className="font-mono">
                {outputAmount.toFixed(swapType === 'USDC_SOL' ? 6 : 8)} {swapType === 'USDC_SOL' ? 'SOL' : 'BTC'}
              </span>
            </p>
          </div>
        )}

        {status && (
          <div className="mt-4 p-3 rounded-lg bg-[var(--bg-main)] border border-[var(--border-subtle)]">
            <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
              {status}
            </p>
          </div>
        )}

        {txSignature && (
          <div className="mt-4 p-3 rounded-lg bg-green-900/20 border border-green-800/40">
            <p className="text-sm text-green-200 font-semibold mb-1">Transaction Signature:</p>
            <a
              href={`https://explorer.solana.com/tx/${txSignature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-mono break-all text-green-300 hover:underline"
            >
              {txSignature}
            </a>
            <p className="text-xs text-green-200/70 mt-2">
              Click to view on Solana Explorer
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

