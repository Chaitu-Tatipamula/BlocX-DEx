import { parseUnits, formatUnits, type Address } from 'viem'
import { CONTRACT_ADDRESSES, ERC20_ABI, NONFUNGIBLE_POSITION_MANAGER_ABI, FACTORY_ABI, DEFAULT_FEE_TIER } from './contracts'

export interface LiquidityParams {
  tokenA: string
  tokenB: string
  amountADesired: string
  amountBDesired: string
  amountAMin: string
  amountBMin: string
  deadline: number
  recipient: Address
}

export interface IncreaseLiquidityParams {
  tokenId: string
  amount0Desired: string
  amount1Desired: string
  amount0Min: string
  amount1Min: string
  deadline: number
}

export interface PoolInfo {
  exists: boolean
  liquidity: string
  token0: string
  token1: string
  fee: number
}

export async function getPoolInfo(
  publicClient: any,
  tokenA: string,
  tokenB: string
): Promise<PoolInfo> {
  try {
    // Check if pool exists using the factory
    const poolAddress = await publicClient.readContract({
      address: CONTRACT_ADDRESSES.FACTORY,
      abi: FACTORY_ABI,
      functionName: 'getPool',
        args: [tokenA, tokenB, DEFAULT_FEE_TIER],
    })

    if (poolAddress === '0x0000000000000000000000000000000000000000') {
      return {
        exists: false,
        liquidity: '0',
        token0: tokenA,
        token1: tokenB,
        fee: DEFAULT_FEE_TIER,
      }
    }

    // Check if pool is initialized by trying to read slot0 and liquidity
    try {
      const slot0 = await publicClient.readContract({
        address: poolAddress as Address,
        abi: [
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
        ],
        functionName: 'slot0',
      })
      
      // Get actual liquidity from the pool
      const liquidity = await publicClient.readContract({
        address: poolAddress as Address,
        abi: [
          {
            inputs: [],
            name: 'liquidity',
            outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
            stateMutability: 'view',
            type: 'function',
          },
        ],
        functionName: 'liquidity',
      })
      
      // Pool exists and is initialized
      return {
        exists: true,
        liquidity: formatUnits(liquidity, 18),
        token0: tokenA,
        token1: tokenB,
        fee: DEFAULT_FEE_TIER,
      }
    } catch (slot0Error) {
      // Pool exists but not initialized
      return {
        exists: false, // Treat as not existing since it needs initialization
        liquidity: '0',
        token0: tokenA,
        token1: tokenB,
        fee: DEFAULT_FEE_TIER,
      }
    }
  } catch (error) {
    console.error('Error getting pool info:', error)
    return {
      exists: false,
      liquidity: '0',
      token0: tokenA,
      token1: tokenB,
      fee: 500,
    }
  }
}

