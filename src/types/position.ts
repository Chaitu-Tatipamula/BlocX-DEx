/**
 * Basic position data from contract
 */
export interface Position {
  tokenId: string
  token0: string
  token1: string
  fee: number
  tickLower: number
  tickUpper: number
  liquidity: string
  tokensOwed0: string
  tokensOwed1: string
}

/**
 * Enhanced position with calculated metrics
 */
export interface PositionDetails extends Position {
  inRange: boolean
  amount0: string
  amount1: string
  estimatedAPR: number
  shareOfPool: number
  priceRangeLower: number
  priceRangeUpper: number
  currentPrice: number
  poolAddress?: string
}

/**
 * Position token amounts
 */
export interface PositionAmounts {
  amount0: string
  amount1: string
}

/**
 * Price range for position
 */
export interface PriceRange {
  min: number
  max: number
  minTick: number
  maxTick: number
}

