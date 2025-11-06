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
import { useTx } from '@/context/tx'

export default function PoolDetailPage({ params }: { params: Promise<{ poolId: string }> }) {
  const resolvedParams = use(params)
  const poolAddress = resolvedParams.poolId
  
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()

  const { addError } = useTx()
  const [pool, setPool] = useState<PoolDetails | null>(null)
  const [userPositions, setUserPositions] = useState<Position[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchPoolData() {
      if (!publicClient) return

      setIsLoading(true)

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
        addError({ title: 'Failed to Load Pool', message: err instanceof Error ? err.message : 'Failed to load pool details' })
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
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="glass-card p-6">
          {/* Back Button */}
          <Link
            href="/pools"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Pools
          </Link>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-white mx-auto mb-2" />
              <p className="text-white/70">Loading pool details...</p>
            </div>
          )}


          {/* Pool Details (when available) */}
          {pool && !isLoading && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {/* Token Logos */}
                  <div className="flex -space-x-2">
                    <div className="relative w-10 h-10">
                      {pool.token0.logoURI ? (
                        <div className="w-10 h-10 rounded-full bg-white p-0.5 border-2 border-white/20">
                          <img
                            src={pool.token0.logoURI}
                            alt={pool.token0.symbol}
                            className="w-full h-full rounded-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              const fallback = target.parentElement?.nextElementSibling as HTMLElement
                              if (fallback) fallback.style.display = 'flex'
                            }}
                          />
                        </div>
                      ) : null}
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-white/20 flex items-center justify-center text-white text-sm font-bold ${pool.token0.logoURI ? 'absolute inset-0 hidden' : ''}`}>
                        {pool.token0.symbol.substring(0, 1)}
                      </div>
                    </div>
                    <div className="relative w-10 h-10">
                      {pool.token1.logoURI ? (
                        <div className="w-10 h-10 rounded-full bg-white p-0.5 border-2 border-white/20">
                          <img
                            src={pool.token1.logoURI}
                            alt={pool.token1.symbol}
                            className="w-full h-full rounded-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement
                              target.style.display = 'none'
                              const fallback = target.parentElement?.nextElementSibling as HTMLElement
                              if (fallback) fallback.style.display = 'flex'
                            }}
                          />
                        </div>
                      ) : null}
                      <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 border-2 border-white/20 flex items-center justify-center text-white text-sm font-bold ${pool.token1.logoURI ? 'absolute inset-0 hidden' : ''}`}>
                        {pool.token1.symbol.substring(0, 1)}
                      </div>
                    </div>
                  </div>
                  <div>
                    <h1 className="text-2xl font-semibold text-white mb-1">
                      {pool.token0.symbol} / {pool.token1.symbol}
                    </h1>
                    <span className="text-sm text-white/70">
                      Fee Tier: {getFeeTierLabel(pool.fee)}
                    </span>
                  </div>
                </div>
                <Link
                  href={`/liquidity?token0=${pool.token0.address}&token1=${pool.token1.address}&fee=${pool.fee}`}
                  className="glass-button-primary flex items-center gap-2 px-4 py-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Liquidity
                </Link>
              </div>

              {/* Pool Stats */}
              <div className="grid grid-cols-2 gap-4">
                <div className="glass-card rounded-lg p-4 border border-white/10">
                  <p className="text-sm text-white/70 mb-1">Current Price</p>
                  <p className="text-2xl font-semibold text-white break-words overflow-wrap-anywhere">
                    {formatPrice(pool.currentPrice)}
                  </p>
                </div>
                <div className="glass-card rounded-lg p-4 border border-white/10">
                  <p className="text-sm text-white/70 mb-1">Total Liquidity</p>
                  <p className="text-2xl font-semibold text-white break-words overflow-wrap-anywhere">
                    {formatBalance(pool.liquidity)}
                  </p>
                </div>
                <div className="glass-card rounded-lg p-4 border border-white/10">
                  <p className="text-sm text-white/70 mb-1">Current Tick</p>
                  <p className="text-xl font-mono text-white break-all">{pool.currentTick}</p>
                </div>
                <div className="glass-card rounded-lg p-4 border border-white/10">
                  <p className="text-sm text-white/70 mb-1">Pool Address</p>
                  <p className="text-xs font-mono text-white/70 break-all">
                    {pool.address}
                  </p>
                </div>
              </div>

              {/* User Positions in this Pool */}
              {isConnected && (
                <div>
                  <h2 className="text-lg font-semibold text-white mb-3">
                    Your Positions
                  </h2>
                  {userPositions.length === 0 ? (
                    <div className="text-center py-8 glass-card rounded-lg border border-white/10">
                      <p className="text-white/70 mb-2">
                        You don't have any positions in this pool yet
                      </p>
                      <Link
                        href={`/liquidity?token0=${pool.token0.address}&token1=${pool.token1.address}&fee=${pool.fee}`}
                        className="text-white hover:text-white/80 font-medium"
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
                            className="block glass-card border border-white/10 rounded-lg p-4 hover:border-white/20 transition-all"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-white">
                                Position #{position.tokenId}
                              </span>
                              <span
                                className={`px-2 py-1 rounded-full text-xs font-medium glass-card border ${
                                  inRange
                                    ? 'border-green-500/30 text-green-400'
                                    : 'border-yellow-500/30 text-yellow-400'
                                }`}
                              >
                                {inRange ? 'In Range' : 'Out of Range'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="text-white/70">Min Price:</span>
                                <span className="ml-1 font-medium text-white">
                                  {formatPrice(priceRange.min)}
                                </span>
                              </div>
                              <div>
                                <span className="text-white/70">Max Price:</span>
                                <span className="ml-1 font-medium text-white">
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
