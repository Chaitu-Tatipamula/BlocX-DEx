import { Position, PositionAmounts } from '@/types/position'
import { tickToPrice } from './tickMath'

/**
 * Check if position is in range (earning fees)
 * @param currentTick Current pool tick
 * @param tickLower Position lower tick
 * @param tickUpper Position upper tick
 * @returns true if position is in range
 */
export function isInRange(
  currentTick: number,
  tickLower: number,
  tickUpper: number
): boolean {
  return currentTick >= tickLower && currentTick <= tickUpper
}

/**
 * Get human-readable price range from ticks
 * @param tickLower Lower tick
 * @param tickUpper Upper tick
 * @returns {min, max} prices
 */
export function getPriceRangeDisplay(
  tickLower: number,
  tickUpper: number
): { min: number; max: number } {
  return {
    min: tickToPrice(tickLower),
    max: tickToPrice(tickUpper),
  }
}

/**
 * Calculate token amounts for a position
 * Based on Uniswap V3 math for concentrated liquidity
 * @param liquidity Position liquidity
 * @param currentTick Current pool tick
 * @param tickLower Position lower tick
 * @param tickUpper Position upper tick
 * @returns Token amounts
 */
export function getTokenAmounts(
  liquidity: string,
  currentTick: number,
  tickLower: number,
  tickUpper: number
): PositionAmounts {
  // Liquidity comes as raw string from contract (uint128)
  const liquidityBigInt = BigInt(liquidity)
  if (liquidityBigInt === BigInt(0)) {
    return { amount0: '0', amount1: '0' }
  }

  // Use raw liquidity value directly - don't divide by 1e18
  // The formulas work with raw liquidity, and the scale matches what calculateLiquidityAmounts produces
  const liquidityNum = Number(liquidityBigInt)

  // Get sqrt prices (normalized)
  const sqrtPriceCurrent = Math.sqrt(Math.pow(1.0001, currentTick))
  const sqrtPriceLower = Math.sqrt(Math.pow(1.0001, tickLower))
  const sqrtPriceUpper = Math.sqrt(Math.pow(1.0001, tickUpper))

  let amount0 = 0
  let amount1 = 0

  if (currentTick < tickLower) {
    // Position is entirely in token0
    amount0 = liquidityNum * (1 / sqrtPriceLower - 1 / sqrtPriceUpper)
  } else if (currentTick >= tickUpper) {
    // Position is entirely in token1
    amount1 = liquidityNum * (sqrtPriceUpper - sqrtPriceLower)
  } else {
    // Position is in range, has both tokens
    amount0 = liquidityNum * (1 / sqrtPriceCurrent - 1 / sqrtPriceUpper)
    amount1 = liquidityNum * (sqrtPriceCurrent - sqrtPriceLower)
  }

  return {
    amount0: Math.max(0, amount0).toFixed(6),
    amount1: Math.max(0, amount1).toFixed(6),
  }
}

/**
 * Estimate APR for a position based on fees earned
 * This is a simplified calculation - in production you'd want historical data
 * @param position Position data
 * @param poolFee Pool fee tier (in basis points, e.g., 500 = 0.05%)
 * @param volume24h 24h trading volume (optional)
 * @returns Estimated APR percentage
 */
export function estimateAPR(
  position: Position,
  poolFee: number,
  volume24h?: string
): number {
  // If no volume data, return 0
  if (!volume24h || volume24h === '0') {
    return 0
  }

  try {
    const volumeNum = parseFloat(volume24h)
    const liquidityNum = parseFloat(position.liquidity)
    
    if (liquidityNum === 0) {
      return 0
    }

    // Calculate daily fees earned by the pool
    const dailyFees = volumeNum * (poolFee / 1000000) // Convert basis points to decimal

    // Estimate this position's share (simplified - assumes uniform distribution)
    const positionShare = liquidityNum / (liquidityNum * 100) // Rough estimate

    // Daily fees for this position
    const dailyPositionFees = dailyFees * positionShare

    // Annualize
    const yearlyFees = dailyPositionFees * 365

    // APR = yearly fees / liquidity value
    const apr = (yearlyFees / liquidityNum) * 100

    return Math.min(Math.max(0, apr), 1000) // Cap at 1000%
  } catch (error) {
    console.error('Error calculating APR:', error)
    return 0
  }
}

/**
 * Calculate position's share of pool
 * @param positionLiquidity Position liquidity
 * @param poolLiquidity Total pool liquidity
 * @returns Share percentage (0-100)
 */
