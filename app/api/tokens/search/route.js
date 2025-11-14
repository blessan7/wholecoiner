/**
 * GET /api/tokens/search
 * Search for tokens (from popular tokens list and Jupiter)
 */

import { logger } from '@/lib/logger';
import { POPULAR_TOKENS } from '@/lib/popular-tokens';

export async function GET(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    
    logger.info('Token search request', { query, limit, requestId });
    
    // Convert popular tokens to search format
    const popularTokensList = Object.values(POPULAR_TOKENS).map(token => ({
      id: token.mint,
      symbol: token.symbol,
      name: token.name,
      decimals: token.decimals,
      icon: getTokenIcon(token.mint),
      logoURI: getTokenIcon(token.mint),
      isVerified: true,
      source: 'backend',
    }));
    
    // Filter backend tokens based on query
    let filteredBackendTokens = popularTokensList;
    
    if (query && query.trim().length > 0) {
      const searchTerm = query.toLowerCase().trim();
      
      // First, try exact symbol match (case-insensitive) - highest priority
      const exactSymbolMatch = popularTokensList.filter(token => 
        token.symbol.toLowerCase() === searchTerm
      );
      
      if (exactSymbolMatch.length > 0) {
        // If we have exact symbol matches, use only those
        filteredBackendTokens = exactSymbolMatch;
      } else {
        // Otherwise, do partial matching (prioritize symbol over name)
        const symbolMatches = popularTokensList.filter(token => 
          token.symbol.toLowerCase().includes(searchTerm)
        );
        
        const nameMatches = popularTokensList.filter(token => 
          token.name.toLowerCase().includes(searchTerm) &&
          !token.symbol.toLowerCase().includes(searchTerm) // Avoid duplicates
        );
        
        const addressMatches = popularTokensList.filter(token => 
          token.id.toLowerCase().includes(searchTerm) &&
          !token.symbol.toLowerCase().includes(searchTerm) &&
          !token.name.toLowerCase().includes(searchTerm) // Avoid duplicates
        );
        
        // Prioritize: symbol matches first, then name, then address
        filteredBackendTokens = [...symbolMatches, ...nameMatches, ...addressMatches];
      }
    }
    
    // If query is long enough, also search Jupiter
    let jupiterTokens = [];
    if (query && query.trim().length >= 2) {
      try {
        logger.info('Searching Jupiter API', { query, requestId });
        
        const jupiterUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`;
        const jupiterResponse = await fetch(jupiterUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        if (jupiterResponse.ok) {
          const jupiterData = await jupiterResponse.json();
          
          // Filter to verified tokens only
          const verifiedJupiterTokens = jupiterData.filter(token => token.isVerified === true);
          
          // Transform to our format
          jupiterTokens = verifiedJupiterTokens.map(token => ({
            id: token.id,
            symbol: token.symbol,
            name: token.name,
            decimals: token.decimals,
            icon: token.icon,
            logoURI: token.icon,
            isVerified: true,
            source: 'jupiter',
          }));
          
          logger.info('Jupiter search results', { 
            query,
            found: jupiterTokens.length,
            requestId 
          });
        }
      } catch (jupiterError) {
        logger.warn('Jupiter search failed, continuing with backend only', {
          error: jupiterError.message,
          query,
          requestId
        });
      }
    }
    
    // Deduplicate: remove Jupiter tokens that are already in backend
    const backendAddresses = new Set(
      filteredBackendTokens.map(token => token.id.toLowerCase())
    );
    
    const uniqueJupiterTokens = jupiterTokens.filter(
      token => !backendAddresses.has(token.id.toLowerCase())
    );
    
    // Merge: backend first, then unique Jupiter tokens
    const allTokens = [...filteredBackendTokens, ...uniqueJupiterTokens];
    
    // Limit results
    const limitedTokens = allTokens.slice(0, limit);
    
    logger.info('Token search results', { 
      query, 
      backendCount: filteredBackendTokens.length,
      jupiterCount: uniqueJupiterTokens.length,
      totalFound: limitedTokens.length, 
      requestId 
    });
    
    return Response.json({
      success: true,
      tokens: limitedTokens,
      count: limitedTokens.length,
    }, { status: 200 });
    
  } catch (error) {
    logger.error('Token search failed', {
      error: error.message,
      requestId,
    });
    
    return Response.json({
      success: false,
      error: {
        code: 'SEARCH_FAILED',
        message: 'Failed to search tokens',
      },
      tokens: [],
    }, { status: 500 });
  }
}

/**
 * Get token icon URL
 * @param {string} mint - Token mint address
 * @returns {string} Icon URL
 */
function getTokenIcon(mint) {
  // Map of known token icons
  const iconMap = {
    'So11111111111111111111111111111111111111112': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg',
    'cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij': 'https://assets.coingecko.com/coins/images/26115/large/btcb.png',
    '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': 'https://raw.githubusercontent.com/wormhole-foundation/wormhole-token-list/main/assets/ETH_wh.png',
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': 'https://static.jup.ag/jup/icon.png',
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R': 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png',
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I',
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': 'https://bafkreibk3covs5ltyqxa272uodhculbr6kea6betidfwy3ajsav2vjzyum.ipfs.nftstorage.link',
    'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3': 'https://pyth.network/token.svg',
  };
  
  return iconMap[mint] || '';
}

