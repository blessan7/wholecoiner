/**
 * FX service for USD to INR conversion
 * Mock today, real API tomorrow
 */

const MOCK_FX_RATE = 83; // 1 USD = 83 INR

/**
 * Get USD to INR exchange rate
 * @returns {Promise<number>} Exchange rate
 */
export async function getFxUsdToInr() {
  // TODO (Oct 28): Replace with real FX API or USDC/INR pair
  return MOCK_FX_RATE;
}

/**
 * Convert USD amount to INR
 * @param {number} usdAmount - Amount in USD
 * @returns {Promise<number>} Amount in INR
 */
export async function convertUsdToInr(usdAmount) {
  const rate = await getFxUsdToInr();
  return usdAmount * rate;
}