export function calculateShareOfPool(
  positionLiquidity: string,
  poolLiquidity: string
): number {
  // Both are raw liquidity strings (uint128), can compare directly
  const posLiq = BigInt(positionLiquidity)
  const poolLiq = BigInt(poolLiquidity)

  if (poolLiq === BigInt(0)) {
    return 0
  }

  // Calculate percentage: (position / pool) * 100
  // Use Number for division, but maintain precision
  return (Number(posLiq) / Number(poolLiq)) * 100
}

/**
 * Get position status color based on range
 * @param inRange Whether position is in range
 * @returns Color class
 */
export function getPositionStatusColor(inRange: boolean): string {
  return inRange ? 'text-green-600' : 'text-yellow-600'
}

/**
 * Get position status badge color
 * @param inRange Whether position is in range
 * @returns Badge color classes
 */
export function getPositionStatusBadge(inRange: boolean): {
  bg: string
  text: string
  label: string
} {
  if (inRange) {
    return {
      bg: 'bg-green-100',
      text: 'text-green-800',
      label: 'In Range',
    }
  }
  return {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    label: 'Out of Range',
  }
}

/**
 * Format price for display
 * @param price Price value
 * @param decimals Number of decimals
 * @returns Formatted price string
 */
export function formatPrice(price: number, decimals: number = 6): string {
  if (!isFinite(price) || isNaN(price) || price === 0) return '0'
  
  const abs = Math.abs(price)
  
  // Very small prices - use more decimals without scientific notation
  if (abs < 0.000001) {
    // Use up to 10 decimals for very small prices
    const formatted = price.toFixed(10).replace(/\.?0+$/, '')
    return formatted === '0' ? '< 0.000001' : formatted
  }
  
  // Small prices - use specified decimals
  if (abs < 1) {
    return price.toFixed(Math.min(decimals, 8))
  }
  
  // Large prices - use compact notation
  if (abs >= 1e9) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(price)
  }
  
  // Medium prices - use locale formatting with thousands separators
  if (abs >= 1000) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(price)
  }
  
  // Regular prices
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: Math.min(decimals, 4),
  }).format(price)
}

/**
 * Calculate concentrated liquidity multiplier vs full range
 * Shows how much more capital efficient the position is
 * @param tickLower Lower tick
 * @param tickUpper Upper tick
 * @returns Multiplier (e.g., 4.2 means 4.2x more efficient than full range)
 */
export function calculateLiquidityMultiplier(
  tickLower: number,
  tickUpper: number
): number {
  const fullRangeWidth = 887272 * 2 // Full range tick width
  const positionWidth = tickUpper - tickLower
  
  if (positionWidth === 0) {
    return 1
  }
  
  const multiplier = fullRangeWidth / positionWidth
  return Math.max(1, Math.min(multiplier, 1000)) // Cap at 1000x
}

/**
 * Calculate required token amounts for a given liquidity amount
 * This is the INVERSE of getTokenAmounts - used when ADDING liquidity
 * @param amount0Desired Desired amount of token0
 * @param amount1Desired Desired amount of token1
 * @param currentTick Current pool tick
 * @param tickLower Position lower tick
 * @param tickUpper Position upper tick
 * @returns Required amounts based on concentrated liquidity math
 */
