import { type Address } from 'viem'
import { CONTRACT_ADDRESSES, FACTORY_ABI } from '@/lib/contracts'
import { Pool, PoolDetails, CreatePoolParams } from '@/types/pool'
import { tokens } from '@/config/tokens'
import { getTickSpacing, sqrtPriceX96ToTick, sqrtPriceX96ToPrice, getSqrtRatioAtTick, getSqrtPriceX96 } from '@/lib/tickMath'

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

// Simple in-memory cache for pool details (cleared on page refresh)
const poolDetailsCache = new Map<string, PoolDetails | null>()
const POOL_CACHE_TTL = 30000 // 30 seconds

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
    // Check cache first
    const cacheKey = `${token0Address.toLowerCase()}-${token1Address.toLowerCase()}-${fee}`
    const cached = poolDetailsCache.get(cacheKey)
    if (cached !== undefined) {
      return cached
    }

    try {
      const poolAddress = await this.getPoolAddress(token0Address, token1Address, fee)

      if (poolAddress === '0x0000000000000000000000000000000000000000') {
        poolDetailsCache.set(cacheKey, null)
        // Clear cache after TTL
        setTimeout(() => poolDetailsCache.delete(cacheKey), POOL_CACHE_TTL)
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

      // Raw price from Uniswap is token1/token0 in smallest units
      // Adjust for decimals to get human-readable price: price * 10^(decimals0 - decimals1)
      const rawPrice = sqrtPriceX96ToPrice(sqrtPriceX96)
      const currentPrice = rawPrice * Math.pow(10, token0.decimals - token1.decimals)

      const poolDetails: PoolDetails = {
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

      // Cache the result
      poolDetailsCache.set(cacheKey, poolDetails)
      // Clear cache after TTL
      setTimeout(() => poolDetailsCache.delete(cacheKey), POOL_CACHE_TTL)

      return poolDetails
    } catch (error) {
      console.error('Error getting pool details:', error)
      // Cache null result to avoid repeated failed requests
      poolDetailsCache.set(cacheKey, null)
      setTimeout(() => poolDetailsCache.delete(cacheKey), POOL_CACHE_TTL)
      return null
    }
  }

  /**
   * Get all pools for known token pairs
   * In production, you'd use subgraph or events to discover all pools
   */
  async getAllPools(): Promise<PoolDetails[]> {
    const tokenList = Object.values(tokens)
    const fees = [100, 500, 2500, 10000]

    // Step 1: Batch fetch all pool addresses first (much faster)
    const poolAddressPromises: Array<{ i: number; j: number; fee: number; promise: Promise<string> }> = []
    for (let i = 0; i < tokenList.length; i++) {
      for (let j = i + 1; j < tokenList.length; j++) {
        for (const fee of fees) {
          poolAddressPromises.push({
            i,
            j,
            fee,
            promise: this.getPoolAddress(tokenList[i].address, tokenList[j].address, fee).catch(() => '0x0000000000000000000000000000000000000000')
          })
        }
      }
    }

    // Execute all address checks in parallel with batching
    const BATCH_SIZE = 50 // Can handle more address checks in parallel
    const existingPools: Array<{ token0: string; token1: string; fee: number }> = []
    
    for (let i = 0; i < poolAddressPromises.length; i += BATCH_SIZE) {
      const batch = poolAddressPromises.slice(i, i + BATCH_SIZE)
      const addresses = await Promise.all(batch.map(p => p.promise))
      
      addresses.forEach((address, idx) => {
        if (address !== '0x0000000000000000000000000000000000000000') {
          const { i, j, fee } = batch[idx]
          existingPools.push({
            token0: tokenList[i].address,
            token1: tokenList[j].address,
            fee
          })
        }
      })
      
      // Small delay between batches
      if (i + BATCH_SIZE < poolAddressPromises.length) {
        await new Promise(resolve => setTimeout(resolve, 30))
      }
    }

    // Step 2: Only fetch details for pools that exist (much fewer requests)
    // IMPORTANT: Create promises lazily (as functions) to avoid flooding RPC
    const poolDetailFunctions = existingPools.map(({ token0, token1, fee }) => 
      () => this.getPoolDetails(token0, token1, fee).catch(() => null)
    )

    // Execute pool detail fetches in smaller batches - LAZY EXECUTION
    const DETAIL_BATCH_SIZE = 5 // Reduced batch size to prevent flooding
    const pools: PoolDetails[] = []
    
    for (let i = 0; i < poolDetailFunctions.length; i += DETAIL_BATCH_SIZE) {
      const batch = poolDetailFunctions.slice(i, i + DETAIL_BATCH_SIZE)
      // Only create promises when we're ready to execute this batch
      const batchPromises = batch.map(fn => fn())
      const results = await Promise.allSettled(batchPromises)
      
      results.forEach((result) => {
        if (result.status === 'fulfilled' && result.value) {
          pools.push(result.value)
        }
      })
      
      // Delay between batches to prevent RPC flooding
      if (i + DETAIL_BATCH_SIZE < poolDetailFunctions.length) {
        await new Promise(resolve => setTimeout(resolve, 100)) // Increased delay
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
      // initialPrice is expected as token1/token0 ratio already adjusted for decimals
      const sqrtPriceX96 = getSqrtPriceX96(initialPrice)

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
   * Get pool details by direct pool address
   */
  async getPoolByAddress(poolAddress: string): Promise<PoolDetails | null> {
    try {
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

      // Raw price from Uniswap is token1/token0 in smallest units
      // Adjust for decimals to get human-readable price: price * 10^(decimals0 - decimals1)
      const rawPrice = sqrtPriceX96ToPrice(sqrtPriceX96)
      const currentPrice = rawPrice * Math.pow(10, token0.decimals - token1.decimals)

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
      console.error('Error getting pool details by address:', error)
      return null
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

        const sqrtPriceX96 = getSqrtPriceX96(initialPrice)

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
