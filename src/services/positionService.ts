import { parseUnits, formatUnits, type Address } from 'viem'
import { CONTRACT_ADDRESSES, NONFUNGIBLE_POSITION_MANAGER_ABI, ERC20_ABI } from '@/lib/contracts'

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

      const positions = []
      const balanceNum = Number(balance)

      for (let i = 0; i < balanceNum; i++) {
        try {
          const tokenId = await this.publicClient.readContract({
            address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
            abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
            functionName: 'tokenOfOwnerByIndex',
            args: [userAddress, BigInt(i)],
          })

          const position = await this.publicClient.readContract({
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
        }
      }

      return positions
    } catch (error) {
      return []
    }
  }

  async increaseLiquidity(params: IncreaseLiquidityParams): Promise<string> {
    try {
      const { tokenId, amount0Desired, amount1Desired, amount0Min, amount1Min, deadline, recipient } = params
      const amount0DesiredWei = parseUnits(amount0Desired, 18)
      const amount1DesiredWei = parseUnits(amount1Desired, 18)
      const amount0MinWei = parseUnits(amount0Min, 18)
      const amount1MinWei = parseUnits(amount1Min, 18)
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60

      // First, get the position details to know which tokens to approve
      const position = await this.publicClient.readContract({
        address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'positions',
        args: [BigInt(tokenId)],
      })

      const [, , token0, token1] = position as any[]

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
      throw new Error(`Failed to increase liquidity: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
}
