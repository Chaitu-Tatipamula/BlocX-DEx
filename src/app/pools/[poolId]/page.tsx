'use client'

import React, { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import Link from 'next/link'
import { use } from 'react'
import { PoolService } from '@/services/poolService'
import { PositionService } from '@/services/positionService'
import { PoolDetails } from '@/types/pool'
import { Position } from '@/types/position'
import { formatBalance } from '@/lib/utils'
import { formatPrice, isInRange, getPriceRangeDisplay } from '@/lib/positionAnalysis'
import { Loader2, ArrowLeft, Plus } from 'lucide-react'

export default function PoolDetailPage({ params }: { params: Promise<{ poolId: string }> }) {
  const resolvedParams = use(params)
  const poolAddress = resolvedParams.poolId
  
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const [pool, setPool] = useState<PoolDetails | null>(null)
  const [userPositions, setUserPositions] = useState<Position[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchPoolData() {
      if (!publicClient) return

      setIsLoading(true)
      setError(null)

      try {
        // Note: We need to reverse-lookup the pool info from the address
        // For now, we'll show basic info
        // In production, you'd have better pool discovery mechanisms

      const poolService = new PoolService(publicClient)
      const poolDetails = await poolService.getPoolByAddress(poolAddress)
      
      if (!poolDetails) {
        throw new Error('Pool not found')
      }

      setPool(poolDetails)   
      } catch (err) {
        console.error('Error fetching pool data:', err)
        setError('Failed to load pool details')
      } finally {
        setIsLoading(false)
      }
    }

    fetchPoolData()
  }, [poolAddress, publicClient])

  const getFeeTierLabel = (fee: number): string => {
    return `${(fee / 10000).toFixed(2)}%`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* Back Button */}
          <Link
            href="/pools"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Pools
          </Link>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-gray-600">Loading pool details...</p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="text-center py-12">
              <div className="text-red-500 bg-red-50 p-4 rounded-lg inline-block mb-4">
                {error}
              </div>
              <Link
                href="/pools"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                View all pools →
              </Link>
            </div>
          )}

          {/* Pool Details (when available) */}
          {pool && !isLoading && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 mb-1">
                    {pool.token0.symbol} / {pool.token1.symbol}
                  </h1>
                  <span className="text-sm text-gray-600">
                    Fee Tier: {getFeeTierLabel(pool.fee)}
                  </span>
                </div>
                <Link
                  href={`/liquidity?token0=${pool.token0.address}&token1=${pool.token1.address}&fee=${pool.fee}`}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Liquidity
                </Link>
              </div>

              {/* Pool Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Current Price</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatPrice(pool.currentPrice)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Total Liquidity</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatBalance(pool.liquidity)}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Current Tick</p>
                  <p className="text-xl font-mono text-gray-900">{pool.currentTick}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Pool Address</p>
                  <p className="text-xs font-mono text-gray-700 truncate">
                    {pool.address}
                  </p>
                </div>
              </div>

              {/* User Positions in this Pool */}
              {isConnected && (
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-3">
                    Your Positions
                  </h2>
                  {userPositions.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 rounded-lg">
                      <p className="text-gray-600 mb-2">
                        You don't have any positions in this pool yet
                      </p>
                      <Link
                        href={`/liquidity?token0=${pool.token0.address}&token1=${pool.token1.address}&fee=${pool.fee}`}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        Create a position →
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {userPositions.map((position) => {
                        const inRange = isInRange(
                          pool.currentTick,
                          position.tickLower,
                          position.tickUpper
                        )
                        const priceRange = getPriceRangeDisplay(
                          position.tickLower,
                          position.tickUpper
                        )

                        return (
                          <Link
                            key={position.tokenId}
                            href={`/positions/${position.tokenId}`}
                            className="block border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-gray-900">
                                Position #{position.tokenId}
                              </span>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  inRange
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {inRange ? 'In Range' : 'Out of Range'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-gray-600">Min Price:</span>
                                <span className="ml-1 font-medium">
                                  {formatPrice(priceRange.min)}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">Max Price:</span>
                                <span className="ml-1 font-medium">
                                  {formatPrice(priceRange.max)}
                                </span>
                              </div>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