export async function addLiquidity(
  walletClient: any,
  publicClient: any,
  params: LiquidityParams
): Promise<string> {
  try {
    const {
      tokenA,
      tokenB,
      amountADesired,
      amountBDesired,
      amountAMin,
      amountBMin,
      deadline,
      recipient,
    } = params

    const amountADesiredWei = parseUnits(amountADesired, 18)
    const amountBDesiredWei = parseUnits(amountBDesired, 18)
    const amountAMinWei = parseUnits(amountAMin, 18)
    const amountBMinWei = parseUnits(amountBMin, 18)
    
    const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60

    // Check if pool exists, create if not
    const poolInfo = await getPoolInfo(publicClient, tokenA, tokenB)
    
    if (!poolInfo.exists) {
      // Create pool first - use the same approach as the working scripts
      const createPoolHash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.FACTORY,
        abi: FACTORY_ABI,
        functionName: 'createPool',
        args: [tokenA, tokenB, 500], // Only 3 parameters: tokenA, tokenB, fee
      })
      
      // Wait for pool creation to be mined
      await publicClient.waitForTransactionReceipt({ hash: createPoolHash })
      
      // Get the pool address
      const poolAddress = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.FACTORY,
        abi: FACTORY_ABI,
        functionName: 'getPool',
        args: [tokenA, tokenB, 500],
      })
      
      if (poolAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('Failed to create pool')
      }
      
      // Initialize the pool with a starting price (1:1 ratio)
      // Use the same sqrtPriceX96 value as the working scripts
      const sqrtPriceX96 = BigInt('79228162514264337593543950336')
      
      const initializeHash = await walletClient.writeContract({
        address: poolAddress as Address,
        abi: [
          {
            inputs: [{ internalType: 'uint160', name: 'sqrtPriceX96', type: 'uint160' }],
            name: 'initialize',
            outputs: [],
            stateMutability: 'nonpayable',
            type: 'function',
          },
        ],
        functionName: 'initialize',
        args: [sqrtPriceX96],
      })
      
      // Wait for initialization to be mined
      await publicClient.waitForTransactionReceipt({ hash: initializeHash })
    }

    // Use wide tick range for simplicity (-887200 to 887200)
    const tickLower = -887200
    const tickUpper = 887200

    // Approve tokens for the position manager with exact amounts needed
    const tokenAContract = { address: tokenA as Address, abi: ERC20_ABI }
    const tokenBContract = { address: tokenB as Address, abi: ERC20_ABI }
    
    // Check current allowances and approve only what's needed
    const allowanceA = await publicClient.readContract({
      ...tokenAContract,
      functionName: 'allowance',
      args: [recipient, CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER],
    })
    
    if (allowanceA < amountADesiredWei) {
      await walletClient.writeContract({
        ...tokenAContract,
        functionName: 'approve',
        args: [CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER, amountADesiredWei],
      })
    }
    
    const allowanceB = await publicClient.readContract({
      ...tokenBContract,
      functionName: 'allowance',
      args: [recipient, CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER],
    })
    
    if (allowanceB < amountBDesiredWei) {
      await walletClient.writeContract({
        ...tokenBContract,
        functionName: 'approve',
        args: [CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER, amountBDesiredWei],
      })
    }

    // Mint liquidity position using NonfungiblePositionManager (exactly like working scripts)
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
      abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
      functionName: 'mint',
      args: [{
        token0: tokenA,
        token1: tokenB,
        fee: DEFAULT_FEE_TIER,
        tickLower: tickLower,
        tickUpper: tickUpper,
        amount0Desired: amountADesiredWei,
        amount1Desired: amountBDesiredWei,
        amount0Min: BigInt(0), // Accept any amount (no slippage protection like working scripts)
        amount1Min: BigInt(0), // Accept any amount (no slippage protection like working scripts)
        recipient: recipient,
        deadline: BigInt(deadlineTimestamp),
      }],
      value: BigInt(0), // Add value: 0 like working scripts
    })

    return hash
  } catch (error) {
    console.error('Error adding liquidity:', error)
    throw new Error(`Failed to add liquidity: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function increaseLiquidity(
  walletClient: any,
  publicClient: any,
  params: IncreaseLiquidityParams
): Promise<string> {
  try {
    const { tokenId, amount0Desired, amount1Desired, amount0Min, amount1Min, deadline } = params
    const amount0DesiredWei = parseUnits(amount0Desired, 18)
    const amount1DesiredWei = parseUnits(amount1Desired, 18)
    const amount0MinWei = parseUnits(amount0Min, 18)
    const amount1MinWei = parseUnits(amount1Min, 18)
    const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60

    // Increase liquidity for existing position
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
      abi: [
        {
          inputs: [
            {
              components: [
                { internalType: 'uint256', name: 'tokenId', type: 'uint256' },
                { internalType: 'uint256', name: 'amount0Desired', type: 'uint256' },
                { internalType: 'uint256', name: 'amount1Desired', type: 'uint256' },
                { internalType: 'uint256', name: 'amount0Min', type: 'uint256' },
                { internalType: 'uint256', name: 'amount1Min', type: 'uint256' },
                { internalType: 'uint256', name: 'deadline', type: 'uint256' },
              ],
              internalType: 'struct INonfungiblePositionManager.IncreaseLiquidityParams',
              name: 'params',
              type: 'tuple',
            },
          ],
          name: 'increaseLiquidity',
          outputs: [
            { internalType: 'uint128', name: 'liquidity', type: 'uint128' },
            { internalType: 'uint256', name: 'amount0', type: 'uint256' },
            { internalType: 'uint256', name: 'amount1', type: 'uint256' },
          ],
          stateMutability: 'payable',
          type: 'function',
        },
      ],
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

    return hash
  } catch (error) {
    console.error('Error increasing liquidity:', error)
    throw new Error('Failed to increase liquidity')
  }
}

export async function removeLiquidity(
  walletClient: any,
  publicClient: any,
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

    // Decrease liquidity
    const decreaseHash = await walletClient.writeContract({
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

    // Collect tokens
    const collectHash = await walletClient.writeContract({
      address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
      abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
      functionName: 'collect',
      args: [{
        tokenId: BigInt(tokenId),
        recipient: recipient,
        amount0Max: BigInt('340282366920938463463374607431768211455'), // Max uint128
        amount1Max: BigInt('340282366920938463463374607431768211455'), // Max uint128
      }],
    })

    return collectHash
  } catch (error) {
    console.error('Error removing liquidity:', error)
    throw new Error('Failed to remove liquidity')
  }
}

export async function burnPosition(
  walletClient: any,
  publicClient: any,
  tokenId: string
): Promise<string> {
  try {
    // Burn the NFT position (completely remove it)
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
      abi: [
        {
          inputs: [{ internalType: 'uint256', name: 'tokenId', type: 'uint256' }],
          name: 'burn',
          outputs: [],
          stateMutability: 'payable',
          type: 'function',
        },
      ],
      functionName: 'burn',
      args: [BigInt(tokenId)],
    })

    return hash
  } catch (error) {
    console.error('Error burning position:', error)
    throw new Error('Failed to burn position')
  }
}

export async function getLiquidityPositions(
  publicClient: any,
  userAddress: Address
): Promise<any[]> {
  try {
    // Get the number of positions owned by the user
    const balance = await publicClient.readContract({
      address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
      abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
    })

    const positions = []
    const balanceNum = Number(balance)

    // Get each position
    for (let i = 0; i < balanceNum; i++) {
      try {
        const tokenId = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
          abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
          functionName: 'tokenOfOwnerByIndex',
          args: [userAddress, BigInt(i)],
        })

        const position = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
          abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
          functionName: 'positions',
          args: [tokenId],
        })

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

        positions.push({
          tokenId: tokenId.toString(),
          token0,
          token1,
          fee: Number(fee),
          tickLower: Number(tickLower),
          tickUpper: Number(tickUpper),
          liquidity: formatUnits(liquidity, 18),
          tokensOwed0: formatUnits(tokensOwed0, 18),
          tokensOwed1: formatUnits(tokensOwed1, 18),
        })
      } catch (positionError) {
        console.error(`Error getting position ${i}:`, positionError)
        // Continue with other positions
      }
    }

    return positions
  } catch (error) {
    console.error('Error getting liquidity positions:', error)
    return []
  }
}

export async function getTokenBalance(
  publicClient: any,
  tokenAddress: string,
  userAddress: Address,
  decimals?: number
): Promise<string> {
  try {
    if (tokenAddress === 'BCX' || tokenAddress === '0x0000000000000000000000000000000000000000') {
      const balance = await publicClient.getBalance({ address: userAddress })
      return formatUnits(balance, decimals ?? 18)
    }
    
    const balance = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
    })

    let tokenDecimals = decimals
    if (tokenDecimals === undefined) {
      try {
        tokenDecimals = await publicClient.readContract({
          address: tokenAddress as Address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        })
      } catch {
        tokenDecimals = 18
      }
    }

    return formatUnits(balance, tokenDecimals as number)
  } catch (error) {
    console.error('Error getting token balance:', error)
    return '0'
  }
}
