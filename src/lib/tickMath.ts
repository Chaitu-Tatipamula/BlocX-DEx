/**
 * Tick Math Utilities for Uniswap V3
 * Handles conversions between ticks, prices, and sqrtPriceX96
 */

// Constants
const MIN_TICK = -887272
const MAX_TICK = 887272
const Q96 = BigInt(2) ** BigInt(96)

/**
 * Get tick spacing for a given fee tier
 * @param fee Fee tier (100, 500, 2500, 10000)
 * @returns Tick spacing
 */
export function getTickSpacing(fee: number): number {
  switch (fee) {
    case 100: // 0.01%
      return 1
    case 500: // 0.05%
      return 10
    case 2500: // 0.25%
      return 50
    case 10000: // 1%
      return 200
    default:
      return 10 // Default to 0.05% spacing
  }
}

/**
 * Convert price to tick
 * Price = 1.0001^tick
 * tick = log(price) / log(1.0001)
 * @param price Price ratio (token1/token0)
 * @returns Tick value
 */
export function priceToTick(price: number): number {
  if (price <= 0) {
    throw new Error('Price must be positive')
  }
  
  // tick = log(price) / log(1.0001)
  const tick = Math.log(price) / Math.log(1.0001)
  
  // Clamp to valid range
  return Math.max(MIN_TICK, Math.min(MAX_TICK, Math.floor(tick)))
}

/**
 * Convert tick to price
 * Price = 1.0001^tick
 * @param tick Tick value
 * @returns Price ratio (token1/token0)
 */
export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick)
}

/**
 * Round tick to nearest valid tick for given spacing
 * @param tick Raw tick value
 * @param tickSpacing Tick spacing (1, 10, 60, 200)
 * @returns Nearest valid tick
 */
export function getNearestValidTick(tick: number, tickSpacing: number): number {
  const rounded = Math.round(tick / tickSpacing) * tickSpacing
  return Math.max(MIN_TICK, Math.min(MAX_TICK, rounded))
}

/**
 * Get sqrt ratio at tick for pool initialization
 * sqrtPriceX96 = sqrt(1.0001^tick) * 2^96
 * @param tick Tick value
 * @returns sqrtPriceX96 as bigint
 */
export function getSqrtRatioAtTick(tick: number): bigint {
  if (tick < MIN_TICK || tick > MAX_TICK) {
    throw new Error('Tick out of range')
  }

  const absTick = Math.abs(tick)
  
  // Calculate sqrt(1.0001^tick) using logarithms for precision
  // sqrt(1.0001^tick) = 1.0001^(tick/2)
  const sqrtPrice = Math.pow(1.0001, tick / 2)
  
  // Multiply by 2^96 and convert to bigint
  const sqrtPriceX96 = BigInt(Math.floor(sqrtPrice * Number(Q96)))
  
  return sqrtPriceX96
}

/**
 * Get sqrt price from regular price
 * @param price Price ratio
 * @returns sqrtPriceX96 as bigint
 */
export function getSqrtPriceX96(price: number): bigint {
  const sqrtPrice = Math.sqrt(price)
  return BigInt(Math.floor(sqrtPrice * Number(Q96)))
}

/**
 * Convert sqrtPriceX96 to regular price
 * @param sqrtPriceX96 Square root price in X96 format
 * @returns Regular price
 */
export function sqrtPriceX96ToPrice(sqrtPriceX96: bigint): number {
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96)
  return sqrtPrice * sqrtPrice
}

/**
 * Convert sqrtPriceX96 to tick
 * @param sqrtPriceX96 Square root price in X96 format
 * @returns Tick value
 */
export function sqrtPriceX96ToTick(sqrtPriceX96: bigint): number {
  const price = sqrtPriceX96ToPrice(sqrtPriceX96)
  return priceToTick(price)
}

/**
 * Calculate price range from percentage around current price
 * @param currentPrice Current price
 * @param percentageRange Percentage range (e.g., 10 for ±10%)
 * @param tickSpacing Tick spacing to align to
 * @returns {minTick, maxTick, minPrice, maxPrice}
 */
export function getPriceRangeFromPercentage(
  currentPrice: number,
  percentageRange: number,
  tickSpacing: number
): {
  minTick: number
  maxTick: number
  minPrice: number
  maxPrice: number
} {
  const multiplier = 1 + percentageRange / 100
  const minPrice = currentPrice / multiplier
  const maxPrice = currentPrice * multiplier
  
  const rawMinTick = priceToTick(minPrice)
  const rawMaxTick = priceToTick(maxPrice)
  
  const minTick = getNearestValidTick(rawMinTick, tickSpacing)
  const maxTick = getNearestValidTick(rawMaxTick, tickSpacing)
  
  return {
    minTick,
    maxTick,
    minPrice: tickToPrice(minTick),
    maxPrice: tickToPrice(maxTick),
  }
}

/**
 * Get full range ticks
 * @param tickSpacing Tick spacing
 * @returns {minTick, maxTick}
 */
export function getFullRangeTicks(tickSpacing: number): {
  minTick: number
  maxTick: number
} {
  return {
    minTick: getNearestValidTick(MIN_TICK, tickSpacing),
    maxTick: getNearestValidTick(MAX_TICK, tickSpacing),
  }
}

/**
 * Validate tick is within valid range
 * @param tick Tick to validate
 * @returns true if valid
 */
export function isValidTick(tick: number): boolean {
  return tick >= MIN_TICK && tick <= MAX_TICK && Number.isInteger(tick)
}

/**
 * Validate tick is properly spaced
 * @param tick Tick to validate
 * @param tickSpacing Required spacing
 * @returns true if properly spaced
 */
export function isValidTickSpacing(tick: number, tickSpacing: number): boolean {
  return tick % tickSpacing === 0
}

