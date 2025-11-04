'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { Trash2, Eye, Loader2 } from 'lucide-react'
import { getLiquidityPositions, removeLiquidity, increaseLiquidity } from '@/lib/liquidity'
import { formatBalance } from '@/lib/utils'
import { useTx } from '@/context/tx'
interface LiquidityPosition {
  tokenId: string
  token0: string
  token1: string
  liquidity: string
  fee: number
  tickLower: number
  tickUpper: number
}

const DEADLINE_MINUTES = 20
const MIN_SLIPPAGE = 0

export function PositionsCard() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { addTx } = useTx()

  const [positions, setPositions] = useState<LiquidityPosition[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [increasingPosition, setIncreasingPosition] = useState<string | null>(null)
  const [increaseAmount0, setIncreaseAmount0] = useState('')
  const [increaseAmount1, setIncreaseAmount1] = useState('')

  const fetchPositions = useCallback(async () => {
    if (!address || !publicClient) return

    setIsLoading(true)
    setError('')

    try {
      const userPositions = await getLiquidityPositions(publicClient, address)
      setPositions(userPositions)
    } catch (err: any) {
      setError('Failed to fetch positions')
      console.error('Error fetching positions:', err)
    } finally {
      setIsLoading(false)
    }
  }, [address, publicClient])

  useEffect(() => {
    fetchPositions()
  }, [fetchPositions])

  const handleIncreaseLiquidity = async (tokenId: string) => {
    if (!address || !walletClient || !publicClient) {
      setError('Please connect your wallet')
      return
    }

    if (!increaseAmount0 || !increaseAmount1) {
      setError('Please enter amounts for both tokens')
      return
    }

    try {
      setIncreasingPosition(tokenId)
      setError('')

      const hash = await increaseLiquidity(walletClient, publicClient, {
        tokenId,
        amount0Desired: increaseAmount0,
        amount1Desired: increaseAmount1,
        amount0Min: MIN_SLIPPAGE.toString(),
        amount1Min: MIN_SLIPPAGE.toString(),
        deadline: DEADLINE_MINUTES,
      })
      if (hash) {
        addTx({ hash: hash as string, title: increasingPosition ? 'Liquidity Increased' : 'Create Pool & Add Liquidity' });
        
      }

      await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
      
      // Clear form and refresh positions
      setIncreaseAmount0('')
      setIncreaseAmount1('')
      setIncreasingPosition(null)
      fetchPositions()
      
    } catch (err: any) {
      setError(err.message || 'Failed to increase liquidity')
      setIncreasingPosition(null)
    }
  }

  const handleRemoveLiquidity = async (tokenId: string) => {
    if (!address || !walletClient || !publicClient) {
      setError('Please connect your wallet')
      return
    }

    try {
      // Find the position to get its liquidity amount
      const position = positions.find(p => p.tokenId === tokenId)
      if (!position) {
        setError('Position not found')
        return
      }

      const hash = await removeLiquidity(
        walletClient,
        publicClient,
        tokenId,
        position.liquidity, // Use actual liquidity amount
        MIN_SLIPPAGE.toString(), // Minimum amount0
        MIN_SLIPPAGE.toString(), // Minimum amount1
        DEADLINE_MINUTES, // 20 minutes deadline
        address
      )
      if (hash) {
        const hasLiquidity = BigInt(position.liquidity) > BigInt(0)
        addTx({ hash: hash as string, title: hasLiquidity ? 'Liquidity Decreased' : 'Create Pool & Add Liquidity' });
        
      }
      await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
      
      // Refresh positions
      fetchPositions()
      
    } catch (err: any) {
      setError(err.message || 'Failed to remove liquidity')
    }
  }

  if (!isConnected) {
    return (
      <div className="w-full max-w-md mx-auto glass-card p-6">
        <h2 className="text-xl font-semibold mb-4 text-white">Your Liquidity Positions</h2>
        <p className="text-white/70 text-center">Connect your wallet to view positions</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto glass-card">
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Your Liquidity Positions</h2>
          <button
            onClick={fetchPositions}
            disabled={isLoading}
            className="p-2 hover:bg-white/10 rounded-full disabled:opacity-50 text-white transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Eye className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* Positions List */}
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-white" />
            <span className="ml-2 text-white">Loading positions...</span>
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/70 mb-4">No liquidity positions found</p>
            <p className="text-sm text-white/50">
              Add liquidity to token pairs to start earning fees
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {positions.map((position) => (
              <div
                key={position.tokenId}
                className="border border-white/10 rounded-xl p-4 hover:bg-white/5 transition-colors glass-card"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium text-white">
                        {position.token0} / {position.token1}
                      </span>
                      <span className="text-xs bg-white/10 text-white px-2 py-1 rounded-lg border border-white/20">
                        {position.fee / 10000}%
                      </span>
                    </div>
                    <div className="text-sm text-white/60">
                      Range: {position.tickLower} to {position.tickUpper}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIncreasingPosition(increasingPosition === position.tokenId ? null : position.tokenId)}
                      className="p-2 text-white hover:bg-white/10 rounded-full transition-colors border border-white/20"
                      title="Increase liquidity"
                    >
                      <span className="text-sm font-medium">+</span>
                    </button>
                    <button
                      onClick={() => handleRemoveLiquidity(position.tokenId)}
                      className="p-2 text-white hover:bg-white/10 rounded-full transition-colors border border-white/20"
                      title="Remove liquidity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {/* Increase Liquidity Form */}
                {increasingPosition === position.tokenId && (
                  <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10 glass-card">
                    <h4 className="font-medium text-white mb-3">Increase Liquidity</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">
                          Amount for {position.token0}
                        </label>
                        <input
                          type="number"
                          placeholder="0.0"
                          value={increaseAmount0}
                          onChange={(e) => setIncreaseAmount0(e.target.value)}
                          className="glass-input w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white/70 mb-1">
                          Amount for {position.token1}
                        </label>
                        <input
                          type="number"
                          placeholder="0.0"
                          value={increaseAmount1}
                          onChange={(e) => setIncreaseAmount1(e.target.value)}
                          className="glass-input w-full"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleIncreaseLiquidity(position.tokenId)}
                          disabled={increasingPosition === position.tokenId && (!increaseAmount0 || !increaseAmount1)}
                          className="flex-1 glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {increasingPosition === position.tokenId ? 'Increasing...' : 'Increase Liquidity'}
                        </button>
                        <button
                          onClick={() => {
                            setIncreasingPosition(null)
                            setIncreaseAmount0('')
                            setIncreaseAmount1('')
                          }}
                          className="px-4 py-2 glass-button"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Error Message */}
        {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded-lg truncate glass-card">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
