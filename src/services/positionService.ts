import { parseUnits, formatUnits, type Address } from 'viem'
import { CONTRACT_ADDRESSES, NONFUNGIBLE_POSITION_MANAGER_ABI, ERC20_ABI, FACTORY_ABI, POOL_ABI } from '@/lib/contracts'

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

export interface IncreaseLiquidityParams {
  tokenId: string
  amount0Desired: string
  amount1Desired: string
  amount0Min: string
  amount1Min: string
  deadline: number
  recipient: Address
  // Add position's original tick range
  tickLower?: number
  tickUpper?: number
  currentTick?: number
}

export class PositionService {
  constructor(
    private publicClient: any,
    private walletClient: any
  ) {}

  async getPositions(userAddress: Address): Promise<Position[]> {
    try {
      const balance = await this.publicClient.readContract({
        address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      })

      const balanceNum = Number(balance)
      if (balanceNum === 0) return []

      // Parallelize tokenId fetching
      const tokenIdPromises = Array.from({ length: balanceNum }, (_, i) =>
        this.publicClient.readContract({
          address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
          abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [userAddress, BigInt(i)],
        }).catch(() => null)
      )

      const tokenIds = (await Promise.all(tokenIdPromises)).filter((id): id is bigint => id !== null)

      if (tokenIds.length === 0) return []

      // Parallelize position fetching
      const positionPromises = tokenIds.map(tokenId =>
        this.publicClient.readContract({
          address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
          abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
          functionName: 'positions',
          args: [tokenId],
        }).catch(() => null)
      )

      const positionsData = await Promise.all(positionPromises)
      
      // Collect unique token addresses for batch decimal fetching
      const tokenAddresses = new Set<string>()
      positionsData.forEach((position) => {
        if (position) {
          const [, , token0, token1] = position as any[]
          tokenAddresses.add(token0 as string)
          tokenAddresses.add(token1 as string)
        }
      })

      // Batch fetch decimals for all unique tokens
      const decimalsMap = new Map<string, number>()
      const decimalsPromises = Array.from(tokenAddresses).map(async (address) => {
        try {
          const decimals = await this.publicClient.readContract({
            address: address as Address,
            abi: ERC20_ABI,
            functionName: 'decimals',
          })
          return { address, decimals: Number(decimals) }
        } catch {
          return { address, decimals: 18 } // Default to 18
        }
      })

      const decimalsResults = await Promise.all(decimalsPromises)
      decimalsResults.forEach(({ address, decimals }) => {
        decimalsMap.set(address, decimals)
      })

      // Process positions with cached decimals
      const positions: Position[] = []
      for (let i = 0; i < tokenIds.length; i++) {
        const position = positionsData[i]
        if (!position) continue

        const [
          nonce,
          operator,
          token0,
          token1,
          fee,
          tickLower,
          tickUpper,
          liquidity,
          feeGrowthInside0LastX128,
          feeGrowthInside1LastX128,
          tokensOwed0,
          tokensOwed1,
        ] = position as any[]

        const token0Decimals = decimalsMap.get(token0 as string) || 18
        const token1Decimals = decimalsMap.get(token1 as string) || 18

        positions.push({
          tokenId: tokenIds[i].toString(),
          token0,
          token1,
          fee: Number(fee),
          tickLower: Number(tickLower),
          tickUpper: Number(tickUpper),
          liquidity: liquidity.toString(),
          tokensOwed0: formatUnits(tokensOwed0, token0Decimals),
          tokensOwed1: formatUnits(tokensOwed1, token1Decimals),
        })
      }

      return positions
    } catch (error) {
      console.error('Error fetching positions:', error)
      return []
    }
  }

