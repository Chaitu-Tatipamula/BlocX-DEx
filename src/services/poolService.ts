import { type Address } from 'viem'
import { CONTRACT_ADDRESSES, FACTORY_ABI } from '@/lib/contracts'
import { Pool, PoolDetails, CreatePoolParams } from '@/types/pool'
import { tokens } from '@/config/tokens'
import { getTickSpacing, sqrtPriceX96ToTick, sqrtPriceX96ToPrice, getSqrtRatioAtTick } from '@/lib/tickMath'

// Pool ABI for reading pool data
const POOL_ABI = [
  {
    inputs: [],
    name: 'slot0',
    outputs: [
      { internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' },
      { internalType: 'int24', name: 'tick', type: 'int24' },
      { internalType: 'uint16', name: 'observationIndex', type: 'uint16' },
      { internalType: 'uint16', name: 'observationCardinality', type: 'uint16' },
      { internalType: 'uint16', name: 'observationCardinalityNext', type: 'uint16' },
      { internalType: 'uint8', name: 'feeProtocol', type: 'uint8' },
      { internalType: 'bool', name: 'unlocked', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'liquidity',
    outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token0',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'token1',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'fee',
    outputs: [{ internalType: 'uint24', name: '', type: 'uint24' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'tickSpacing',
    outputs: [{ internalType: 'int24', name: '', type: 'int24' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' }],
    name: 'initialize',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const

export class PoolService {
  constructor(
    private publicClient: any,
    private walletClient?: any
  ) {}

  /**
   * Get pool address for token pair and fee
   */
  async getPoolAddress(
    token0: string,
    token1: string,
    fee: number
  ): Promise<string> {
    try {
      const poolAddress = await this.publicClient.readContract({
        address: CONTRACT_ADDRESSES.FACTORY,
        abi: FACTORY_ABI,
        functionName: 'getPool',
        args: [token0 as Address, token1 as Address, fee],
      })

      return poolAddress as string
    } catch (error) {
      console.error('Error getting pool address:', error)
      return '0x0000000000000000000000000000000000000000'
    }
  }

  /**
   * Check if pool exists
   */
  async poolExists(token0: string, token1: string, fee: number): Promise<boolean> {
    const poolAddress = await this.getPoolAddress(token0, token1, fee)
    return poolAddress !== '0x0000000000000000000000000000000000000000'
  }

  /**
   * Get pool details including current state
   */
  async getPoolDetails(
    token0Address: string,
    token1Address: string,
    fee: number
  ): Promise<PoolDetails | null> {
    try {
      const poolAddress = await this.getPoolAddress(token0Address, token1Address, fee)

      if (poolAddress === '0x0000000000000000000000000000000000000000') {
        return null
      }

      // Read pool state
      const [slot0, liquidity, poolToken0, poolToken1, poolFee, tickSpacing] = await Promise.all([
        this.publicClient.readContract({
          address: poolAddress as Address,
          abi: POOL_ABI,
          functionName: 'slot0',
        }),
        this.publicClient.readContract({
          address: poolAddress as Address,
          abi: POOL_ABI,
          functionName: 'liquidity',
        }),
        this.publicClient.readContract({
          address: poolAddress as Address,
          abi: POOL_ABI,
          functionName: 'token0',
        }),
        this.publicClient.readContract({
          address: poolAddress as Address,
          abi: POOL_ABI,
          functionName: 'token1',
        }),
        this.publicClient.readContract({
          address: poolAddress as Address,
          abi: POOL_ABI,
          functionName: 'fee',
        }),
        this.publicClient.readContract({
          address: poolAddress as Address,
          abi: POOL_ABI,
          functionName: 'tickSpacing',
        }),
      ])

      const [sqrtPriceX96, tick] = slot0 as [bigint, number, number, number, number, number, boolean]

      // Find token objects
      const token0 = Object.values(tokens).find(
        (t) => t.address.toLowerCase() === (poolToken0 as string).toLowerCase()
      ) || {
        address: poolToken0 as string,
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 18,
      }

      const token1 = Object.values(tokens).find(
        (t) => t.address.toLowerCase() === (poolToken1 as string).toLowerCase()
      ) || {
        address: poolToken1 as string,
        symbol: 'UNKNOWN',
        name: 'Unknown Token',
        decimals: 18,
      }

      const currentPrice = sqrtPriceX96ToPrice(sqrtPriceX96)

      return {
        address: poolAddress,
        token0,
        token1,
        fee: Number(poolFee),
        currentTick: Number(tick),
        currentPrice,
        liquidity: liquidity.toString(),
        sqrtPriceX96,
        tickSpacing: Number(tickSpacing),
      }
    } catch (error) {
      console.error('Error getting pool details:', error)
      return null
    }
  }

  /**
   * Get all pools for known token pairs
   * In production, you'd use subgraph or events to discover all pools
   */
  async getAllPools(): Promise<PoolDetails[]> {
    const pools: PoolDetails[] = []
    const tokenList = Object.values(tokens)
    const fees = [100, 500, 3000, 10000]

    // Check all combinations of tokens and fees
    for (let i = 0; i < tokenList.length; i++) {
      for (let j = i + 1; j < tokenList.length; j++) {
        for (const fee of fees) {
          try {
            const pool = await this.getPoolDetails(
              tokenList[i].address,
              tokenList[j].address,
              fee
            )
            if (pool) {
              pools.push(pool)
            }
          } catch (error) {
            // Pool doesn't exist or error reading, skip
            continue
          }
        }
      }
    }

    return pools
  }

  /**
   * Create a new pool
   */
  async createPool(params: CreatePoolParams): Promise<string> {
    if (!this.walletClient) {
      throw new Error('Wallet client required for pool creation')
    }

    try {
      const { token0, token1, fee, initialPrice } = params

      // Check if pool already exists
      const exists = await this.poolExists(token0, token1, fee)
      if (exists) {
        throw new Error('Pool already exists')
      }

      // Create pool
      const createHash = await this.walletClient.writeContract({
        address: CONTRACT_ADDRESSES.FACTORY,
        abi: FACTORY_ABI,
        functionName: 'createPool',
        args: [token0 as Address, token1 as Address, fee],
      })

      // Wait for creation
      await this.publicClient.waitForTransactionReceipt({ hash: createHash })

      // Get pool address
      const poolAddress = await this.getPoolAddress(token0, token1, fee)

      if (poolAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error(`Failed to create pool. Pool address is zero. This might be because:
1. The factory contract is not working correctly
2. The token addresses are invalid
3. The fee tier (${fee}) is not supported
4. There was an issue with the transaction

Please check:
- Token addresses: ${token0}, ${token1}
- Fee tier: ${fee}
- Factory contract: ${CONTRACT_ADDRESSES.FACTORY}`)
      }

      // Initialize pool with price
      const sqrtPriceX96 = getSqrtRatioAtTick(Math.floor(Math.log(initialPrice) / Math.log(1.0001)))

      const initHash = await this.walletClient.writeContract({
        address: poolAddress as Address,
        abi: POOL_ABI,
        functionName: 'initialize',
        args: [sqrtPriceX96],
      })

      await this.publicClient.waitForTransactionReceipt({ hash: initHash })

      return poolAddress
    } catch (error) {
      console.error('Error creating pool:', error)
      throw error
    }
  }

  /**
   * Create pool if it doesn't exist
   */
  async createPoolIfNeeded(
    token0: string,
    token1: string,
    fee: number,
    initialPrice: number
  ): Promise<string> {
    const poolAddress = await this.getPoolAddress(token0, token1, fee)

    if (poolAddress !== '0x0000000000000000000000000000000000000000') {
      // Pool exists, check if initialized
      try {
        await this.publicClient.readContract({
          address: poolAddress as Address,
          abi: POOL_ABI,
          functionName: 'slot0',
        })
        return poolAddress
      } catch {
        // Pool exists but not initialized, initialize it
        if (!this.walletClient) {
          throw new Error('Wallet client required')
        }

        const sqrtPriceX96 = getSqrtRatioAtTick(Math.floor(Math.log(initialPrice) / Math.log(1.0001)))

        const initHash = await this.walletClient.writeContract({
          address: poolAddress as Address,
          abi: POOL_ABI,
          functionName: 'initialize',
          args: [sqrtPriceX96],
        })

        await this.publicClient.waitForTransactionReceipt({ hash: initHash })
        return poolAddress
      }
    }

    // Create new pool
    return this.createPool({ token0, token1, fee, initialPrice })
  }
}