export function calculateLiquidityAmounts(
  amount0Desired: string,
  amount1Desired: string,
  currentTick: number,
  tickLower: number,
  tickUpper: number
): { amount0: string; amount1: string; liquidity: string } {
  const amount0 = parseFloat(amount0Desired)
  const amount1 = parseFloat(amount1Desired)

  if (amount0 === 0 && amount1 === 0) {
    return { amount0: '0', amount1: '0', liquidity: '0' }
  }

  // Get sqrt prices
  const sqrtPriceCurrent = Math.sqrt(Math.pow(1.0001, currentTick))
  const sqrtPriceLower = Math.sqrt(Math.pow(1.0001, tickLower))
  const sqrtPriceUpper = Math.sqrt(Math.pow(1.0001, tickUpper))

  let liquidity = 0
  let finalAmount0 = 0
  let finalAmount1 = 0

  if (currentTick < tickLower) {
    // Price is below range - only token0 needed
    // liquidity = amount0 / (1/sqrtLower - 1/sqrtUpper)
    liquidity = amount0 / (1 / sqrtPriceLower - 1 / sqrtPriceUpper)
    finalAmount0 = amount0
    finalAmount1 = 0
  } else if (currentTick >= tickUpper) {
    // Price is above range - only token1 needed
    // liquidity = amount1 / (sqrtUpper - sqrtLower)
    liquidity = amount1 / (sqrtPriceUpper - sqrtPriceLower)
    finalAmount0 = 0
    finalAmount1 = amount1
  } else {
    // Price is in range - need both tokens
    // Calculate liquidity from both amounts and take the smaller one
    const liquidity0 = amount0 / (1 / sqrtPriceCurrent - 1 / sqrtPriceUpper)
    const liquidity1 = amount1 / (sqrtPriceCurrent - sqrtPriceLower)
    
    liquidity = Math.min(liquidity0, liquidity1)
    
    // Calculate actual amounts needed based on liquidity
    finalAmount0 = liquidity * (1 / sqrtPriceCurrent - 1 / sqrtPriceUpper)
    finalAmount1 = liquidity * (sqrtPriceCurrent - sqrtPriceLower)
  }

  // Helper to convert to fixed decimal string without scientific notation
  const toFixedDecimal = (num: number, maxDecimals: number = 18): string => {
    if (num === 0) return '0'
    if (num < 0) return '0' // Don't allow negative
    
    // For extremely small numbers (less than 1e-10), treat as 0 to avoid precision issues
    // This prevents issues with viem parseUnits which doesn't accept scientific notation
    if (Math.abs(num) < 1e-10) return '0'
    
    // For very small numbers, use toFixed with enough precision
    // This prevents scientific notation
    const fixed = num.toFixed(maxDecimals)
    // Remove trailing zeros but keep at least one decimal place if needed
    const cleaned = fixed.replace(/\.?0+$/, '')
    return cleaned || '0'
  }

  return {
    amount0: toFixedDecimal(Math.max(0, finalAmount0)),
    amount1: toFixedDecimal(Math.max(0, finalAmount1)),
    liquidity: toFixedDecimal(Math.max(0, liquidity)),
  }
}

/**
 * Calculate optimal amounts when user enters one token amount
 * Returns the required amount of the other token
 * @param inputAmount Amount of token being input
 * @param isToken0 Whether the input is token0 (true) or token1 (false)
 * @param currentTick Current pool tick
 * @param tickLower Position lower tick
 * @param tickUpper Position upper tick
 * @returns Optimal amount of the other token
 */
export function calculateOptimalAmount(
  inputAmount: string,
  isToken0: boolean,
  currentTick: number,
  tickLower: number,
  tickUpper: number
): string {
  const amount = parseFloat(inputAmount)
  
  if (amount === 0 || isNaN(amount)) {
    return '0'
  }

  // Get sqrt prices
  const sqrtPriceCurrent = Math.sqrt(Math.pow(1.0001, currentTick))
  const sqrtPriceLower = Math.sqrt(Math.pow(1.0001, tickLower))
  const sqrtPriceUpper = Math.sqrt(Math.pow(1.0001, tickUpper))

  if (currentTick < tickLower) {
    // Below range - only token0 needed
    return isToken0 ? inputAmount : '0'
  } else if (currentTick >= tickUpper) {
    // Above range - only token1 needed
    return isToken0 ? '0' : inputAmount
  } else {
    // In range - calculate the other amount
    if (isToken0) {
      // Given amount0, calculate amount1
      const liquidity = amount / (1 / sqrtPriceCurrent - 1 / sqrtPriceUpper)
      const amount1 = liquidity * (sqrtPriceCurrent - sqrtPriceLower)
      return amount1.toFixed(18)
    } else {
      // Given amount1, calculate amount0
      const liquidity = amount / (sqrtPriceCurrent - sqrtPriceLower)
      const amount0 = liquidity * (1 / sqrtPriceCurrent - 1 / sqrtPriceUpper)
      return amount0.toFixed(18)
    }
  }
}

/**
 * Get token distribution for a price range
 * Returns what percentage of value will be in token0 vs token1
 * @param currentTick Current pool tick
 * @param tickLower Position lower tick
 * @param tickUpper Position upper tick
 * @returns Percentages for token0 and token1
 */
export function getTokenDistribution(
  currentTick: number,
  tickLower: number,
  tickUpper: number
): { token0Percent: number; token1Percent: number } {
  if (currentTick < tickLower) {
    return { token0Percent: 100, token1Percent: 0 }
  } else if (currentTick >= tickUpper) {
    return { token0Percent: 0, token1Percent: 100 }
  } else {
    // In range - calculate based on price position
    const rangeWidth = tickUpper - tickLower
    const positionInRange = currentTick - tickLower
    const percentThrough = positionInRange / rangeWidth
    
    // Rough approximation - actual calculation is more complex
    const token1Percent = percentThrough * 100
    const token0Percent = 100 - token1Percent
    
    return { token0Percent, token1Percent }
  }
}