  async increaseLiquidity(params: IncreaseLiquidityParams): Promise<string> {
    try {
      const { tokenId, amount0Desired, amount1Desired, amount0Min, amount1Min, deadline, recipient, tickLower, tickUpper, currentTick } = params
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60

      // First, get the position details to know which tokens to approve
      const position = await this.publicClient.readContract({
        address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'positions',
        args: [BigInt(tokenId)],
      })

      const [, , token0, token1, fee, tickLowerFromContract, tickUpperFromContract, liquidity] = position as any[]
      
      console.log('Position details from contract:', {
        token0,
        token1,
        fee,
        tickLower: Number(tickLowerFromContract),
        tickUpper: Number(tickUpperFromContract),
        liquidity: liquidity.toString()
      })
      
      // Check if position has any liquidity
      if (liquidity === BigInt(0)) {
        throw new Error('Position has no liquidity. You cannot increase liquidity for empty positions.')
      }
      
      // Use the position's original tick range if not provided
      const finalTickLower = tickLower ?? Number(tickLowerFromContract)
      const finalTickUpper = tickUpper ?? Number(tickUpperFromContract)
      
      // Check if position is in range
      if (currentTick !== undefined) {
        const isInRange = currentTick >= finalTickLower && currentTick <= finalTickUpper
        console.log('Position range check:', {
          currentTick,
          tickLower: finalTickLower,
          tickUpper: finalTickUpper,
          isInRange
        })
        
        if (!isInRange) {
          throw new Error(`Position is out of range. Current tick ${currentTick} is outside range [${finalTickLower}, ${finalTickUpper}]. You cannot increase liquidity for out-of-range positions.`)
        }
      }
      
      // If we have currentTick and tick range, calculate optimal amounts
      let finalAmount0Desired = amount0Desired
      let finalAmount1Desired = amount1Desired
      
      if (currentTick !== undefined && finalTickLower !== undefined && finalTickUpper !== undefined) {
        // Import the position analysis functions
        const { calculateLiquidityAmounts } = await import('../lib/positionAnalysis')
        
        // Calculate optimal amounts based on the position's tick range
        const { amount0, amount1 } = calculateLiquidityAmounts(
          amount0Desired,
          amount1Desired,
          currentTick,
          finalTickLower,
          finalTickUpper
        )
        
        finalAmount0Desired = amount0
        finalAmount1Desired = amount1
      }
      
      // Get token decimals
      const [token0Decimals, token1Decimals] = await Promise.all([
        this.publicClient.readContract({
          address: token0 as Address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }).catch(() => 18),
        this.publicClient.readContract({
          address: token1 as Address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }).catch(() => 18),
      ])

      // Helper function to convert scientific notation to fixed decimal string
      const toFixedDecimal = (value: string, decimals: number): string => {
        // Handle string input that might be in scientific notation
        let num: number
        if (typeof value === 'string' && (value.includes('e') || value.includes('E'))) {
          // Parse scientific notation manually
          num = parseFloat(value)
        } else {
          num = parseFloat(value)
        }
        
        if (isNaN(num) || !isFinite(num)) return '0'
        if (num === 0) return '0'
        if (num < 0) return '0' // Don't allow negative
        
        // For extremely small numbers (less than 1e-10), treat as 0 to avoid precision issues
        // This prevents issues with viem parseUnits which doesn't accept scientific notation
        if (Math.abs(num) < 1e-10) return '0'
        
        // Convert to fixed decimal notation, avoiding scientific notation
        // Use enough decimal places but cap at reasonable precision
        const maxDecimals = Math.min(decimals, 18)
        const fixed = num.toFixed(maxDecimals)
        
        // Remove trailing zeros but ensure we have a valid number
        const cleaned = fixed.replace(/\.?0+$/, '')
        return cleaned || '0'
      }

      // Convert amounts to fixed decimal strings before parsing
      const fixedAmount0Desired = toFixedDecimal(finalAmount0Desired, Number(token0Decimals))
      const fixedAmount1Desired = toFixedDecimal(finalAmount1Desired, Number(token1Decimals))
      const fixedAmount0Min = toFixedDecimal(amount0Min, Number(token0Decimals))
      const fixedAmount1Min = toFixedDecimal(amount1Min, Number(token1Decimals))

      const amount0DesiredWei = parseUnits(fixedAmount0Desired, Number(token0Decimals))
      const amount1DesiredWei = parseUnits(fixedAmount1Desired, Number(token1Decimals))
      const amount0MinWei = parseUnits(fixedAmount0Min, Number(token0Decimals))
      const amount1MinWei = parseUnits(fixedAmount1Min, Number(token1Decimals))

      // Check token balances before attempting transaction
      const balance0 = await this.publicClient.readContract({
        address: token0,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [recipient],
      })

      const balance1 = await this.publicClient.readContract({
        address: token1,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [recipient],
      })

      console.log('Token balances check:', {
        token0Balance: balance0.toString(),
        token1Balance: balance1.toString(),
        amount0Desired: amount0DesiredWei.toString(),
        amount1Desired: amount1DesiredWei.toString(),
        hasEnoughToken0: balance0 >= amount0DesiredWei,
        hasEnoughToken1: balance1 >= amount1DesiredWei
      })

      if (balance0 < amount0DesiredWei) {
        throw new Error(`Insufficient ${token0} balance. Required: ${fixedAmount0Desired}, Available: ${formatUnits(balance0, Number(token0Decimals))}`)
      }

      if (balance1 < amount1DesiredWei) {
        throw new Error(`Insufficient ${token1} balance. Required: ${fixedAmount1Desired}, Available: ${formatUnits(balance1, Number(token1Decimals))}`)
      }

      // Approve tokens for the position manager
      const token0Contract = { address: token0, abi: ERC20_ABI }
      const token1Contract = { address: token1, abi: ERC20_ABI }

      // Check current allowances and approve if needed
      const allowance0 = await this.publicClient.readContract({
        ...token0Contract,
        functionName: 'allowance',
        args: [recipient, CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER],
      })

      if (allowance0 < amount0DesiredWei) {
        const approveHash0 = await this.walletClient.writeContract({
          ...token0Contract,
          functionName: 'approve',
          args: [CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER, amount0DesiredWei],
        })
        await this.publicClient.waitForTransactionReceipt({ hash: approveHash0 })
      }

      const allowance1 = await this.publicClient.readContract({
        ...token1Contract,
        functionName: 'allowance',
        args: [recipient, CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER],
      })

      if (allowance1 < amount1DesiredWei) {
        const approveHash1 = await this.walletClient.writeContract({
          ...token1Contract,
          functionName: 'approve',
          args: [CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER, amount1DesiredWei],
        })
        await this.publicClient.waitForTransactionReceipt({ hash: approveHash1 })
      }
      console.log('Attempting to increase liquidity with params:', {
        tokenId,
        amount0Desired: finalAmount0Desired,
        amount1Desired: finalAmount1Desired,
        amount0Min,
        amount1Min,
        tickLower: finalTickLower,
        tickUpper: finalTickUpper,
        currentTick
      })

      const hash = await this.walletClient.writeContract({
        address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'increaseLiquidity',
        args: [{
          tokenId: BigInt(tokenId),
          amount0Desired: amount0DesiredWei,
          amount1Desired: amount1DesiredWei,
          amount0Min: amount0MinWei,
          amount1Min: amount1MinWei,
          deadline: BigInt(deadlineTimestamp),
        }],
      })
      
      console.log('Transaction submitted:', hash)
      
      // Wait for transaction confirmation with timeout
      const receipt = await this.publicClient.waitForTransactionReceipt({ 
        hash,
        timeout: 120000 // 2 minutes timeout
      })

      console.log('Transaction receipt:', receipt)

      // Check if transaction was successful
      if (receipt.status !== 'success') {
        // Try to get more details about the failure
        try {
          const tx = await this.publicClient.getTransaction({ hash })
          console.log('Failed transaction details:', tx)
        } catch (txError) {
          console.log('Could not fetch transaction details:', txError)
        }
        throw new Error('Transaction failed during execution')
      }
      else{
        console.log("Successfully increased liquidity")
      }
      return hash
    } catch (error: any) {
    console.error('Detailed error:', {
      message: error.message,
      code: error.code,
      data: error.data,
      reason: error.reason
    })
    throw error;
  }
  }

