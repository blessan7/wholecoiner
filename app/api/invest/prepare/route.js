/**
 * POST /api/invest/prepare
 * Prepare investment: simulate onramp + get quote
 * Returns simplified response for user-facing flow
 */

import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { nanoid } from 'nanoid';
import { getSwapQuote, getSwapTransaction } from '@/lib/jupiter';
import { getSolanaConnection, checkATAExists, createATAWithAppWallet, isToken2022 } from '@/lib/solana';
import { PublicKey } from '@solana/web3.js';
import { TOKEN_MINTS, getTokenMint, toSmallestUnits, fromSmallestUnits, getNetwork } from '@/lib/tokens';
import { SwapErrors, AuthenticationError, ValidationError } from '@/lib/errors';
import { ensureIdempotency } from '@/lib/idempotency';
import { checkRateLimit } from '@/lib/rateLimit';

const MIN_AMOUNT_USDC = 0.00001;
const SLIPPAGE_BPS = 50; // 0.5% slippage
const SOL_FEE_BUFFER = 0.01;
const APPROXIMATE_SOL_PRICE_USD = 100;

export async function POST(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;
  
  try {
    logger.info('[INVEST] Preparing investment', { requestId });
    
    // Authentication
    const { user: authUser } = await requireAuth(request);
    user = authUser;
    
    // Rate limiting
    if (!checkRateLimit(user.id, 5)) {
      throw SwapErrors.NETWORK_ERROR();
    }
    
    // Parse request
    const body = await request.json();
    const { goalId, amountUsd } = body;
    
    if (!goalId) {
      throw new ValidationError('goalId is required');
    }
    
    if (!amountUsd || typeof amountUsd !== 'number' || amountUsd < MIN_AMOUNT_USDC) {
      throw new ValidationError(`amountUsd must be at least ${MIN_AMOUNT_USDC} USDC`);
    }
    
    // Validate goal
    const goal = await prisma.goal.findFirst({
      where: {
        id: goalId,
        userId: user.id,
      },
      include: { user: true },
    });
    
    if (!goal) {
      throw SwapErrors.INVALID_WALLET();
    }
    
    if (goal.status !== 'ACTIVE') {
      throw new ValidationError('Goal must be ACTIVE to invest');
    }
    
    if (!goal.user.walletAddress) {
      throw SwapErrors.INVALID_WALLET();
    }
    
    // Generate batchId
    const batchId = nanoid();
    
    // Step 1: Simulate onramp (create DB record)
    const connection = getSolanaConnection();
    const userPublicKey = new PublicKey(goal.user.walletAddress);
    
    // Check SOL balance
    const solBalance = await connection.getBalance(userPublicKey);
    const solBalanceInSol = solBalance / 1e9;
    const estimatedSolNeeded = (amountUsd / APPROXIMATE_SOL_PRICE_USD) + SOL_FEE_BUFFER;
    
    if (solBalanceInSol < estimatedSolNeeded) {
      throw new ValidationError(
        `Insufficient SOL balance. You have ${solBalanceInSol.toFixed(4)} SOL but need approximately ${estimatedSolNeeded.toFixed(4)} SOL. Please add more SOL to your wallet.`
      );
    }
    
    // Create onramp transaction
    const network = getNetwork();
    const usdcMintInfo = TOKEN_MINTS.USDC;
    const simulatedSignature = `sim_${crypto.randomUUID().replace(/-/g, '')}`;
    
    const onrampTransaction = await ensureIdempotency(batchId, 'ONRAMP', async () => {
      return await prisma.$transaction(async (tx) => {
        return await tx.transaction.create({
          data: {
            goalId: goal.id,
            batchId,
            type: 'ONRAMP',
            provider: 'FAUCET',
            network: network === 'devnet' ? 'DEVNET' : 'MAINNET',
            txnHash: simulatedSignature,
            amountUsd: amountUsd,
            amountCrypto: amountUsd,
            tokenMint: usdcMintInfo.mint,
            meta: {
              state: 'ONRAMP_CONFIRMED',
              simulation: true,
              simulated: true,
              solValidated: true,
              userWalletAddress: goal.user.walletAddress,
            },
          },
        });
      });
    });
    
    // Step 2: Get quote
    const inputTokenInfo = getTokenMint('USDC', 'mainnet');
    const outputTokenInfo = getTokenMint(goal.coin, 'mainnet');
    const swapAmountInSmallestUnits = toSmallestUnits(amountUsd, inputTokenInfo.decimals);
    
    // Check and create ATA for output token
    const isToken2022Mint = await isToken2022(outputTokenInfo.mint);
    const { exists: ataExists } = await checkATAExists(
      outputTokenInfo.mint,
      goal.user.walletAddress,
      isToken2022Mint
    );
    
    if (!ataExists) {
      await createATAWithAppWallet(
        outputTokenInfo.mint,
        goal.user.walletAddress,
        isToken2022Mint
      );
    }
    
    // Get Jupiter quote
    const quote = await getSwapQuote(
      inputTokenInfo.mint,
      outputTokenInfo.mint,
      swapAmountInSmallestUnits.toString(),
      SLIPPAGE_BPS
    );
    
    // Get swap transaction
    const swapData = await getSwapTransaction(
      quote,
      goal.user.walletAddress,
      SLIPPAGE_BPS
    );
    
    // Calculate output amount
    const outputAmount = fromSmallestUnits(quote.outAmount, outputTokenInfo.decimals);
    
    // Estimate fee (rough estimate: 0.0005 SOL ≈ $0.05 at $100/SOL)
    const estimatedFeeUsd = 0.05;
    
    logger.info('[INVEST] Investment prepared', {
      batchId,
      amountUsd,
      outputAmount,
      requestId
    });
    
    return Response.json({
      success: true,
      quote: {
        estimatedBtc: outputAmount, // Note: This is actually the goal coin amount, not necessarily BTC
        estimatedFeeUsd,
        quoteResponse: quote,
        swapTransaction: swapData.swapTransaction,
        lastValidBlockHeight: swapData.lastValidBlockHeight,
      },
      batchId,
    }, { status: 200 });
    
  } catch (error) {
    logger.error('[INVEST] Failed to prepare investment', {
      error: error.message,
      errorName: error.name,
      userId: user?.id,
      requestId
    });
    
    if (error instanceof AuthenticationError) {
      return Response.json({
        success: false,
        error: {
          code: error.code || 'AUTH_ERROR',
          message: error.message
        }
      }, { status: error.statusCode || 401 });
    }
    
    if (error.statusCode) {
      return Response.json({
        success: false,
        error: {
          code: error.code,
          message: error.message
        }
      }, { status: error.statusCode });
    }
    
    return Response.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to prepare investment'
      }
    }, { status: 500 });
  }
}

