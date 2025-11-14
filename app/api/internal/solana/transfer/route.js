import crypto from 'node:crypto';
import { requireAuth, ensureAdmin } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getSolanaConnection, isValidSolanaAddress } from '@/lib/solana';
import { ValidationError, formatErrorResponse } from '@/lib/errors';
import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';

function isBlockhashExpiredError(error) {
  const name = error?.name?.toLowerCase() || '';
  const message = error?.message?.toLowerCase() || '';

  if (name.includes('transactionexpiredblockheightexceedederror')) {
    return true;
  }

  return (
    message.includes('blockhash not found') ||
    (message.includes('blockhash') && message.includes('expired')) ||
    message.includes('block height exceeded')
  );
}

async function buildUnsignedTransfer({ connection, sourceAddress, destinationAddress, lamports }) {
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  const transferIx = SystemProgram.transfer({
    fromPubkey: new PublicKey(sourceAddress),
    toPubkey: new PublicKey(destinationAddress),
    lamports,
  });

  const messageV0 = new TransactionMessage({
    instructions: [transferIx],
    payerKey: new PublicKey(sourceAddress),
    recentBlockhash: blockhash,
  }).compileToV0Message();

  const transaction = new VersionedTransaction(messageV0);
  const unsignedTransaction = Buffer.from(transaction.serialize()).toString('base64');

  let feeEstimateLamports = null;
  try {
    const feeResult = await connection.getFeeForMessage(messageV0, 'confirmed');
    feeEstimateLamports = feeResult.value ?? null;
  } catch {
    feeEstimateLamports = null;
  }

  return {
    unsignedTransaction,
    recentBlockhash: blockhash,
    lastValidBlockHeight,
    feeEstimateLamports,
  };
}

function formatTransferResponse({
  sourceAddress,
  destinationAddress,
  lamports,
  memo,
  unsignedTransaction,
  feeEstimateLamports,
  lastValidBlockHeight,
  recentBlockhash,
}) {
  const lamportsNumber = typeof lamports === 'bigint' ? Number(lamports) : lamports;
  const amountSol = lamportsNumber / LAMPORTS_PER_SOL;

  return {
    fromAddress: sourceAddress,
    toAddress: destinationAddress,
    lamports: lamportsNumber,
    amountSol,
    memo: memo || null,
    unsignedTransaction,
    feeEstimateLamports,
    lastValidBlockHeight,
    recentBlockhash,
  };
}

export async function POST(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let adminUser = null;

  try {
    const { user } = await requireAuth(request);
    ensureAdmin(user);
    adminUser = user;

    const body = await request.json();
    const mode = (body.mode || (body.signedTransaction ? 'submit' : 'prepare')).toLowerCase();
    const batchId = body.batchId || crypto.randomUUID();

    if (!['prepare', 'submit'].includes(mode)) {
      throw new ValidationError('mode must be either "prepare" or "submit"');
    }

    if (!batchId) {
      throw new ValidationError('batchId is required');
    }

    if (mode === 'prepare') {
      return await handlePrepareMode({ body, batchId, requestId, adminUser });
    }

    return await handleSubmitMode({ body, batchId, requestId, adminUser });
  } catch (error) {
    logger.error('Internal transfer API failed', {
      error: error.message,
      stack: error.stack,
      requestId,
      adminUserId: adminUser?.id,
    });

    const statusCode = error.statusCode || 500;
    return Response.json(
      { success: false, ...formatErrorResponse(error, requestId) },
      { status: statusCode }
    );
  }
}

