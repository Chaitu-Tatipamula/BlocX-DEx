import { parseUnits, formatUnits, type Address } from 'viem'
import { CONTRACT_ADDRESSES, ROUTER_ABI, SWAP_ROUTER_ABI, QUOTER_V2_ABI, ERC20_ABI } from '@/lib/contracts'
import { tokens } from '@/config/tokens'

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

export class SwapService {
  constructor(
    private publicClient: any,
    private walletClient: any
  ) {}

  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<SwapQuote> {
    try {
      
      // Handle native BCX token (zero address) - use WBCX address for swaps
      let tokenInAddress = tokenIn === '0x0000000000000000000000000000000000000000' ? tokens.WBCX.address : tokenIn
      let tokenOutAddress = tokenOut === '0x0000000000000000000000000000000000000000' ? tokens.WBCX.address : tokenOut
      
      // If we received a symbol instead of an address, try to map it
      if (tokenIn === 'WBCX' || tokenIn === 'BCX') {
        tokenInAddress = tokens.WBCX.address
      } else if (tokenIn === 'TEST') {
        tokenInAddress = tokens.TEST.address
      } else if (tokenIn === 'FRESH') {
        tokenInAddress = tokens.FRESH.address
      }
      
      if (tokenOut === 'WBCX' || tokenOut === 'BCX') {
        tokenOutAddress = tokens.WBCX.address
      } else if (tokenOut === 'TEST') {
        tokenOutAddress = tokens.TEST.address
      } else if (tokenOut === 'FRESH') {
        tokenOutAddress = tokens.FRESH.address
      }
      
      
      if (tokenInAddress === tokenOutAddress) {
        return {
          amountOut: amountIn,
          priceImpact: 0,
          minimumReceived: amountIn,
        }
      }
      
      const amountInWei = parseUnits(amountIn, 18)
      const fee = 500 // 0.05% fee tier
      
      // Validate addresses before making contract calls
      if (!tokenInAddress.startsWith('0x') || tokenInAddress.length !== 42) {
        throw new Error(`Invalid tokenIn address: ${tokenInAddress}`)
      }
      if (!tokenOutAddress.startsWith('0x') || tokenOutAddress.length !== 42) {
        throw new Error(`Invalid tokenOut address: ${tokenOutAddress}`)
      }
      
      try {
        const quote = await this.publicClient.readContract({
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
          priceImpact: 0.1,
          minimumReceived: amountOutFormatted,
        }
      } catch (quoterError) {
        
        try {
          const path = [tokenInAddress, tokenOutAddress]
          const amounts = await this.publicClient.readContract({
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
        } catch (v2Error) {
          throw new Error('Both QuoterV2 and V2 router failed to get quote')
        }
      }
    } catch (error) {
      throw new Error(`Failed to get swap quote: ${error instanceof Error ? error.message : 'No liquidity pool found'}`)
    }
  }

  async executeSwap(params: SwapParams): Promise<string> {
    try {
      const { tokenIn, tokenOut, amountIn, slippage, deadline, recipient } = params
      
      // Handle native BCX token (zero address) - use WBCX address for swaps
      let tokenInAddress = tokenIn === '0x0000000000000000000000000000000000000000' ? tokens.WBCX.address : tokenIn
      let tokenOutAddress = tokenOut === '0x0000000000000000000000000000000000000000' ? tokens.WBCX.address : tokenOut
      
      // If we received a symbol instead of an address, try to map it
      if (tokenIn === 'WBCX' || tokenIn === 'BCX') {
        tokenInAddress = tokens.WBCX.address
      } else if (tokenIn === 'TEST') {
        tokenInAddress = tokens.TEST.address
      } else if (tokenIn === 'FRESH') {
        tokenInAddress = tokens.FRESH.address
      }
      
      if (tokenOut === 'WBCX' || tokenOut === 'BCX') {
        tokenOutAddress = tokens.WBCX.address
      } else if (tokenOut === 'TEST') {
        tokenOutAddress = tokens.TEST.address
      } else if (tokenOut === 'FRESH') {
        tokenOutAddress = tokens.FRESH.address
      }
      
      const quote = await this.getQuote(tokenIn, tokenOut, amountIn)
      const amountInWei = parseUnits(amountIn, 18)
      const amountOutMin = parseUnits(
        (parseFloat(quote.amountOut) * (1 - slippage / 100)).toString(),
        18
      )
      
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60
      const fee = 500 // 0.05% fee tier
      
      
      let hash: string
      
      // Handle native BCX token - wrap to WBCX first
      if (tokenIn === '0x0000000000000000000000000000000000000000') {
        // For native BCX, wrap to WBCX first
        const wrapHash = await this.walletClient.writeContract({
          address: CONTRACT_ADDRESSES.WBCX,
          abi: [
            {
              inputs: [],
              name: 'deposit',
              outputs: [],
              stateMutability: 'payable',
              type: 'function',
            },
          ],
          functionName: 'deposit',
          value: amountInWei,
        })
        await this.publicClient.waitForTransactionReceipt({ hash: wrapHash })
      } else {
        // For ERC20 tokens, approve the swap router to spend tokens
        const tokenContract = { address: tokenInAddress as Address, abi: ERC20_ABI }
        
        const allowance = await this.publicClient.readContract({
          ...tokenContract,
          functionName: 'allowance',
          args: [recipient, CONTRACT_ADDRESSES.SWAP_ROUTER],
        })
        
        if (allowance < amountInWei) {
          const approveHash = await this.walletClient.writeContract({
            ...tokenContract,
            functionName: 'approve',
            args: [CONTRACT_ADDRESSES.SWAP_ROUTER, amountInWei],
          })
          await this.publicClient.waitForTransactionReceipt({ hash: approveHash })
        }
      }
      
      // Try V3 router first, fallback to V2 if needed
      try {
        hash = await this.walletClient.writeContract({
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
      } catch (v3Error) {
        
        // Fallback to V2 router
        const path = [tokenInAddress, tokenOutAddress]
        hash = await this.walletClient.writeContract({
          address: CONTRACT_ADDRESSES.ROUTER,
          abi: ROUTER_ABI,
          functionName: 'swapExactTokensForTokens',
          args: [
            amountInWei,
            amountOutMin,
            path,
            recipient,
            BigInt(deadlineTimestamp)
          ],
        })
      }
      
      // Wait for transaction confirmation with timeout
      const receipt = await this.publicClient.waitForTransactionReceipt({ 
        hash,
        timeout: 120000 // 2 minutes timeout
      })
      
      // Check if transaction was successful
      if (receipt.status !== 'success') {
        throw new Error('Transaction failed during execution')
      }
      
      return hash
    } catch (error) {
      throw new Error(`Failed to execute swap: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  async getTokenBalance(tokenAddress: string, userAddress: Address): Promise<string> {
    try {
      // Handle empty or invalid addresses
      if (!tokenAddress || tokenAddress === '' || tokenAddress === '0x0000000000000000000000000000000000000000') {
        return '0'
      }
      
      // Handle native BCX token
      if (tokenAddress === 'BCX') {
        const balance = await this.publicClient.getBalance({ address: userAddress })
        return formatUnits(balance, 18)
      }
      
      // Validate address format (should be 42 characters starting with 0x)
      if (!tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
        return '0'
      }
      
      const balance = await this.publicClient.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      })
      
      return formatUnits(balance, 18)
    } catch (error) {
      return '0'
    }
  }
}
