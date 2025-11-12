import { requireAuth, ensureTwoFa } from '@/lib/auth';
import { getPricesInUSD } from '@/lib/prices';
import { getPopularTokenSymbols } from '@/lib/popular-tokens';
import { logger } from '@/lib/logger';

/**
 * GET /api/price/current?coins=BTC,ETH,SOL&currency=USD
 * GET /api/price/current?currency=USD (returns all popular tokens in USD)
 * Returns current prices in USD with caching
 */
export async function GET(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  
  try {
    const { user, sess } = await requireAuth(request);
    ensureTwoFa(sess, user);
    
    const { searchParams } = new URL(request.url);
    const coinsParam = searchParams.get('coins');
    const currency = (searchParams.get('currency') || 'USD').toUpperCase(); // USD only
    
    let coinSymbols;
    
    // If no coins specified, return top 10 popular tokens
    if (!coinsParam) {
      coinSymbols = getPopularTokenSymbols();
      logger.info('No coins specified, returning all popular tokens', { 
        count: coinSymbols.length,
        currency,
        requestId 
      });
    } else {
      coinSymbols = coinsParam.split(',').map(c => c.trim()).filter(Boolean);
    }
    
    if (coinSymbols.length === 0) {
      return Response.json({
        success: false,
        error: {
          code: 'INVALID_COINS',
          message: 'At least one coin symbol required'
        }
      }, { status: 400 });
    }
    
    // Limit to 20 tokens per request
    if (coinSymbols.length > 20) {
      coinSymbols = coinSymbols.slice(0, 20);
      logger.warn('Too many coins requested, limiting to 20', { requestId });
    }
    
    logger.info('Fetching current prices', { 
      coins: coinSymbols, 
      count: coinSymbols.length,
      currency,
      userId: user.id, 
      requestId 
    });
    
    if (currency !== 'USD') {
      return Response.json({
        success: false,
        error: {
          code: 'UNSUPPORTED_CURRENCY',
          message: 'Prices are only available in USD.'
        }
      }, { status: 400 });
    }
    
    // Fetch prices in USD
    const priceData = await getPricesInUSD(coinSymbols);
    
    logger.info('Prices fetched', { 
      coins: coinSymbols, 
      count: Object.keys(priceData.prices).length,
      stale: priceData.stale,
      source: priceData.source || 'jupiter',
      requestId 
    });
    
    return Response.json({
      success: true,
      prices: priceData.prices,
      fetchedAt: priceData.fetchedAt,
      stale: priceData.stale || false,
      source: priceData.source || 'jupiter',
      currency: 'USD',
      count: Object.keys(priceData.prices).length
    }, { status: 200 });
    
  } catch (error) {
    logger.error('Price fetch failed', { 
      error: error.message,
      errorName: error.name,
      requestId 
    });
    
    if (error.message.includes('Unsupported token') || error.message.includes('not found')) {
      return Response.json({
        success: false,
        error: {
          code: 'INVALID_COIN',
          message: error.message
        }
      }, { status: 422 });
    }
    
    return Response.json({
      success: false,
      error: {
        code: 'PRICE_FETCH_ERROR',
        message: error.message || 'Failed to fetch prices'
      }
    }, { status: 500 });
  }
}