async function handlePrepareMode({ body, batchId, requestId, adminUser }) {
  const { fromUserId, fromAddress, toAddress, amountSol, memo } = body;

  if (!fromUserId && !fromAddress) {
    throw new ValidationError('fromUserId or fromAddress is required');
  }

  if (!toAddress || !isValidSolanaAddress(toAddress)) {
    throw new ValidationError('Valid toAddress is required');
  }

  const solAmount = Number.parseFloat(amountSol);
  if (!Number.isFinite(solAmount) || solAmount <= 0) {
    throw new ValidationError('amountSol must be a positive number');
  }

  const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);
  if (!Number.isSafeInteger(lamports) || lamports <= 0) {
    throw new ValidationError('amountSol converts to an invalid lamport value');
  }

  const connection = getSolanaConnection();

  const { sourceUser, sourceAddress } = await resolveSourceWallet({
    fromUserId,
    fromAddress,
  });

  const unsignedTransfer = await buildUnsignedTransfer({
    connection,
    sourceAddress,
    destinationAddress: toAddress,
    lamports,
  });

  await upsertTransferRecord({
    batchId,
    adminUserId: adminUser.id,
    sourceUserId: sourceUser?.id ?? null,
    sourceAddress,
    destinationAddress: toAddress,
    lamports,
    memo,
    state: 'PREPARED',
    metadata: {
      feeEstimateLamports: unsignedTransfer.feeEstimateLamports,
      lastValidBlockHeight: unsignedTransfer.lastValidBlockHeight,
      recentBlockhash: unsignedTransfer.recentBlockhash,
      preparedAt: new Date().toISOString(),
    },
  });

  logger.info('Prepared internal SOL transfer', {
    batchId,
    requestId,
    adminUserId: adminUser.id,
    sourceUserId: sourceUser?.id,
    sourceAddress,
    destinationAddress: toAddress,
    lamports,
  });

  const transferPayload = formatTransferResponse({
    sourceAddress,
    destinationAddress: toAddress,
    lamports,
    memo,
    ...unsignedTransfer,
  });

  return Response.json(
    {
      success: true,
      mode: 'prepare',
      batchId,
      transfer: transferPayload,
    },
    { status: 200 }
  );
}

async function handleSubmitMode({ body, batchId, requestId, adminUser }) {
  const { signedTransaction, expectedFromAddress } = body;

  if (!signedTransaction || typeof signedTransaction !== 'string') {
    throw new ValidationError('signedTransaction must be a base64-encoded string');
  }

  if (!/^[A-Za-z0-9+/=]+$/.test(signedTransaction)) {
    throw new ValidationError('signedTransaction must be valid base64');
  }

  const txBuffer = Buffer.from(signedTransaction, 'base64');

  let transaction;
  try {
    transaction = VersionedTransaction.deserialize(txBuffer);
  } catch (error) {
    throw new ValidationError(`Failed to deserialize signed transaction: ${error.message}`);
  }

  const message = transaction.message;
  const feePayer = message.staticAccountKeys[0]?.toBase58();

  if (!feePayer) {
    throw new ValidationError('Unable to determine fee payer from transaction');
  }

  if (expectedFromAddress && expectedFromAddress !== feePayer) {
    throw new ValidationError('Signed transaction fee payer does not match expected from address');
  }

  const connection = getSolanaConnection();

  try {
    const { signature, lastValidBlockHeight, recentBlockhash } = await submitTransaction({
      connection,
      txBuffer,
    });

    await markTransferSubmitted({
      batchId,
      signature,
      adminUserId: adminUser.id,
      requestId,
    });

    logger.info('Internal SOL transfer submitted', {
      batchId,
      signature,
      requestId,
      feePayer,
      adminUserId: adminUser.id,
    });

    return Response.json(
      {
        success: true,
        mode: 'submit',
        batchId,
        signature,
        explorerUrl: `https://explorer.solana.com/tx/${signature}`,
        recentBlockhash,
        lastValidBlockHeight,
      },
      { status: 201 }
    );
  } catch (error) {
    if (isBlockhashExpiredError(error)) {
      const refreshedTransfer = await refreshExpiredTransfer({
        batchId,
        adminUserId: adminUser.id,
        requestId,
      });

      return Response.json(
        {
          success: false,
          retryable: true,
          batchId,
          error: {
            code: 'BLOCKHASH_EXPIRED',
            message:
              'Transaction blockhash expired before submission. A refreshed payload is ready to sign.',
          },
          transfer: refreshedTransfer,
        },
        { status: 409 }
      );
    }

    await markTransferFailed({
      batchId,
      error: error?.message || 'Unknown error',
    });
    throw error;
  }
}

async function resolveSourceWallet({ fromUserId, fromAddress }) {
  let sourceUser = null;
  let resolvedAddress = fromAddress?.trim();

  if (fromUserId) {
    sourceUser = await prisma.user.findUnique({
      where: { id: fromUserId },
      select: { id: true, walletAddress: true, email: true },
    });

    if (!sourceUser) {
      throw new ValidationError('Source user not found');
    }

    if (!sourceUser.walletAddress) {
      throw new ValidationError('Source user does not have a linked wallet address');
    }

    if (resolvedAddress && resolvedAddress !== sourceUser.walletAddress) {
      throw new ValidationError('fromAddress does not match the wallet on record for the user');
    }

    resolvedAddress = sourceUser.walletAddress;
  }

  if (!resolvedAddress) {
    throw new ValidationError('Source wallet address could not be determined');
  }

  if (!isValidSolanaAddress(resolvedAddress)) {
    throw new ValidationError('Source wallet address is not a valid Solana address');
  }

  return { sourceUser, sourceAddress: resolvedAddress };
}

