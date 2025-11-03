'use client'

import React, { useState, useEffect } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import Link from 'next/link'
import { PoolService } from '@/services/poolService'
import { PoolDetails } from '@/types/pool'
import { formatBalance } from '@/lib/utils'
import { formatPrice } from '@/lib/positionAnalysis'
import { Loader2, Plus, RefreshCw } from 'lucide-react'

export default function PoolsPage() {
  const { isConnected } = useAccount()
  const publicClient = usePublicClient()

  const [pools, setPools] = useState<PoolDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchPools = async (isRefresh = false) => {
    if (!publicClient) return

    if (isRefresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }
    setError(null)

    try {
      const poolService = new PoolService(publicClient)
      const allPools = await poolService.getAllPools()
      setPools(allPools)
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Error fetching pools:', err)
      setError('Failed to load pools')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchPools()
  }, [publicClient])

  const getFeeTierLabel = (fee: number): string => {
    return `${(fee / 10000).toFixed(2)}%`
  }

  const getFeeTierColor = (fee: number): string => {
    switch (fee) {
      case 100:
        return 'bg-blue-100 text-blue-800'
      case 500:
        return 'bg-green-100 text-green-800'
      case 2500:
        return 'bg-purple-100 text-purple-800'
      case 10000:
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Liquidity Pools</h1>
              <p className="text-sm text-gray-600 mt-1">
                Browse and add liquidity to trading pools
                {lastUpdated && (
                  <span className="ml-2 text-xs text-gray-500">
                    Last updated: {lastUpdated.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => fetchPools(true)}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
              <Link
                href="/liquidity"
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Position
              </Link>
            </div>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-gray-600">Loading pools...</p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="text-center py-12">
              <div className="text-red-500 bg-red-50 p-4 rounded-lg inline-block">
                {error}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!isLoading && !error && pools.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <svg
                  className="w-16 h-16 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                  />
                </svg>
              </div>
              <p className="text-gray-600 mb-4">No liquidity pools found</p>
              <Link
                href="/liquidity"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                Create the first pool →
              </Link>
            </div>
          )}

          {/* Pools Grid */}
          {!isLoading && !error && pools.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pools.map((pool, index) => (
                <div
                  key={`${pool.address}-${index}`}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  {/* Token Pair */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-white flex items-center justify-center text-white text-xs font-bold">
                          {pool.token0.symbol.substring(0, 1)}
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 border-2 border-white flex items-center justify-center text-white text-xs font-bold">
                          {pool.token1.symbol.substring(0, 1)}
                        </div>
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {pool.token0.symbol} / {pool.token1.symbol}
                        </h3>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getFeeTierColor(
                        pool.fee
                      )}`}
                    >
                      {getFeeTierLabel(pool.fee)}
                    </span>
                  </div>

                  {/* Pool Stats */}
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Current Price:</span>
                      <span className="font-medium text-gray-900">
                        {formatPrice(pool.currentPrice)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Liquidity:</span>
                      <span className="font-medium text-gray-900">
                        {formatBalance(pool.liquidity)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Current Tick:</span>
                      <span className="font-mono text-xs text-gray-700">
                        {pool.currentTick}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Link
                      href={`/pools/${pool.address}`}
                      className="flex-1 px-3 py-2 text-center border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      View Pool
                    </Link>
                    <Link
                      href={`/liquidity?token0=${pool.token0.address}&token1=${pool.token1.address}&fee=${pool.fee}`}
                      className="flex-1 px-3 py-2 text-center bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      Add Liquidity
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pool Count */}
          {!isLoading && !error && pools.length > 0 && (
            <div className="mt-6 text-center text-sm text-gray-500">
              Showing {pools.length} {pools.length === 1 ? 'pool' : 'pools'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
