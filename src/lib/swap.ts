import { parseUnits, formatUnits, type Address } from 'viem'
import { CONTRACT_ADDRESSES, ROUTER_ABI, SWAP_ROUTER_ABI, QUOTER_V2_ABI, ERC20_ABI, WETH_ABI, FACTORY_ABI } from './contracts'
import { tokens, type Token } from '../config/tokens'

export interface SwapParams {
  tokenIn: string
  tokenOut: string
  amountIn: string
  slippage: number
  deadline: number
  recipient: Address
  fee?: number // Optional fee tier, will be determined from quote if not provided
}

export interface SwapQuote {
  amountOut: string
  priceImpact: number
  minimumReceived: string
  fee: number // Fee tier used for this quote
}

export async function checkPoolExists(
  publicClient: any,
  token0: string,
  token1: string,
  fee: number
): Promise<boolean> {
  try {
    const [a, b] = token0.toLowerCase() < token1.toLowerCase() ? [token0, token1] : [token1, token0]
    const poolAddress = await publicClient.readContract({
      address: CONTRACT_ADDRESSES.FACTORY,
      abi: FACTORY_ABI,
      functionName: 'getPool',
      args: [a, b, fee],
    })
    
    return poolAddress !== '0x0000000000000000000000000000000000000000'
  } catch (error) {
    console.log('Error checking pool existence:', error)
    return false
  }
}

export async function checkPoolLiquidity(
  publicClient: any,
  token0: string,
  token1: string,
  fee: number
): Promise<{ hasLiquidity: boolean; liquidity: string }> {
  try {
    const [a, b] = token0.toLowerCase() < token1.toLowerCase() ? [token0, token1] : [token1, token0]
    const poolAddress = await publicClient.readContract({
      address: CONTRACT_ADDRESSES.FACTORY,
      abi: FACTORY_ABI,
      functionName: 'getPool',
      args: [a, b, fee],
    })
    
    if (poolAddress === '0x0000000000000000000000000000000000000000') {
      return { hasLiquidity: false, liquidity: '0' }
    }
    
    // Check if pool has liquidity by reading the liquidity value
    const liquidity = await publicClient.readContract({
      address: poolAddress,
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
    
    const hasLiquidity = liquidity > BigInt(0)
    console.log(`Pool liquidity check: ${hasLiquidity ? 'HAS' : 'NO'} liquidity (${liquidity.toString()}), (${poolAddress})`)
    
    return { hasLiquidity, liquidity: liquidity.toString() }
  } catch (error) {
    console.log('Error checking pool liquidity:', error)
    return { hasLiquidity: false, liquidity: '0' }
  }
}


// Available fee tiers (in basis points)
export const FEE_TIERS = [100, 500, 2500, 10000] // 0.01%, 0.05%, 0.25%, 1%

export async function getQuote(
  publicClient: any,
  tokenIn: string,
  tokenOut: string,
  amountIn: string
): Promise<SwapQuote> {
  try {
    const tokenInAddress = tokenIn === 'BCX' ? tokens.WBCX.address : tokenIn
    const tokenOutAddress = tokenOut === 'BCX' ? tokens.WBCX.address : tokenOut
    
    // Don't allow swapping the same token
    if (tokenInAddress === tokenOutAddress) {
      return {
        amountOut: amountIn,
        priceImpact: 0,
        minimumReceived: amountIn,
        fee: 500, // Default fee
      }
    }
    
    // Determine decimals for in/out tokens
    const resolveDecimals = async (addr: string): Promise<number> => {
      if (addr === 'BCX') return 18
      const cfg = Object.values(tokens).find(t => t.address.toLowerCase() === addr.toLowerCase())
      if (cfg) return cfg.decimals
      try {
        const d = await publicClient.readContract({
          address: addr as Address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        })
        return Number(d)
      } catch {
        return 18
      }
    }
    const inDecimals = await resolveDecimals(tokenInAddress)
    const outDecimals = await resolveDecimals(tokenOutAddress)

    const amountInWei = parseUnits(amountIn, inDecimals)
    
    // Try all fee tiers and find the best quote (highest amountOut)
    let bestQuote: SwapQuote | null = null
    let bestFee = 500 // Default to 0.05%
    
    // Try V3 QuoterV2 for each fee tier
    for (const fee of FEE_TIERS) {
      try {
        const quote = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.QUOTER_V2,
          abi: QUOTER_V2_ABI,
          functionName: 'quoteExactInputSingle',
          args: [{
            tokenIn: tokenInAddress,
            tokenOut: tokenOutAddress,
            amountIn: amountInWei,
            fee: fee,
            sqrtPriceLimitX96: BigInt(0),
          }],
        })
        
        const [amountOut] = quote as [bigint, bigint, number, bigint]
        const amountOutFormatted = formatUnits(amountOut, outDecimals)
        
        const quoteResult: SwapQuote = {
          amountOut: amountOutFormatted,
          priceImpact: 0.1, // Simplified calculation
          minimumReceived: amountOutFormatted,
          fee: fee,
        }
        
        // Keep the quote with the highest output amount
        if (!bestQuote || parseFloat(amountOutFormatted) > parseFloat(bestQuote.amountOut)) {
          bestQuote = quoteResult
          bestFee = fee
        }
      } catch (quoterError) {
        // This fee tier doesn't have a pool or liquidity, continue to next
        continue
      }
    }
    
    // If we found a quote from V3, return it
    if (bestQuote) {
      return bestQuote
    }
    
    // Fallback to V2 router if no V3 pools found
    try {
      const path = [tokenInAddress, tokenOutAddress]
      const amounts = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.ROUTER,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountInWei, path],
      })
      
      const amountOut = formatUnits(amounts[1], outDecimals)
      
      return {
        amountOut,
        priceImpact: 0.1,
        minimumReceived: amountOut,
        fee: 500, // V2 doesn't have fee tiers, use default
      }
    } catch (v2Error) {
      console.error('V2 router also failed:', v2Error)
      throw new Error('No liquidity pool found for this pair across all fee tiers.')
    }
  } catch (error) {
    console.error('Error getting quote:', error)
    throw new Error(`Failed to get swap quote: ${error instanceof Error ? error.message : 'No liquidity pool found'}`)
  }
}

