import { Token } from '@/config/tokens'

/**
 * Pool interface representing a Uniswap V3 pool
 */
export interface Pool {
  address: string
  token0: Token
  token1: Token
  fee: number
  currentTick: number
  currentPrice: number
  liquidity: string
  sqrtPriceX96: bigint
  tickSpacing: number
}

/**
 * Pool details with additional statistics
 */
export interface PoolDetails extends Pool {
  tvl?: string
  volume24h?: string
  fees24h?: string
  userPositionsCount?: number
}

/**
 * Pool statistics
 */
export interface PoolStats {
  volume24h?: string
  tvl?: string
  fees24h?: string
  apr?: number
}

/**
 * Pool creation parameters
 */
export interface CreatePoolParams {
  token0: string
  token1: string
  fee: number
  initialPrice: number
}

/**
 * Fee tier configuration
 */
export interface FeeTier {
  fee: number
  tickSpacing: number
  label: string
  description: string
}

export const FEE_TIERS: FeeTier[] = [
  {
    fee: 100,
    tickSpacing: 1,
    label: '0.01%',
    description: 'Best for stable pairs',
  },
  {
    fee: 500,
    tickSpacing: 10,
    label: '0.05%',
    description: 'Good for most pairs',
  },
  {
    fee: 2500,
    tickSpacing: 50,
    label: '0.25%',
    description: 'Standard for volatile pairs',
  },
  {
    fee: 10000,
    tickSpacing: 200,
    label: '1%',
    description: 'Best for exotic pairs',
  },
]

