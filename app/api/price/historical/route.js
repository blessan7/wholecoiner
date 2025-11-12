import { requireAuth, ensureTwoFa } from '@/lib/auth';
import { isValidCoin, getPriceUSD, getTokenInfo } from '@/lib/prices';
import { logger } from '@/lib/logger';

/**
 * GET /api/price/historical?coin=BTC&range=30d
 * Returns mock historical prices (30 daily candles)
 */
export async function GET(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  
  try {
    const { user, sess } = await requireAuth(request);
    ensureTwoFa(sess, user);
    
    const { searchParams } = new URL(request.url);
    const coin = searchParams.get('coin');
    const range = searchParams.get('range') || '30d';
    
    if (!coin) {
      return Response.json({
        success: false,
        error: {
          code: 'MISSING_COIN',
          message: 'Query parameter "coin" is required'
        }
      }, { status: 400 });
    }
    
    const normalized = coin.toUpperCase();
    if (!isValidCoin(normalized)) {
      return Response.json({
        success: false,
        error: {
          code: 'INVALID_COIN',
          message: `Unknown token: ${coin}. Supported tokens: BTC, ETH, SOL, USDC, USDT, JUP, RAY, BONK, WIF, PYTH`
        }
      }, { status: 422 });
    }
    
    // Only support 30d for now
    if (range !== '30d') {
      return Response.json({
        success: false,
        error: {
          code: 'INVALID_RANGE',
          message: 'Only "30d" range supported currently'
        }
      }, { status: 400 });
    }
    
    logger.info('Fetching historical prices', { coin: normalized, range, userId: user.id, requestId });
    
    // Generate mock 30-day series
    const tokenInfo = getTokenInfo(normalized);
    if (!tokenInfo) {
      return Response.json({
        success: false,
        error: {
          code: 'INVALID_COIN',
          message: `Unknown token: ${coin}. Supported tokens: BTC, ETH, SOL, USDC, USDT, JUP, RAY, BONK, WIF, PYTH`
        }
      }, { status: 422 });
    }
    const currentPrice = await getPriceUSD(tokenInfo.mint);
    const series = [];
    const now = new Date();
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // Add random variance ±5%
      const variance = 0.95 + Math.random() * 0.1;
      const price = Math.round(currentPrice * variance * 100) / 100;
      
      series.push({
        date: date.toISOString().split('T')[0], // YYYY-MM-DD
        priceUsd: price
      });
    }
    
    logger.info('Historical prices generated', { coin: normalized, points: series.length, requestId });
    
    return Response.json({
      success: true,
      coin: normalized,
      range,
      series,
      source: 'mock' // Flag for frontend to know this is simulated
    }, { status: 200 });
    
  } catch (error) {
    logger.error('Historical price fetch failed', { error: error.message, requestId });
    
    return Response.json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch historical prices'
      }
    }, { status: 500 });
  }
}