export async function approveToken(
  walletClient: any,
  tokenAddress: string,
  amount: string,
  decimals?: number
): Promise<string> {
  try {
    const amountWei = parseUnits(amount, decimals ?? 18)
    
    const hash = await walletClient.writeContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [CONTRACT_ADDRESSES.ROUTER, amountWei],
    })
    
    return hash
  } catch (error) {
    console.error('Error approving token:', error)
    throw new Error(`Failed to approve token: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function executeSwap(
  walletClient: any,
  publicClient: any,
  params: SwapParams & { decimalsIn?: number; decimalsOut?: number }
): Promise<string> {
  try {
    const { tokenIn, tokenOut, amountIn, slippage, deadline, recipient, decimalsIn, decimalsOut } = params
    
    // Convert BCX zero address to 'BCX' string for getQuote (which then converts to WBCX)
    const tokenInForQuote = (tokenIn === '0x0000000000000000000000000000000000000000' || tokenIn === 'BCX') 
      ? 'BCX' 
      : tokenIn
    const tokenOutForQuote = (tokenOut === '0x0000000000000000000000000000000000000000' || tokenOut === 'BCX') 
      ? 'BCX' 
      : tokenOut
    
    const tokenInAddress = tokenInForQuote === 'BCX' ? tokens.WBCX.address : tokenIn
    const tokenOutAddress = tokenOutForQuote === 'BCX' ? tokens.WBCX.address : tokenOut
    
    // Get quote first (pass 'BCX' string so getQuote can convert to WBCX)
    const quote = await getQuote(publicClient, tokenInForQuote, tokenOutForQuote, amountIn)

    // Determine decimals for in/out tokens if not provided
    let inDecimals = decimalsIn
    let outDecimals = decimalsOut
    const resolveDecimals = async (addr: string): Promise<number> => {
      if (addr === 'BCX') return 18
      try {
        const d = await publicClient.readContract({
          address: addr as Address,
          abi: ERC20_ABI,
          functionName: 'decimals',
        })
        return Number(d)
      } catch {
        return 18
      }
    }
    if (inDecimals === undefined) inDecimals = await resolveDecimals(tokenInAddress)
    if (outDecimals === undefined) outDecimals = await resolveDecimals(tokenOutAddress)

    const amountInWei = parseUnits(amountIn, inDecimals as number)
    const amountOutMin = parseUnits(
      (parseFloat(quote.amountOut) * (1 - slippage / 100)).toString(),
      outDecimals as number
    )
    
    const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60
    // Use fee from quote if available, otherwise default to 500
    const fee = params.fee || quote.fee || 500
    
    // Wrap BCX to WBCX if needed (automatic wrapping like Uniswap)
    if (tokenInForQuote === 'BCX') {
      const wrapHash = await walletClient.writeContract({
        address: tokens.WBCX.address as Address,
        abi: WETH_ABI,
        functionName: 'deposit',
        value: amountInWei,
      })
      await publicClient.waitForTransactionReceipt({ hash: wrapHash })
      
      // After wrapping, we need to approve WBCX for the swap router
      const wbcxAllowance = await publicClient.readContract({
        address: tokens.WBCX.address as Address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [recipient, CONTRACT_ADDRESSES.SWAP_ROUTER],
      })
      
      if (wbcxAllowance < amountInWei) {
        const approveHash = await walletClient.writeContract({
          address: tokens.WBCX.address as Address,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [CONTRACT_ADDRESSES.SWAP_ROUTER, amountInWei],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }
    } else {
      // For non-BCX tokens, check approval (approval should be done in SwapCard, but double-check here)
      const tokenAllowance = await publicClient.readContract({
        address: tokenInAddress as Address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [recipient, CONTRACT_ADDRESSES.SWAP_ROUTER],
      })
      
      if (tokenAllowance < amountInWei) {
        throw new Error(`Insufficient token approval. Please approve ${tokenInForQuote} first.`)
      }
    }
    
    // If swapping to BCX, get WBCX balance before swap to calculate exact amount received
    let wbcxBalanceBefore = BigInt(0)
    if (tokenOutForQuote === 'BCX') {
      wbcxBalanceBefore = await publicClient.readContract({
        address: tokens.WBCX.address as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [recipient],
      })
    }
    
    // Swap tokens (WBCX if BCX was selected, otherwise the selected token)
    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESSES.SWAP_ROUTER,
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [{
        tokenIn: tokenInAddress, // Already WBCX if BCX was selected
        tokenOut: tokenOutAddress, // Already WBCX if BCX was selected
        fee: fee,
        recipient: recipient, // Will receive WBCX if swapping to BCX
        deadline: BigInt(deadlineTimestamp),
        amountIn: amountInWei,
        amountOutMinimum: amountOutMin,
        sqrtPriceLimitX96: BigInt(0),
      }],
    })
    
    // Wait for swap to complete
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    
    // If swapping to BCX, automatically unwrap WBCX to BCX
    if (tokenOutForQuote === 'BCX') {
      // Get WBCX balance after swap
      const wbcxBalanceAfter = await publicClient.readContract({
        address: tokens.WBCX.address as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [recipient],
      })
      
      // Calculate the exact amount of WBCX received from the swap
      const wbcxReceived = wbcxBalanceAfter - wbcxBalanceBefore
      
      // Unwrap only the WBCX received from the swap (user receives native BCX)
      if (wbcxReceived > BigInt(0)) {
        const unwrapHash = await walletClient.writeContract({
          address: tokens.WBCX.address as Address,
          abi: WETH_ABI,
          functionName: 'withdraw',
          args: [wbcxReceived],
        })
        
        // Wait for unwrap to complete
        await publicClient.waitForTransactionReceipt({ hash: unwrapHash })
        
        // Return the unwrap hash as the final transaction (user receives BCX)
        return unwrapHash
      }
    }
    
    return hash
  } catch (error) {
    console.error('Error executing swap:', error)
    throw new Error(`Failed to execute swap: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function getTokenBalance(
  publicClient: any,
  tokenAddress: string,
  userAddress: Address,
  decimals?: number
): Promise<string> {
  try {
    // Handle native BCX (zero address) or BCX string
    if (tokenAddress === 'BCX' || tokenAddress === '0x0000000000000000000000000000000000000000') {
      const balance = await publicClient.getBalance({ address: userAddress })
      return formatUnits(balance, decimals ?? 18)
    }
    
    // Check if it's a valid contract address before calling balanceOf
    if (tokenAddress === '0x0000000000000000000000000000000000000000') {
      return '0'
    }
    
    const balance = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAddress],
    })

    // Determine token decimals if not provided
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

export async function getTokenAllowance(
  publicClient: any,
  tokenAddress: string,
  userAddress: Address,
  decimals?: number
): Promise<string> {
  try {
    const allowance = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [userAddress, CONTRACT_ADDRESSES.ROUTER],
    })

    // Determine token decimals if not provided
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

    return formatUnits(allowance, tokenDecimals as number)
  } catch (error) {
    console.error('Error getting token allowance:', error)
    return '0'
  }
}

