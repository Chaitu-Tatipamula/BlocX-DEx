'use client'

import React, { useState, useEffect } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import Link from 'next/link'
import { use } from 'react'
import { PositionService } from '@/services/positionService'
import { PoolService } from '@/services/poolService'
import { PositionDetails } from '@/types/position'
import { formatBalance } from '@/lib/utils'
import { 
  formatPrice, 
  isInRange, 
  getPriceRangeDisplay, 
  getTokenAmounts, 
  estimateAPR, 
  calculateShareOfPool,
  getPositionStatusBadge 
} from '@/lib/positionAnalysis'
import { Loader2, ArrowLeft, TrendingUp, RefreshCw } from 'lucide-react'

export default function PositionDetailPage({ params }: { params: Promise<{ tokenId: string }> }) {
  const resolvedParams = use(params)
  const tokenId = resolvedParams.tokenId
  
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [position, setPosition] = useState<PositionDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchPositionDetails = async (isRefresh = false) => {
    if (!address || !publicClient) return

    if (isRefresh) {
      setIsRefreshing(false)
    } else {
      setIsLoading(true)
    }
    setError(null)

    try {
      const positionService = new PositionService(publicClient, walletClient)
      const positions = await positionService.getPositions(address)
      const foundPosition = positions.find(p => p.tokenId === tokenId)

      if (!foundPosition) {
        setError('Position not found or you do not own this position')
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }

      // Enhance with pool data
      const poolService = new PoolService(publicClient)
      const pool = await poolService.getPoolDetails(
        foundPosition.token0,
        foundPosition.token1,
        foundPosition.fee
      )

      if (pool) {
        const inRange = isInRange(pool.currentTick, foundPosition.tickLower, foundPosition.tickUpper)
        const priceRange = getPriceRangeDisplay(foundPosition.tickLower, foundPosition.tickUpper)
        const amounts = getTokenAmounts(
          foundPosition.liquidity,
          pool.currentTick,
          foundPosition.tickLower,
          foundPosition.tickUpper
        )
        
        const amount0Num = parseFloat(amounts.amount0)
        const amount1Num = parseFloat(amounts.amount1)
        
        // Divide by 10^decimals to convert from calculated units to human-readable
        const formattedAmount0 = amount0Num > 0 
          ? formatBalance((amount0Num / Math.pow(10, pool.token0.decimals)).toString(), pool.token0.decimals)
          : '0'
        const formattedAmount1 = amount1Num > 0
          ? formatBalance((amount1Num / Math.pow(10, pool.token1.decimals)).toString(), pool.token1.decimals)
          : '0'
        
        const apr = estimateAPR(foundPosition, foundPosition.fee, '0')
        const shareOfPool = calculateShareOfPool(foundPosition.liquidity, pool.liquidity)

        setPosition({
          ...foundPosition,
          inRange,
          amount0: formattedAmount0,
          amount1: formattedAmount1,
          estimatedAPR: apr,
          shareOfPool,
          priceRangeLower: priceRange.min,
          priceRangeUpper: priceRange.max,
          currentPrice: pool.currentPrice,
          poolAddress: pool.address,
        })
      }
      
      setLastUpdated(new Date())
    } catch (err) {
      console.error('Error fetching position details:', err)
      setError('Failed to load position details')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
      if (!address || !publicClient) return

    fetchPositionDetails()
  }, [tokenId, address])

  const handleCollectFees = async () => {
    if (!walletClient || !address || !position) return

    setActionLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const positionService = new PositionService(publicClient, walletClient)
      const maxUint128 = '340282366920938463463374607431768211455'
      const hash = await positionService.collectFees(tokenId, address, maxUint128, maxUint128)
      setSuccessMessage(`Fees collected! Transaction: ${hash}`)
    } catch (error) {
      console.error('Error collecting fees:', error)
      setError(error instanceof Error ? error.message : 'Failed to collect fees')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRemoveLiquidity = async () => {
    if (!walletClient || !address || !position) return

    setActionLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const positionService = new PositionService(publicClient, walletClient)
      const hash = await positionService.removeLiquidity(
        tokenId,
        position.liquidity,
        '0',
        '0',
        20,
        address
      )
      setSuccessMessage(`Liquidity removed! Transaction: ${hash}`)
    } catch (error) {
      console.error('Error removing liquidity:', error)
      setError(error instanceof Error ? error.message : 'Failed to remove liquidity')
    } finally {
      setActionLoading(false)
    }
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
            <p className="text-gray-600">Please connect your wallet to view position details.</p>
          </div>
        </div>
      </div>
    )
  }

  const statusBadge = position ? getPositionStatusBadge(position.inRange) : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* Back Button */}
          <Link
            href="/positions"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Positions
          </Link>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-gray-600">Loading position details...</p>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="text-center py-12">
              <div className="text-red-500 bg-red-50 p-4 rounded-lg inline-block mb-4">
                {error}
              </div>
              <Link
                href="/positions"
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                View all positions →
              </Link>
            </div>
          )}

          {/* Position Details */}
          {position && !isLoading && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                    Position #{position.tokenId}
                  </h1>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-600">
                      {position.token0.substring(0, 8)}... / {position.token1.substring(0, 8)}...
                    </span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full">
                      {(position.fee / 10000).toFixed(2)}% Fee
                    </span>
                    {statusBadge && (
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusBadge.bg} ${statusBadge.text}`}>
                        {statusBadge.label}
                      </span>
                    )}
                    {lastUpdated && (
                      <span className="text-xs text-gray-500">
                        Updated: {lastUpdated.toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => fetchPositionDetails(true)}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  {isRefreshing ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>

              {/* Success/Error Messages */}
              {successMessage && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-600">{successMessage}</p>
                </div>
              )}

              {/* Price Range Visualization */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Price Range</h2>
                
                {/* Visual Range Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <div>
                      <span className="font-medium">Min Price</span>
                      <p className="text-lg font-bold text-gray-900">
                        {formatPrice(position.priceRangeLower)}
                      </p>
                    </div>
                    <div className="text-center">
                      <span className="font-medium">Current Price</span>
                      <p className="text-lg font-bold text-orange-600">
                        {formatPrice(position.currentPrice)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-medium">Max Price</span>
                      <p className="text-lg font-bold text-gray-900">
                        {formatPrice(position.priceRangeUpper)}
                      </p>
                    </div>
                  </div>

                  {/* Visual Bar */}
                  <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600"></div>
                    {position.inRange && (
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-orange-500"
                        style={{
                          left: `${Math.max(0, Math.min(100, ((position.currentPrice - position.priceRangeLower) / (position.priceRangeUpper - position.priceRangeLower)) * 100))}%`,
                        }}
                      >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-1">
                          <TrendingUp className="w-4 h-4 text-orange-500" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-sm text-gray-600">
                  Tick Range: {position.tickLower} to {position.tickUpper}
                </div>
              </div>

              {/* Position Stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Est. APR</p>
                  <p className="text-xl font-semibold text-green-600">
                    {position.estimatedAPR.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Share of Pool</p>
                  <p className="text-xl font-semibold text-gray-900">
                    {position.shareOfPool.toFixed(4)}%
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-1">Status</p>
                  <p className={`text-xl font-semibold ${position.inRange ? 'text-green-600' : 'text-yellow-600'}`}>
                    {position.inRange ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>

              {/* Token Amounts */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Token Amounts</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Token 0 Amount</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {formatBalance(position.amount0)}
                    </p>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Token 1 Amount</p>
                    <p className="text-2xl font-semibold text-gray-900">
                      {formatBalance(position.amount1)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Uncollected Fees */}
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Uncollected Fees</h2>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-green-700 mb-1">Token 0 Fees</p>
                      <p className="text-xl font-semibold text-green-900">
                        {formatBalance(position.tokensOwed0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-green-700 mb-1">Token 1 Fees</p>
                      <p className="text-xl font-semibold text-green-900">
                        {formatBalance(position.tokensOwed1)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  onClick={handleCollectFees}
                  disabled={actionLoading || (parseFloat(position.tokensOwed0) === 0 && parseFloat(position.tokensOwed1) === 0)}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Collect Fees'}
                </button>
                <Link
                  href="/positions"
                  className="flex-1 px-4 py-3 bg-green-600 text-white text-center font-medium rounded-lg hover:bg-green-700 transition-colors"
                >
                  Increase Liquidity
                </Link>
                <button
                  onClick={handleRemoveLiquidity}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {actionLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Remove Liquidity'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