async function upsertTransferRecord({
  batchId,
  adminUserId,
  sourceUserId,
  sourceAddress,
  destinationAddress,
  lamports,
  memo,
  state,
  metadata,
}) {
  const lamportsBigInt = BigInt(lamports);
  const existing = await prisma.internalTransfer.findUnique({
    where: { batchId },
  });

  if (existing) {
    return prisma.internalTransfer.update({
      where: { batchId },
      data: {
        adminUserId,
        sourceUserId,
        sourceAddress,
        destinationAddress,
        lamports: lamportsBigInt,
        memo: memo || null,
        state,
        metadata: {
          ...(existing.metadata || {}),
          ...(metadata || {}),
        },
      },
    });
  }

  return prisma.internalTransfer.create({
    data: {
      batchId,
      adminUserId,
      sourceUserId,
      sourceAddress,
      destinationAddress,
      lamports: lamportsBigInt,
      memo: memo || null,
      state,
      metadata,
    },
  });
}

async function refreshExpiredTransfer({ batchId, adminUserId, requestId }) {
  const existing = await prisma.internalTransfer.findUnique({
    where: { batchId },
  });

  if (!existing) {
    throw new ValidationError('Internal transfer not found for refresh');
  }

  const lamportsValue =
    typeof existing.lamports === 'bigint'
      ? Number(existing.lamports)
      : existing.lamports || 0;

  if (lamportsValue <= 0) {
    throw new ValidationError('Stored transfer amount is invalid for refresh');
  }

  const connection = getSolanaConnection();

  const unsignedTransfer = await buildUnsignedTransfer({
    connection,
    sourceAddress: existing.sourceAddress,
    destinationAddress: existing.destinationAddress,
    lamports: lamportsValue,
  });

  const previousMetadata =
    existing.metadata && typeof existing.metadata === 'object'
      ? { ...existing.metadata }
      : {};

  const refreshCount = (previousMetadata.refreshCount || 0) + 1;

  const updatedMetadata = {
    ...previousMetadata,
    feeEstimateLamports: unsignedTransfer.feeEstimateLamports,
    lastValidBlockHeight: unsignedTransfer.lastValidBlockHeight,
    recentBlockhash: unsignedTransfer.recentBlockhash,
    refreshCount,
    lastRefreshReason: 'BLOCKHASH_EXPIRED',
    refreshedAt: new Date().toISOString(),
  };

  await prisma.internalTransfer.update({
    where: { batchId },
    data: {
      state: 'PREPARED',
      signature: null,
      metadata: updatedMetadata,
    },
  });

  logger.warn('Internal SOL transfer blockhash expired. Refreshed transaction payload.', {
    batchId,
    adminUserId,
    requestId,
    refreshCount,
  });

  return formatTransferResponse({
    sourceAddress: existing.sourceAddress,
    destinationAddress: existing.destinationAddress,
    lamports: lamportsValue,
    memo: existing.memo,
    ...unsignedTransfer,
  });
}

async function markTransferSubmitted({ batchId, signature, adminUserId, requestId }) {
  try {
    const existing = await prisma.internalTransfer.findUnique({
      where: { batchId },
      select: { metadata: true },
    });

    await prisma.internalTransfer.update({
      where: { batchId },
      data: {
        state: 'SUBMITTED',
        signature,
        metadata: {
          ...(existing?.metadata || {}),
          submittedAt: new Date().toISOString(),
          adminUserId,
          requestId,
        },
      },
    });
  } catch (error) {
    logger.warn('Unable to mark transfer as submitted', {
      batchId,
      error: error.message,
    });
  }
}

async function markTransferFailed({ batchId, error }) {
  try {
    const existing = await prisma.internalTransfer.findUnique({
      where: { batchId },
      select: { metadata: true },
    });

    await prisma.internalTransfer.update({
      where: { batchId },
      data: {
        state: 'FAILED',
        metadata: {
          ...(existing?.metadata || {}),
          failureAt: new Date().toISOString(),
          error,
        },
      },
    });
  } catch (updateError) {
    logger.warn('Unable to mark transfer as failed', {
      batchId,
      error: updateError.message,
    });
  }
}

async function submitTransaction({ connection, txBuffer }) {
  const signature = await connection.sendRawTransaction(txBuffer, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
    maxRetries: 3,
  });

  const { blockhash: recentBlockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

  return { signature, lastValidBlockHeight, recentBlockhash };
}

