/**
 * POST /api/wallet/create-ata
 * Create an associated token account for a user (app wallet pays)
 */

import { requireAuth } from '@/lib/auth';
import { createATAWithAppWallet, checkATAExists, isToken2022 } from '@/lib/solana';
import { logger } from '@/lib/logger';
import { AuthenticationError, AuthorizationError, ValidationError } from '@/lib/errors';
import { getNetwork } from '@/lib/tokens';

export async function POST(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  let user = null;
  
  try {
    logger.info('[WALLET] Creating ATA', { requestId });
    
    // Authentication
    const { user: authUser } = await requireAuth(request);
    user = authUser;
    
    if (!user.walletAddress) {
      logger.error('[WALLET] User has no wallet address', { userId: user.id, requestId });
      throw new ValidationError('No wallet address associated with this account');
    }
    
    // Parse request body
    const body = await request.json();
    const { mintAddress } = body;
    
    if (!mintAddress) {
      throw new ValidationError('mintAddress is required');
    }
    
    logger.info('[WALLET] Creating ATA for mint', { 
      userId: user.id,
      walletAddress: user.walletAddress,
      mintAddress,
      requestId 
    });
    
    // Detect token program
    const isToken2022Mint = await isToken2022(mintAddress);
    
    logger.debug('[WALLET] Token program detected', {
      mintAddress,
      isToken2022: isToken2022Mint,
      requestId
    });
    
    // Check if ATA already exists
    const { exists, address: ataAddress } = await checkATAExists(
      mintAddress,
      user.walletAddress,
      isToken2022Mint
    );
    
    if (exists) {
      logger.info('[WALLET] ATA already exists', {
        ataAddress: ataAddress.toBase58(),
        requestId
      });
      
      return Response.json({
        success: true,
        ataAddress: ataAddress.toBase58(),
        alreadyExists: true,
        explorerUrl: `https://explorer.solana.com/address/${ataAddress.toBase58()}?cluster=${getNetwork() === 'devnet' ? 'devnet' : 'mainnet-beta'}`,
      }, { status: 200 });
    }
    
    // Create ATA using app wallet as payer
    const { signature, ataAddress: createdAta } = await createATAWithAppWallet(
      mintAddress,
      user.walletAddress,
      isToken2022Mint
    );
    
    logger.info('[WALLET] ATA created successfully', {
      signature,
      ataAddress: createdAta.toBase58(),
      requestId
    });
    
    return Response.json({
      success: true,
      ataAddress: createdAta.toBase58(),
      signature,
      alreadyExists: false,
      explorerUrl: `https://explorer.solana.com/tx/${signature}?cluster=${getNetwork() === 'devnet' ? 'devnet' : 'mainnet-beta'}`,
    }, { status: 201 });
    
  } catch (error) {
    logger.error('[WALLET] Failed to create ATA', { 
      error: error.message,
      errorName: error.name,
      userId: user?.id,
      requestId 
    });
    
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
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
        message: 'Failed to create associated token account'
      }
    }, { status: 500 });
  }
}

