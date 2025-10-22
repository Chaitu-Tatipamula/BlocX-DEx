import { parseUnits, formatUnits, type Address } from 'viem'
import { CONTRACT_ADDRESSES, ROUTER_ABI, SWAP_ROUTER_ABI, QUOTER_V2_ABI, ERC20_ABI, WETH_ABI } from './contracts'
import { tokens } from '../config/tokens'

export interface SwapParams {
  tokenIn: string
  tokenOut: string
  amountIn: string
  slippage: number
  deadline: number
  recipient: Address
}

export interface SwapQuote {
  amountOut: string
  priceImpact: number
  minimumReceived: string
}

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
      }
    }
    
    // Use QuoterV2 for PancakeSwap V3 quotes
    const amountInWei = parseUnits(amountIn, 18)
    const fee = 500 // 0.05% fee tier
    
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
      const amountOutFormatted = formatUnits(amountOut, 18)
      
      return {
        amountOut: amountOutFormatted,
        priceImpact: 0.1, // Simplified calculation
        minimumReceived: amountOutFormatted,
      }
    } catch (quoterError) {
      console.log('QuoterV2 failed, trying V2 router...')
      
      // Fallback to V2 router if V3 pool doesn't exist
      const path = [tokenInAddress, tokenOutAddress]
      const amounts = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.ROUTER,
        abi: ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [amountInWei, path],
      })
      
      const amountOut = formatUnits(amounts[1], 18)
      
      return {
        amountOut,
        priceImpact: 0.1,
        minimumReceived: amountOut,
      }
    }
  } catch (error) {
    console.error('Error getting quote:', error)
    throw new Error(`Failed to get swap quote: ${error instanceof Error ? error.message : 'No liquidity pool found'}`)
  }
}

export async function approveToken(
  walletClient: any,
  tokenAddress: string,
  amount: string
): Promise<string> {
  try {
    const amountWei = parseUnits(amount, 18)
    
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
  params: SwapParams
): Promise<string> {
  try {
    const { tokenIn, tokenOut, amountIn, slippage, deadline, recipient } = params
    
    const tokenInAddress = tokenIn === 'BCX' ? tokens.WBCX.address : tokenIn
    const tokenOutAddress = tokenOut === 'BCX' ? tokens.WBCX.address : tokenOut
    
    // Get quote first
    const quote = await getQuote(publicClient, tokenIn, tokenOut, amountIn)
    const amountInWei = parseUnits(amountIn, 18)
    const amountOutMin = parseUnits(
      (parseFloat(quote.amountOut) * (1 - slippage / 100)).toString(),
      18
    )
    
    const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60
    const fee = 500 // 0.05% fee tier
    
    let hash: string
    
    if (tokenIn === 'BCX') {
      // Swap native BCX for tokens using exactInputSingle
      hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.SWAP_ROUTER,
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: tokenInAddress,
          tokenOut: tokenOutAddress,
          fee: fee,
          recipient: recipient,
          deadline: BigInt(deadlineTimestamp),
          amountIn: amountInWei,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: BigInt(0),
        }],
        value: amountInWei,
      })
    } else {
      // Swap tokens for tokens/BCX using exactInputSingle
      hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.SWAP_ROUTER,
        abi: SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: [{
          tokenIn: tokenInAddress,
          tokenOut: tokenOutAddress,
          fee: fee,
          recipient: recipient,
          deadline: BigInt(deadlineTimestamp),
          amountIn: amountInWei,
          amountOutMinimum: amountOutMin,
          sqrtPriceLimitX96: BigInt(0),
        }],
      })
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
  userAddress: Address
): Promise<string> {
  try {
    // Handle native BCX (zero address) or BCX string
    if (tokenAddress === 'BCX' || tokenAddress === '0x0000000000000000000000000000000000000000') {
      const balance = await publicClient.getBalance({ address: userAddress })
      return formatUnits(balance, 18)
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
    
    return formatUnits(balance, 18)
  } catch (error) {
    console.error('Error getting token balance:', error)
    return '0'
  }
}

export async function getTokenAllowance(
  publicClient: any,
  tokenAddress: string,
  userAddress: Address
): Promise<string> {
  try {
    const allowance = await publicClient.readContract({
      address: tokenAddress as Address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [userAddress, CONTRACT_ADDRESSES.ROUTER],
    })
    
    return formatUnits(allowance, 18)
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
