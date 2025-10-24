'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { PositionService } from '@/services/positionService'
import { formatBalance } from '@/lib/utils'

export default function PositionsPage() {
  const { address: userAddress, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [positions, setPositions] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showIncreaseModal, setShowIncreaseModal] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState<any>(null)
  const [increaseAmount0, setIncreaseAmount0] = useState('0')
  const [increaseAmount1, setIncreaseAmount1] = useState('0')

  const positionService = new PositionService(publicClient, walletClient)

  const fetchPositions = useCallback(async () => {
    if (!userAddress || !publicClient) return

    setIsLoading(true)
    try {
      const userPositions = await positionService.getPositions(userAddress)
      setPositions(userPositions)
    } catch (error) {
      console.error('Error fetching positions:', error)
      setError('Failed to fetch positions')
    } finally {
      setIsLoading(false)
    }
  }, [userAddress, publicClient])

  useEffect(() => {
    fetchPositions()
    const interval = setInterval(fetchPositions, 10000)
    return () => clearInterval(interval)
  }, [fetchPositions])

  const handleOpenIncreaseModal = (position: any) => {
    setSelectedPosition(position)
    setIncreaseAmount0('')
    setIncreaseAmount1('')
    setShowIncreaseModal(true)
  }

  const handleCloseIncreaseModal = () => {
    setShowIncreaseModal(false)
    setSelectedPosition(null)
    setIncreaseAmount0('')
    setIncreaseAmount1('')
  }

  const handleIncreaseLiquidity = async () => {
    if (!walletClient || !userAddress || !selectedPosition || !increaseAmount0 || !increaseAmount1) return

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const txHash = await positionService.increaseLiquidity({
      tokenId: selectedPosition.tokenId,
      amount0Desired: increaseAmount0,
      amount1Desired: increaseAmount1,
      amount0Min: (parseFloat("1")).toString(),
      amount1Min: (parseFloat("1")).toString(),
      deadline: Math.floor(Date.now() / 1000) + 6000, // Set deadline to 6000 seconds from now
      recipient: userAddress,
      })
      setSuccessMessage(`Liquidity increased! Transaction: ${txHash}`)
      handleCloseIncreaseModal()
      fetchPositions()
    } catch (error) {
      console.error('Error increasing liquidity:', error)
      setError(error instanceof Error ? error.message : 'Failed to increase liquidity')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveLiquidity = async (tokenId: string, liquidity: string) => {
    if (!walletClient || !userAddress) return

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const txHash = await positionService.removeLiquidity(
        tokenId,
        liquidity,
        '0',
        '0',
        20,
        userAddress
      )
      
      setSuccessMessage(`Liquidity removed! Transaction: ${txHash}`)
      fetchPositions()
    } catch (error) {
      console.error('Error removing liquidity:', error)
      setError(error instanceof Error ? error.message : 'Failed to remove liquidity')
    } finally {
      setIsLoading(false)
    }
  }

  const handleBurnPosition = async (tokenId: string) => {
    if (!walletClient) return

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const txHash = await positionService.burnPosition(tokenId)
      setSuccessMessage(`Position burned! Transaction: ${txHash}`)
      fetchPositions()
    } catch (error) {
      console.error('Error burning position:', error)
      setError(error instanceof Error ? error.message : 'Failed to burn position')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCollectFees = async (tokenId: string, tokensOwed0: string, tokensOwed1: string) => {
    if (!walletClient || !userAddress) return

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Use the maximum possible values for amount0Max and amount1Max to collect all fees
      const maxUint128 = '340282366920938463463374607431768211455'
      const hash = await positionService.collectFees(tokenId, userAddress, maxUint128, maxUint128)
      setSuccessMessage(`Fees collected! Transaction: ${hash}`)
      await fetchPositions()
    } catch (error) {
      console.error('Error collecting fees:', error)
      setError(error instanceof Error ? error.message : 'Failed to collect fees')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <h1 className="text-2xl font-semibold text-gray-900 mb-4">My Positions</h1>
            <p className="text-gray-600">Please connect your wallet to view your liquidity positions.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">My Positions</h1>
            <button
              onClick={fetchPositions}
              disabled={isLoading}
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-600">{successMessage}</p>
            </div>
          )}

          {isLoading && positions.length === 0 ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Loading positions...</p>
            </div>
          ) : positions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No liquidity positions found.</p>
              <p className="text-sm text-gray-500 mt-2">
                Add liquidity to create your first position.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {positions.map((position) => (
                <div key={position.tokenId} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-medium text-gray-900">
                        Position #{position.tokenId}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {position.token0} / {position.token1} ({(position.fee / 10000).toFixed(2)}%)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-600">Liquidity</p>
                      <p className="font-medium">{formatBalance(position.liquidity)}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <p className="text-sm text-gray-600">Tick Range</p>
                      <p className="font-medium">
                        {position.tickLower} to {position.tickUpper}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Fees Earned</p>
                      <p className="font-medium">
                        {formatBalance(position.tokensOwed0)} / {formatBalance(position.tokensOwed1)}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleOpenIncreaseModal(position)}
                      disabled={isLoading}
                      className="flex-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Increase Liquidity
                    </button>
                    <button
                      onClick={() => handleCollectFees(position.tokenId, position.tokensOwed0, position.tokensOwed1)}
                      disabled={isLoading || (parseFloat(position.tokensOwed0) === 0 && parseFloat(position.tokensOwed1) === 0)}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Collect Fees
                    </button>
                    <button
                      onClick={() => handleRemoveLiquidity(position.tokenId, position.liquidity)}
                      disabled={isLoading}
                      className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Remove Liquidity
                    </button>
                    <button
                      onClick={() => handleBurnPosition(position.tokenId)}
                      disabled={isLoading}
                      className="flex-1 px-3 py-2 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      Burn Position
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Increase Liquidity Modal */}
      {showIncreaseModal && selectedPosition && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Increase Liquidity - Position #{selectedPosition.tokenId}
              </h3>
              <button
                onClick={handleCloseIncreaseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount for Token 0 ({selectedPosition.token0})
                </label>
                <input
                  type="number"
                  value={increaseAmount0}
                  onChange={(e) => setIncreaseAmount0(e.target.value)}
                  placeholder="0.0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount for Token 1 ({selectedPosition.token1})
                </label>
                <input
                  type="number"
                  value={increaseAmount1}
                  onChange={(e) => setIncreaseAmount1(e.target.value)}
                  placeholder="0.0"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCloseIncreaseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleIncreaseLiquidity}
                  disabled={!increaseAmount0 || !increaseAmount1 || isLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isLoading ? 'Increasing...' : 'Increase Liquidity'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
