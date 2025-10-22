import { parseUnits, formatUnits, type Address } from 'viem'
import { CONTRACT_ADDRESSES, ERC20_ABI, NONFUNGIBLE_POSITION_MANAGER_ABI, FACTORY_ABI, DEFAULT_FEE_TIER } from '@/lib/contracts'

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

export interface PoolInfo {
  exists: boolean
  liquidity: string
  token0: string
  token1: string
  fee: number
}

export class LiquidityService {
  constructor(
    private publicClient: any,
    private walletClient: any
  ) {}

  async getPoolInfo(tokenA: string, tokenB: string): Promise<PoolInfo> {
    try {
      // Handle native BCX token - use WBCX address for pool operations
      const poolTokenA = tokenA === '0x0000000000000000000000000000000000000000' ? CONTRACT_ADDRESSES.WBCX : tokenA
      const poolTokenB = tokenB === '0x0000000000000000000000000000000000000000' ? CONTRACT_ADDRESSES.WBCX : tokenB
      
      const poolAddress = await this.publicClient.readContract({
        address: CONTRACT_ADDRESSES.FACTORY,
        abi: FACTORY_ABI,
        functionName: 'getPool',
        args: [poolTokenA, poolTokenB, DEFAULT_FEE_TIER],
      })

      if (poolAddress === '0x0000000000000000000000000000000000000000') {
        return {
          exists: false,
          liquidity: '0',
          token0: poolTokenA,
          token1: poolTokenB,
          fee: DEFAULT_FEE_TIER,
        }
      }

      try {
        const slot0 = await this.publicClient.readContract({
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
        
        const liquidity = await this.publicClient.readContract({
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
        
        return {
          exists: true,
          liquidity: formatUnits(liquidity, 18),
          token0: poolTokenA,
          token1: poolTokenB,
          fee: DEFAULT_FEE_TIER,
        }
      } catch (slot0Error) {
        return {
          exists: false,
          liquidity: '0',
          token0: poolTokenA,
          token1: poolTokenB,
          fee: DEFAULT_FEE_TIER,
        }
      }
    } catch (error) {
      // Handle native BCX token - use WBCX address for pool operations
      const poolTokenA = tokenA === '0x0000000000000000000000000000000000000000' ? CONTRACT_ADDRESSES.WBCX : tokenA
      const poolTokenB = tokenB === '0x0000000000000000000000000000000000000000' ? CONTRACT_ADDRESSES.WBCX : tokenB
      return {
        exists: false,
        liquidity: '0',
        token0: poolTokenA,
        token1: poolTokenB,
        fee: DEFAULT_FEE_TIER,
      }
    }
  }

  async addLiquidity(params: LiquidityParams): Promise<string> {
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

      // Handle native BCX token - use WBCX address for pool operations
      const poolTokenA = tokenA === '0x0000000000000000000000000000000000000000' ? CONTRACT_ADDRESSES.WBCX : tokenA
      const poolTokenB = tokenB === '0x0000000000000000000000000000000000000000' ? CONTRACT_ADDRESSES.WBCX : tokenB
      
      // Ensure proper token ordering (token0 < token1)
      const [token0, token1] = poolTokenA.toLowerCase() < poolTokenB.toLowerCase() 
        ? [poolTokenA, poolTokenB] 
        : [poolTokenB, poolTokenA]
      
      const amountADesiredWei = parseUnits(amountADesired, 18)
      const amountBDesiredWei = parseUnits(amountBDesired, 18)
      const amountAMinWei = parseUnits(amountAMin, 18)
      const amountBMinWei = parseUnits(amountBMin, 18)
      
      // Adjust amounts based on token ordering
      const [amount0Desired, amount1Desired] = poolTokenA.toLowerCase() < poolTokenB.toLowerCase()
        ? [amountADesiredWei, amountBDesiredWei]
        : [amountBDesiredWei, amountADesiredWei]
      
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60

      // Check if pool exists, create if not
      const poolInfo = await this.getPoolInfo(token0, token1)
      
      if (!poolInfo.exists) {
        const createPoolHash = await this.walletClient.writeContract({
          address: CONTRACT_ADDRESSES.FACTORY,
          abi: FACTORY_ABI,
          functionName: 'createPool',
          args: [token0, token1, DEFAULT_FEE_TIER],
        })
        
        await this.publicClient.waitForTransactionReceipt({ hash: createPoolHash })
        
        const poolAddress = await this.publicClient.readContract({
          address: CONTRACT_ADDRESSES.FACTORY,
          abi: FACTORY_ABI,
          functionName: 'getPool',
          args: [token0, token1, DEFAULT_FEE_TIER],
        })
        
        if (poolAddress === '0x0000000000000000000000000000000000000000') {
          throw new Error('Failed to create pool')
        }
        
        const sqrtPriceX96 = BigInt('79228162514264337593543950336')
        
        const initializeHash = await this.walletClient.writeContract({
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
        
        await this.publicClient.waitForTransactionReceipt({ hash: initializeHash })
      }

      const tickLower = -887200
      const tickUpper = 887200

      // Handle token approvals - for native BCX, we need to wrap to WBCX first
      if (tokenA === '0x0000000000000000000000000000000000000000') {
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
          value: amountADesiredWei,
        })
        await this.publicClient.waitForTransactionReceipt({ hash: wrapHash })
      }
      
      if (tokenB === '0x0000000000000000000000000000000000000000') {
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
          value: amountBDesiredWei,
        })
        await this.publicClient.waitForTransactionReceipt({ hash: wrapHash })
      }

      // Approve tokens
      const tokenAContract = { address: poolTokenA as Address, abi: ERC20_ABI }
      const tokenBContract = { address: poolTokenB as Address, abi: ERC20_ABI }
      
      const allowanceA = await this.publicClient.readContract({
        ...tokenAContract,
        functionName: 'allowance',
        args: [recipient, CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER],
      })
      
      if (allowanceA < amountADesiredWei) {
        const approveHashA = await this.walletClient.writeContract({
          ...tokenAContract,
          functionName: 'approve',
          args: [CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER, amountADesiredWei],
        })
        await this.publicClient.waitForTransactionReceipt({ hash: approveHashA })
      }
      
      const allowanceB = await this.publicClient.readContract({
        ...tokenBContract,
        functionName: 'allowance',
        args: [recipient, CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER],
      })
      
      if (allowanceB < amountBDesiredWei) {
        const approveHashB = await this.walletClient.writeContract({
          ...tokenBContract,
          functionName: 'approve',
          args: [CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER, amountBDesiredWei],
        })
        await this.publicClient.waitForTransactionReceipt({ hash: approveHashB })
      }

      // Mint liquidity position
      const hash = await this.walletClient.writeContract({
        address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'mint',
        args: [{
          token0: token0,
          token1: token1,
          fee: DEFAULT_FEE_TIER,
          tickLower: tickLower,
          tickUpper: tickUpper,
          amount0Desired: amount0Desired,
          amount1Desired: amount1Desired,
          amount0Min: BigInt(0),
          amount1Min: BigInt(0),
          recipient: recipient,
          deadline: BigInt(deadlineTimestamp),
        }],
        value: BigInt(0),
      })

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
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          throw new Error('Insufficient funds for transaction')
        } else if (error.message.includes('user rejected')) {
          throw new Error('Transaction rejected by user')
        } else if (error.message.includes('gas')) {
          throw new Error('Transaction failed due to gas issues')
        } else if (error.message.includes('slippage')) {
          throw new Error('Transaction failed due to slippage tolerance')
        } else {
          throw new Error(`Failed to add liquidity: ${error.message}`)
        }
      } else {
        throw new Error('Failed to add liquidity: Unknown error occurred')
      }
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
