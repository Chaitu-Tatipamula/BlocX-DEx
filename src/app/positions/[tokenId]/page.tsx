'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import Link from 'next/link'
import { use } from 'react'
import { PositionService } from '@/services/positionService'
import { PoolService } from '@/services/poolService'
import { PositionDetails } from '@/types/position'
import { formatBalance } from '@/lib/utils'
import { formatUnits } from 'viem'
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
import { tokenList, tokens, type Token } from '@/config/tokens'
import { IncreaseLiquidityModal } from '@/components/IncreaseLiquidityModal'
import { useTx } from '@/context/tx'

export default function PositionDetailPage({ params }: { params: Promise<{ tokenId: string }> }) {
  const resolvedParams = use(params)
  const tokenId = resolvedParams.tokenId
  
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const { addError, addTx } = useTx()
  const [position, setPosition] = useState<PositionDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [collectFeesLoading, setCollectFeesLoading] = useState(false)
  const [removeLiquidityLoading, setRemoveLiquidityLoading] = useState(false)
  const [burnPositionLoading, setBurnPositionLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [showIncreaseModal, setShowIncreaseModal] = useState(false)

  const fetchPositionDetails = async (isRefresh = false) => {
    if (!address || !publicClient) return

    if (isRefresh) {
      setIsRefreshing(true)
    } else {
      setIsLoading(true)
    }

    try {
      const positionService = new PositionService(publicClient, walletClient)
      const positions = await positionService.getPositions(address)
      const foundPosition = positions.find(p => p.tokenId === tokenId)

      if (!foundPosition) {
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
          pool.sqrtPriceX96,
          foundPosition.tickLower,
          foundPosition.tickUpper
        )
        
        // Amounts are now in wei (raw units), convert to human-readable using formatUnits
        const amount0Wei = BigInt(amounts.amount0)
        const amount1Wei = BigInt(amounts.amount1)
        
        // Convert from wei to human-readable format
        const formattedAmount0 = amount0Wei > BigInt(0)
          ? formatBalance(formatUnits(amount0Wei, pool.token0.decimals), pool.token0.decimals)
          : '0'
        const formattedAmount1 = amount1Wei > BigInt(0)
          ? formatBalance(formatUnits(amount1Wei, pool.token1.decimals), pool.token1.decimals)
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
      addError({ title: 'Failed to Load Position', message: err instanceof Error ? err.message : 'Failed to load position details' })
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

    setCollectFeesLoading(true)

    try {
      const positionService = new PositionService(publicClient, walletClient)
      const maxUint128 = '340282366920938463463374607431768211455'
      const hash = await positionService.collectFees(tokenId, address, maxUint128, maxUint128)
      addTx({ hash, title: 'Fees Collected' })
      await fetchPositionDetails()
    } catch (error) {
      console.error('Error collecting fees:', error)
      addError({ title: 'Failed to Collect Fees', message: error instanceof Error ? error.message : 'Failed to collect fees' })
    } finally {
      setCollectFeesLoading(false)
    }
  }

  const [unwrapWBCX, setUnwrapWBCX] = useState(false)

  // Check if position contains WBCX (so we can offer unwrap option)
  const hasWBCX = useMemo(() => {
    if (!position) return false
    const wbcxAddress = tokens.WBCX.address.toLowerCase()
    return position.token0.toLowerCase() === wbcxAddress || position.token1.toLowerCase() === wbcxAddress
  }, [position])

  const handleRemoveLiquidity = async () => {
    if (!walletClient || !address || !position) return

    setRemoveLiquidityLoading(true)

    try {
      const positionService = new PositionService(publicClient, walletClient)
      const hash = await positionService.removeLiquidity(
        tokenId,
        position.liquidity,
        '0',
        '0',
        20,
        address,
        unwrapWBCX // Pass unwrap option
      )
      addTx({ hash, title: unwrapWBCX ? 'Liquidity Removed (WBCX Unwrapped)' : 'Liquidity Removed' })
      await fetchPositionDetails()
      setUnwrapWBCX(false) // Reset checkbox
    } catch (error) {
      console.error('Error removing liquidity:', error)
      addError({ title: 'Failed to Remove Liquidity', message: error instanceof Error ? error.message : 'Failed to remove liquidity' })
    } finally {
      setRemoveLiquidityLoading(false)
    }
  }

  const handleBurnPosition = async () => {
    if (!walletClient || !address || !position) return

    if (!confirm('Are you sure you want to burn this position? This will remove all liquidity and cannot be undone.')) {
      return
    }

    setBurnPositionLoading(true)

    try {
      const positionService = new PositionService(publicClient, walletClient)
      
      if (!publicClient) return
      
      // Step 1: Remove all liquidity (decrease liquidity to 0)
      if (parseFloat(position.liquidity) > 0) {
        const decreaseHash = await positionService.removeLiquidity(
          tokenId,
          position.liquidity,
          '0',
          '0',
          20,
          address,
          unwrapWBCX // Pass unwrap option if WBCX is present
        )
        await publicClient.waitForTransactionReceipt({ hash: decreaseHash as `0x${string}` })
        addTx({ hash: decreaseHash, title: 'Liquidity Removed' })
      }
      
      // Step 2: Collect all remaining tokens and fees
      const collectHash = await positionService.collectFees(
        tokenId,
        address,
        '340282366920938463463374607431768211455', // Max uint128
        '340282366920938463463374607431768211455'  // Max uint128
      )
      await publicClient.waitForTransactionReceipt({ hash: collectHash as `0x${string}` })
      addTx({ hash: collectHash, title: 'Tokens Collected' })
      
      // Step 3: Burn the NFT position (can only burn if liquidity = 0 and tokensOwed = 0)
      const burnHash = await positionService.burnPosition(tokenId)
      addTx({ hash: burnHash, title: 'Position Burned' })
      
      await fetchPositionDetails()
    } catch (error) {
      console.error('Error burning position:', error)
      addError({ title: 'Failed to Burn Position', message: error instanceof Error ? error.message : 'Failed to burn position' })
    } finally {
      setBurnPositionLoading(false)
    }
  }

  // Get token info from addresses
  const token0 = useMemo(() => {
    if (!position) return null
    return tokenList.find(t => t.address.toLowerCase() === position.token0.toLowerCase()) || null
  }, [position?.token0])
  
  const token1 = useMemo(() => {
    if (!position) return null
    return tokenList.find(t => t.address.toLowerCase() === position.token1.toLowerCase()) || null
  }, [position?.token1])

  if (!isConnected) {
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card p-8 text-center">
            <p className="text-white/70">Please connect your wallet to view position details.</p>
          </div>
        </div>
      </div>
    )
  }

  const statusBadge = position ? getPositionStatusBadge(position.inRange) : null

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="glass-card p-6">
          {/* Back Button */}
          <Link
            href="/positions"
            className="inline-flex items-center gap-2 text-white/70 hover:text-white mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Positions
          </Link>

          {/* Loading State */}
          {isLoading && (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-white mx-auto mb-2" />
              <p className="text-white/70">Loading position details...</p>
            </div>
          )}

          {/* Error State - Only show if position not found */}
          {!position && !isLoading && (
            <div className="text-center py-12">
              <p className="text-white/70 mb-4">Position not found or you do not own this position</p>
              <Link
                href="/positions"
                className="text-white hover:text-white/80 font-medium"
              >
                View all positions →
              </Link>
            </div>
          )}

          {/* Position Details */}
          {position && !isLoading && (
            <div className="space-y-6">
              {/* Header */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-semibold text-white mb-2">
                      Position #{position.tokenId}
                    </h1>
                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                      {/* Token Pair with Logos */}
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-2">
                          <div className="relative w-8 h-8">
                            {token0?.logoURI ? (
                              <div className="w-8 h-8 rounded-full bg-white p-0.5 border-2 border-white/20">
                                <img 
                                  src={token0.logoURI} 
                                  alt={token0.symbol}
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
                            <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 border-2 border-white/20 flex items-center justify-center text-white text-xs font-bold ${token0?.logoURI ? 'absolute inset-0 hidden' : ''}`}>
                              {token0?.symbol?.charAt(0) || position.token0.substring(0, 1)}
                            </div>
                          </div>
                          <div className="relative w-8 h-8">
                            {token1?.logoURI ? (
                              <div className="w-8 h-8 rounded-full bg-white p-0.5 border-2 border-white/20">
                                <img 
                                  src={token1.logoURI} 
                                  alt={token1.symbol}
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
                            <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 border-2 border-white/20 flex items-center justify-center text-white text-xs font-bold ${token1?.logoURI ? 'absolute inset-0 hidden' : ''}`}>
                              {token1?.symbol?.charAt(0) || position.token1.substring(0, 1)}
                            </div>
                          </div>
                        </div>
                        <span className="text-white text-sm sm:text-base">
                          {token0?.symbol || position.token0.substring(0, 8)}... / {token1?.symbol || position.token1.substring(0, 8)}...
                        </span>
                      </div>
                      <span className="px-2 py-1 glass-button text-xs rounded-full shrink-0">
                        {(position.fee / 10000).toFixed(2)}% Fee
                      </span>
                      {statusBadge && (
                        <span className={`px-3 py-1 rounded-full text-sm font-medium shrink-0 ${
                          position.inRange 
                            ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                            : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                        }`}>
                          {statusBadge.label}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => fetchPositionDetails(true)}
                    disabled={isRefreshing}
                    className="glass-button-primary flex items-center gap-2 px-3 sm:px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">{isRefreshing ? 'Refreshing...' : 'Refresh'}</span>
                  </button>
                </div>
                {lastUpdated && (
                  <div className="text-xs text-white/50">
                    Updated: {lastUpdated.toLocaleTimeString()}
                  </div>
                )}
              </div>


              {/* Price Range Visualization */}
              <div className="glass-card rounded-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Price Range</h2>
                
                {/* Visual Range Bar */}
                <div className="mb-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-white/70 mb-2">
                    <div className="min-w-0">
                      <span className="font-medium block mb-1">Min Price</span>
                      <p className="text-lg font-bold text-white break-words overflow-wrap-anywhere">
                        {formatPrice(position.priceRangeLower)}
                      </p>
                    </div>
                    <div className="min-w-0 text-center sm:text-left">
                      <span className="font-medium block mb-1">Current Price</span>
                      <p className="text-lg font-bold text-orange-400 break-words overflow-wrap-anywhere">
                        {formatPrice(position.currentPrice)}
                      </p>
                    </div>
                    <div className="min-w-0 text-right sm:text-left">
                      <span className="font-medium block mb-1">Max Price</span>
                      <p className="text-lg font-bold text-white break-words overflow-wrap-anywhere">
                        {formatPrice(position.priceRangeUpper)}
                      </p>
                    </div>
                  </div>

                  {/* Visual Bar */}
                  <div className="relative h-8 glass-card rounded-full overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600"></div>
                    {position.inRange && (
                      <div
                        className="absolute top-0 bottom-0 w-1 bg-orange-400"
                        style={{
                          left: `${Math.max(0, Math.min(100, ((position.currentPrice - position.priceRangeLower) / (position.priceRangeUpper - position.priceRangeLower)) * 100))}%`,
                        }}
                      >
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full mb-1">
                          <TrendingUp className="w-4 h-4 text-orange-400" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-sm text-white/70 break-words overflow-wrap-anywhere">
                  Tick Range: <span className="font-mono break-all">{position.tickLower}</span> to <span className="font-mono break-all">{position.tickUpper}</span>
                </div>
              </div>

              {/* Position Stats */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="glass-card rounded-lg p-4">
                  <p className="text-sm text-white/70 mb-1">Est. APR</p>
                  <p className="text-xl font-semibold text-green-300">
                    {position.estimatedAPR.toFixed(2)}%
                  </p>
                </div>
                <div className="glass-card rounded-lg p-4">
                  <p className="text-sm text-white/70 mb-1">Share of Pool</p>
                  <p className="text-xl font-semibold text-white">
                    {position.shareOfPool.toFixed(4)}%
                  </p>
                </div>
                <div className="glass-card rounded-lg p-4">
                  <p className="text-sm text-white/70 mb-1">Status</p>
                  <p className={`text-xl font-semibold ${position.inRange ? 'text-green-300' : 'text-yellow-300'}`}>
                    {position.inRange ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>

              {/* Token Amounts */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-3">Token Amounts</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div className="glass-card border border-white/10 rounded-lg p-4">
                    <p className="text-sm text-white/70 mb-1">Token 0 Amount</p>
                    <p className="text-2xl font-semibold text-white break-words overflow-wrap-anywhere">
                      {formatBalance(position.amount0)}
                    </p>
                  </div>
                  <div className="glass-card border border-white/10 rounded-lg p-4">
                    <p className="text-sm text-white/70 mb-1">Token 1 Amount</p>
                    <p className="text-2xl font-semibold text-white break-words overflow-wrap-anywhere">
                      {formatBalance(position.amount1)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Uncollected Fees */}
              <div>
                <h2 className="text-lg font-semibold text-white mb-3">Uncollected Fees</h2>
                <div className="glass-card border border-green-500/30 rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-green-300 mb-1">Token 0 Fees</p>
                      <p className="text-xl font-semibold text-green-300 break-words overflow-wrap-anywhere">
                        {formatBalance(position.tokensOwed0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-green-300 mb-1">Token 1 Fees</p>
                      <p className="text-xl font-semibold text-green-300 break-words overflow-wrap-anywhere">
                        {formatBalance(position.tokensOwed1)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
                <button
                  onClick={handleCollectFees}
                  disabled={collectFeesLoading || removeLiquidityLoading || burnPositionLoading || (parseFloat(position.tokensOwed0) === 0 && parseFloat(position.tokensOwed1) === 0)}
                  className="glass-button-primary w-full px-4 py-3 font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {collectFeesLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Collect Fees'}
                </button>
                <button
                  onClick={() => setShowIncreaseModal(true)}
                  disabled={collectFeesLoading || removeLiquidityLoading || burnPositionLoading}
                  className="glass-button-primary w-full px-4 py-3 font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Increase Liquidity
                </button>
                {hasWBCX && (
                  <div className="sm:col-span-2 flex items-center gap-2 p-3 glass-card rounded-lg">
                    <input
                      type="checkbox"
                      id="unwrap-wbcx"
                      checked={unwrapWBCX}
                      onChange={(e) => setUnwrapWBCX(e.target.checked)}
                      disabled={removeLiquidityLoading}
                      className="w-4 h-4 rounded border-white/20 bg-white/10 text-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <label htmlFor="unwrap-wbcx" className="text-sm text-white/80 cursor-pointer">
                      Unwrap WBCX to BCX when removing liquidity
                    </label>
                  </div>
                )}
                <button
                  onClick={handleRemoveLiquidity}
                  disabled={collectFeesLoading || removeLiquidityLoading || burnPositionLoading}
                  className="glass-button-primary w-full px-4 py-3 font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {removeLiquidityLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Remove Liquidity'}
                </button>
                <button
                  onClick={handleBurnPosition}
                  disabled={collectFeesLoading || removeLiquidityLoading || burnPositionLoading}
                  className="glass-button w-full px-4 py-3 font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed border border-red-500/30 text-red-300 hover:bg-red-500/10"
                >
                  {burnPositionLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Burn Position'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Increase Liquidity Modal */}
      {position && (
        <IncreaseLiquidityModal
          isOpen={showIncreaseModal}
          onClose={() => setShowIncreaseModal(false)}
          position={position}
          onSuccess={() => {
            fetchPositionDetails()
            setShowIncreaseModal(false)
          }}
        />
      )}
    </div>
  )
}