export function calculatePriceImpact(
  amountIn: string,
  amountOut: string,
  poolReserves: { reserveIn: string; reserveOut: string }
): number {
  // Simplified price impact calculation
  // In a real implementation, this would use the actual pool reserves
  const inputValue = parseFloat(amountIn)
  const outputValue = parseFloat(amountOut)
  const reserveIn = parseFloat(poolReserves.reserveIn)
  const reserveOut = parseFloat(poolReserves.reserveOut)
  
  const priceBefore = reserveOut / reserveIn
  const priceAfter = outputValue / inputValue
  
  return ((priceAfter - priceBefore) / priceBefore) * 100
}

export async function wrapBCX(
  walletClient: any,
  amount: string
): Promise<string> {
  try {
    const amountWei = parseUnits(amount, 18)
    
    const hash = await walletClient.writeContract({
      address: tokens.WBCX.address as Address,
      abi: WETH_ABI,
      functionName: 'deposit',
      value: amountWei,
    })
    
    return hash
  } catch (error) {
    console.error('Error wrapping BCX:', error)
    throw new Error(`Failed to wrap BCX: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function unwrapWBCX(
  walletClient: any,
  amount: string
): Promise<string> {
  try {
    const amountWei = parseUnits(amount, 18)
    
    const hash = await walletClient.writeContract({
      address: tokens.WBCX.address as Address,
      abi: WETH_ABI,
      functionName: 'withdraw',
      args: [amountWei],
    })
    
    return hash
  } catch (error) {
    console.error('Error unwrapping WBCX:', error)
    throw new Error(`Failed to unwrap WBCX: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export function isWrapUnwrapOperation(tokenIn: Token | null, tokenOut: Token | null): 'wrap' | 'unwrap' | null {
  if (!tokenIn || !tokenOut) return null
  
  if (tokenIn.symbol === 'BCX' && tokenOut.symbol === 'WBCX') {
    return 'wrap'
  }
  
  if (tokenIn.symbol === 'WBCX' && tokenOut.symbol === 'BCX') {
    return 'unwrap'
  }
  
  return null
}