  async removeLiquidity(
    tokenId: string,
    liquidity: string,
    amount0Min: string,
    amount1Min: string,
    deadline: number,
    recipient: Address
  ): Promise<string> {
    try {
      const liquidityWei = parseUnits(liquidity, 18)
      const amount0MinWei = parseUnits(amount0Min, 18)
      const amount1MinWei = parseUnits(amount1Min, 18)
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60

      const decreaseHash = await this.walletClient.writeContract({
        address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'decreaseLiquidity',
        args: [{
          tokenId: BigInt(tokenId),
          liquidity: liquidityWei,
          amount0Min: amount0MinWei,
          amount1Min: amount1MinWei,
          deadline: BigInt(deadlineTimestamp),
        }],
      })

      const collectHash = await this.walletClient.writeContract({
        address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'collect',
        args: [{
          tokenId: BigInt(tokenId),
          recipient: recipient,
          amount0Max: BigInt('340282366920938463463374607431768211455'),
          amount1Max: BigInt('340282366920938463463374607431768211455'),
        }],
      })

      return collectHash
    } catch (error) {
      throw new Error(`Failed to remove liquidity: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async collectFees(
    tokenId: string,
    recipient: Address,
    amount0Max: string,
    amount1Max: string
  ): Promise<string> {
    try {
      const amount0MaxWei = parseUnits(amount0Max, 18)
      const amount1MaxWei = parseUnits(amount1Max, 18)

      const hash = await this.walletClient.writeContract({
        address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'collect',
        args: [{
          tokenId: BigInt(tokenId),
          recipient: recipient,
          amount0Max: amount0MaxWei,
          amount1Max: amount1MaxWei,
        }],
      })

      return hash
    } catch (error) {
      throw new Error(`Failed to collect fees: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async burnPosition(tokenId: string): Promise<string> {
    try {
      const hash = await this.walletClient.writeContract({
        address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'burn',
        args: [BigInt(tokenId)],
      })

      return hash
    } catch (error) {
      throw new Error(`Failed to burn position: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async getPoolAddress(token0: string, token1: string, fee: number): Promise<string> {
    try {
      const poolAddress = await this.publicClient.readContract({
        address: CONTRACT_ADDRESSES.FACTORY,
        abi: FACTORY_ABI,
        functionName: 'getPool',
        args: [token0, token1, fee],
      })

      return poolAddress as string
    } catch (error) {
      console.error('Error getting pool address:', error)
      return '0x0000000000000000000000000000000000000000'
    }
  }

  async getPoolData(poolAddress: string): Promise<{ currentTick: number; currentPrice: number; liquidity: string }> {
    try {
      const poolData = await this.publicClient.readContract({
        address: poolAddress as Address,
        abi: POOL_ABI,
        functionName: 'slot0',
      })

      const [sqrtPriceX96, tick, , , ,] = poolData as any[]
      
      // Convert sqrtPriceX96 to price
      const price = Number(sqrtPriceX96) ** 2 / (2 ** 192)
      
      return {
        currentTick: Number(tick),
        currentPrice: price,
        liquidity: '0', // Would need to call liquidity() function separately
      }
    } catch (error) {
      console.error('Error getting pool data:', error)
      throw new Error(`Failed to get pool data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
