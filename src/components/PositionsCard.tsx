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
        addTx({ hash: hash as string, title:  position.liquidity > 0 ? 'Liquidity Decreased' : 'Create Pool & Add Liquidity' });
        
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
      <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-gray-200 p-6">
        <h2 className="text-xl font-semibold mb-4">Your Liquidity Positions</h2>
        <p className="text-gray-500 text-center">Connect your wallet to view positions</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-200">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Your Liquidity Positions</h2>
          <button
            onClick={fetchPositions}
            disabled={isLoading}
            className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-50"
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
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="ml-2">Loading positions...</span>
          </div>
        ) : positions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">No liquidity positions found</p>
            <p className="text-sm text-gray-400">
              Add liquidity to token pairs to start earning fees
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {positions.map((position) => (
              <div
                key={position.tokenId}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-medium">
                        {position.token0} / {position.token1}
                      </span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                        {position.fee / 10000}%
                      </span>
                    </div>
                    <div className="text-sm text-gray-500">
                      Range: {position.tickLower} to {position.tickUpper}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIncreasingPosition(increasingPosition === position.tokenId ? null : position.tokenId)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                      title="Increase liquidity"
                    >
                      <span className="text-sm font-medium">+</span>
                    </button>
                    <button
                      onClick={() => handleRemoveLiquidity(position.tokenId)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                      title="Remove liquidity"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {/* Increase Liquidity Form */}
                {increasingPosition === position.tokenId && (
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-900 mb-3">Increase Liquidity</h4>
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Amount for {position.token0}
                        </label>
                        <input
                          type="number"
                          placeholder="0.0"
                          value={increaseAmount0}
                          onChange={(e) => setIncreaseAmount0(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Amount for {position.token1}
                        </label>
                        <input
                          type="number"
                          placeholder="0.0"
                          value={increaseAmount1}
                          onChange={(e) => setIncreaseAmount1(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleIncreaseLiquidity(position.tokenId)}
                          disabled={increasingPosition === position.tokenId && (!increaseAmount0 || !increaseAmount1)}
                          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {increasingPosition === position.tokenId ? 'Increasing...' : 'Increase Liquidity'}
                        </button>
                        <button
                          onClick={() => {
                            setIncreasingPosition(null)
                            setIncreaseAmount0('')
                            setIncreaseAmount1('')
                          }}
                          className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
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
              <div className="text-sm text-red-500 bg-red-50 border border-red-200 p-2 rounded truncate">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}
