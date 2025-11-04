'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import Link from 'next/link'
import { PositionService } from '@/services/positionService'
import { PoolService } from '@/services/poolService'
import { Position, PositionDetails } from '@/types/position'
import { PositionInfoCard } from '@/components/PositionInfoCard'
import { isInRange, getPriceRangeDisplay, getTokenAmounts, estimateAPR, calculateShareOfPool, formatPrice } from '@/lib/positionAnalysis'
import { formatBalance } from '@/lib/utils'
import { Loader2, Plus } from 'lucide-react'
import { tokenList } from '@/config/tokens'

export default function PositionsPage() {
  const { address: userAddress, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [positions, setPositions] = useState<Position[]>([])
  const [enhancedPositions, setEnhancedPositions] = useState<PositionDetails[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [showIncreaseModal, setShowIncreaseModal] = useState(false)
  const [selectedPosition, setSelectedPosition] = useState<any>(null)
  const [increaseAmount0, setIncreaseAmount0] = useState('0')
  const [increaseAmount1, setIncreaseAmount1] = useState('0')
  const [slippageTolerance, setSlippageTolerance] = useState(0.5) // 0.5% default like Uniswap
  const [adjustedAmount0, setAdjustedAmount0] = useState('0')
  const [adjustedAmount1, setAdjustedAmount1] = useState('0')
  const [amountAdjustment, setAmountAdjustment] = useState<{
    original0: string
    original1: string
    adjusted0: string
    adjusted1: string
    reason: string
  } | null>(null)

  const positionService = new PositionService(publicClient, walletClient)

  const fetchPositions = useCallback(async () => {
    if (!userAddress || !publicClient) return

    setIsLoading(true)
    setError(null)
    
    try {
      const userPositions = await positionService.getPositions(userAddress)
      setPositions(userPositions)

      // Enhance positions with pool data and calculations
      const poolService = new PoolService(publicClient)
      const enhanced: PositionDetails[] = []

      for (const position of userPositions) {
        try {
          // Get pool details for current price
          const pool = await poolService.getPoolDetails(
            position.token0,
            position.token1,
            position.fee
          )

          if (pool) {
            const inRange = isInRange(pool.currentTick, position.tickLower, position.tickUpper)
            const priceRange = getPriceRangeDisplay(position.tickLower, position.tickUpper)
            const amounts = getTokenAmounts(
              position.liquidity,
              pool.currentTick,
              position.tickLower,
              position.tickUpper
            )
            
            // Format amounts with correct token decimals for display
            const amount0Num = parseFloat(amounts.amount0)
            const amount1Num = parseFloat(amounts.amount1)
            
            // Divide by 10^decimals to convert from calculated units to human-readable
            const formattedAmount0 = amount0Num > 0 
              ? formatBalance((amount0Num / Math.pow(10, pool.token0.decimals)).toString(), pool.token0.decimals)
              : '0'
            const formattedAmount1 = amount1Num > 0
              ? formatBalance((amount1Num / Math.pow(10, pool.token1.decimals)).toString(), pool.token1.decimals)
              : '0'
            
            const apr = estimateAPR(position, position.fee, '0') // No volume data available
            const shareOfPool = calculateShareOfPool(position.liquidity, pool.liquidity)

            enhanced.push({
              ...position,
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
        } catch (error) {
          console.error(`Error enhancing position ${position.tokenId}:`, error)
          // Add basic enhanced position without pool data
          enhanced.push({
            ...position,
            inRange: false,
            amount0: '0',
            amount1: '0',
            estimatedAPR: 0,
            shareOfPool: 0,
            priceRangeLower: 0,
            priceRangeUpper: 0,
            currentPrice: 0,
          })
        }
      }

      setEnhancedPositions(enhanced)
    } catch (error) {
      console.error('Error fetching positions:', error)
      setError('Failed to fetch positions')
    } finally {
      setIsLoading(false)
    }
  }, [userAddress, publicClient])

  useEffect(() => {
    fetchPositions()
    const interval = setInterval(fetchPositions, 30000) // Refresh every 30s
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
    setAdjustedAmount0('0')
    setAdjustedAmount1('0')
    setAmountAdjustment(null)
  }

  // Calculate adjusted amounts when user changes input
  const calculateAdjustedAmounts = useCallback(async () => {
    if (!selectedPosition || !increaseAmount0 || !increaseAmount1 || !publicClient) {
      setAdjustedAmount0('0')
      setAdjustedAmount1('0')
      setAmountAdjustment(null)
      return
    }

    try {
      // Get current pool tick
      let currentTick: number | undefined
      try {
        const poolAddress = await positionService.getPoolAddress(
          selectedPosition.token0,
          selectedPosition.token1,
          selectedPosition.fee
        )
        
        if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
          const poolData = await positionService.getPoolData(poolAddress)
          currentTick = poolData.currentTick
        }
      } catch (poolError) {
        console.warn('Could not fetch current pool tick:', poolError)
        return
      }

      if (currentTick === undefined) {
        setAdjustedAmount0(increaseAmount0)
        setAdjustedAmount1(increaseAmount1)
        setAmountAdjustment(null)
        return
      }

      // Import the position analysis functions
      const { calculateLiquidityAmounts } = await import('@/lib/positionAnalysis')
      
      // Calculate optimal amounts based on the position's tick range
      const { amount0, amount1 } = calculateLiquidityAmounts(
        increaseAmount0,
        increaseAmount1,
        currentTick,
        selectedPosition.tickLower,
        selectedPosition.tickUpper
      )

      setAdjustedAmount0(amount0)
      setAdjustedAmount1(amount1)

      // Check if amounts were adjusted
      const original0 = parseFloat(increaseAmount0)
      const original1 = parseFloat(increaseAmount1)
      const adjusted0 = parseFloat(amount0)
      const adjusted1 = parseFloat(amount1)

      if (Math.abs(original0 - adjusted0) > 0.01 || Math.abs(original1 - adjusted1) > 0.01) {
        let reason = ''
        if (currentTick < selectedPosition.tickLower) {
          reason = 'Price is below your range - only token0 will be added'
        } else if (currentTick >= selectedPosition.tickUpper) {
          reason = 'Price is above your range - only token1 will be added'
        } else {
          reason = 'Amounts adjusted to fit within your position range'
        }

        setAmountAdjustment({
          original0: increaseAmount0,
          original1: increaseAmount1,
          adjusted0: amount0,
          adjusted1: amount1,
          reason
        })
      } else {
        setAmountAdjustment(null)
      }
    } catch (error) {
      console.error('Error calculating adjusted amounts:', error)
      setAdjustedAmount0(increaseAmount0)
      setAdjustedAmount1(increaseAmount1)
      setAmountAdjustment(null)
    }
  }, [selectedPosition, increaseAmount0, increaseAmount1, publicClient, positionService])

  // Calculate adjusted amounts when inputs change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      calculateAdjustedAmounts()
    }, 500) // Debounce for 500ms

    return () => clearTimeout(timeoutId)
  }, [calculateAdjustedAmounts])

  const handleIncreaseLiquidity = async () => {
    if (!walletClient || !userAddress || !selectedPosition || !increaseAmount0 || !increaseAmount1) return

    // Basic validation - let users enter any amounts they want
    const amount0 = parseFloat(increaseAmount0)
    const amount1 = parseFloat(increaseAmount1)
    
    if (isNaN(amount0) || isNaN(amount1) || amount0 <= 0 || amount1 <= 0) {
      setError('Please enter valid positive amounts for both tokens')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Get current pool tick for optimal amount calculation
      let currentTick: number | undefined
      try {
        // Try to get current tick from the pool
        const poolAddress = await positionService.getPoolAddress(
          selectedPosition.token0,
          selectedPosition.token1,
          selectedPosition.fee
        )
        
        if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
          const poolData = await positionService.getPoolData(poolAddress)
          currentTick = poolData.currentTick
        }
      } catch (poolError) {
        console.warn('Could not fetch current pool tick:', poolError)
        // Continue without currentTick - the service will use the position's original range
      }

      // Use adjusted amounts (what will actually be added)
      const finalAmount0 = adjustedAmount0 || increaseAmount0
      const finalAmount1 = adjustedAmount1 || increaseAmount1

      // Calculate slippage amounts based on user's choice
      const slippageMultiplier = (100 - slippageTolerance) / 100
      const amount0Min = (parseFloat(finalAmount0) * slippageMultiplier).toString()
      const amount1Min = (parseFloat(finalAmount1) * slippageMultiplier).toString()
      
      console.log('Increase liquidity parameters:', {
        userInput0: increaseAmount0,
        userInput1: increaseAmount1,
        adjustedAmount0: finalAmount0,
        adjustedAmount1: finalAmount1,
        amount0Min,
        amount1Min,
        slippageTolerance: `${slippageTolerance}%`,
        slippageMultiplier
      })

      const txHash = await positionService.increaseLiquidity({
        tokenId: selectedPosition.tokenId,
        amount0Desired: finalAmount0,
        amount1Desired: finalAmount1,
        amount0Min,
        amount1Min,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        recipient: userAddress,
        // Pass position's original tick range
        tickLower: selectedPosition.tickLower,
        tickUpper: selectedPosition.tickUpper,
        currentTick: currentTick,
      })
      setSuccessMessage(`Liquidity increased! Transaction: ${txHash}`)
      handleCloseIncreaseModal()
      fetchPositions()
    } catch (error) {
      console.error('Error increasing liquidity:', error)
      
      // Provide more specific error messages
      let errorMessage = 'Failed to increase liquidity'
      if (error instanceof Error) {
        if (error.message.includes('insufficient')) {
          errorMessage = 'Insufficient token balance. Please check your token amounts.'
        } else if (error.message.includes('slippage')) {
          errorMessage = 'Slippage tolerance exceeded. Try increasing the amounts or check if the position is still in range.'
        } else if (error.message.includes('tick')) {
          errorMessage = 'Position is out of range. The current price is outside your position\'s tick range.'
        } else {
          errorMessage = error.message
        }
      }
      
      setError(errorMessage)
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

  const handleCollectFees = async (tokenId: string) => {
    if (!walletClient || !userAddress) return

    setIsLoading(true)
    setError(null)
    setSuccessMessage(null)

    try {
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

  // Group positions by pool
  const groupedPositions = enhancedPositions.reduce((acc, position) => {
    const key = `${position.token0}-${position.token1}-${position.fee}`
    if (!acc[key]) {
      acc[key] = {
        token0: position.token0,
        token1: position.token1,
        fee: position.fee,
        positions: [],
      }
    }
    acc[key].positions.push(position)
    return acc
  }, {} as Record<string, { token0: string; token1: string; fee: number; positions: PositionDetails[] }>)

  // Helper to get token symbol from address
  const getTokenSymbol = useCallback((address: string) => {
    const token = tokenList.find(t => t.address.toLowerCase() === address.toLowerCase())
    return token?.symbol || address.substring(0, 8) + '...'
  }, [])

  if (!isConnected) {
    return (
      <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="glass-card p-8 text-center">
            <h1 className="text-2xl font-semibold text-white mb-4">My Positions</h1>
            <p className="text-white/70">Please connect your wallet to view your liquidity positions.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold text-white">My Positions</h1>
              <p className="text-sm text-white/70 mt-1">
                Manage your liquidity positions
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={fetchPositions}
                disabled={isLoading}
                className="glass-button-primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
              <Link
                href="/liquidity"
                className="glass-button-primary flex items-center gap-2 px-4 py-2"
              >
                <Plus className="w-4 h-4" />
                New Position
              </Link>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 glass-card border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 glass-card border border-green-500/30 rounded-lg">
              <p className="text-sm text-green-300">{successMessage}</p>
            </div>
          )}

          {isLoading && positions.length === 0 ? (
            <div className="text-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-white mx-auto mb-2" />
              <p className="text-white/70">Loading positions...</p>
            </div>
          ) : enhancedPositions.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-white/40 mb-4">
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
              <p className="text-white/70 mb-4">No liquidity positions found.</p>
              <Link
                href="/liquidity"
                className="text-white hover:text-white/80 font-medium"
              >
                Create your first position →
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.values(groupedPositions).map((group, index) => {
                const token0Symbol = getTokenSymbol(group.token0)
                const token1Symbol = getTokenSymbol(group.token1)
                return (
                  <div key={index} className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <h2 className="text-lg font-semibold text-white">
                        {token0Symbol} / {token1Symbol}
                      </h2>
                      <span className="px-2 py-1 glass-button text-xs rounded-full">
                        {(group.fee / 10000).toFixed(2)}% Fee
                      </span>
                      <span className="text-sm text-white/60">
                        {group.positions.length} {group.positions.length === 1 ? 'position' : 'positions'}
                      </span>
                    </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.positions.map((position) => (
                      <PositionInfoCard
                        key={position.tokenId}
                        position={position}
                        onCollectFees={handleCollectFees}
                        onIncrease={() => handleOpenIncreaseModal(position)}
                        onRemove={() => handleRemoveLiquidity(position.tokenId, position.liquidity)}
                        isLoading={isLoading}
                        showActions={true}
                      />
                    ))}
                  </div>
                </div>
              )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Increase Liquidity Modal */}
      {showIncreaseModal && selectedPosition && (
        <div className="fixed inset-0 glass-modal-backdrop flex items-center justify-center z-50">
          <div className="glass-modal p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">
                Increase Liquidity - Position #{selectedPosition.tokenId}
              </h3>
              <button
                onClick={handleCloseIncreaseModal}
                className="text-white/60 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Position Info & Input */}
              <div className="space-y-6">
                {/* Position Range Info */}
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-sm font-medium text-white mb-3">Position Range</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Price Range:</span>
                      <span className="font-medium text-white">
                        {formatPrice(selectedPosition.priceRangeLower)} - {formatPrice(selectedPosition.priceRangeUpper)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Current Price:</span>
                      <span className="font-medium text-white">
                        {selectedPosition.currentPrice ? formatPrice(selectedPosition.currentPrice) : 'Loading...'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Status:</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        selectedPosition.inRange 
                          ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                          : 'bg-red-500/20 text-red-300 border border-red-500/30'
                      }`}>
                        {selectedPosition.inRange ? 'In Range' : 'Out of Range'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Fee Tier:</span>
                      <span className="font-medium text-white">
                        {(selectedPosition.fee / 10000).toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Current Position Amounts */}
                <div className="glass-card border border-blue-500/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-white mb-3">Current Position</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Token 0 Amount:</span>
                      <span className="font-medium text-white">
                        {selectedPosition.amount0 ? formatBalance(selectedPosition.amount0) : '0.00'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/70">Token 1 Amount:</span>
                      <span className="font-medium text-white">
                        {selectedPosition.amount1 ? formatBalance(selectedPosition.amount1) : '0.00'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Input Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Additional Amount for Token 0
                    </label>
                    <input
                      type="number"
                      value={increaseAmount0}
                      onChange={(e) => setIncreaseAmount0(e.target.value)}
                      placeholder="0.0"
                      className="glass-input w-full px-3 py-2 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Additional Amount for Token 1
                    </label>
                    <input
                      type="number"
                      value={increaseAmount1}
                      onChange={(e) => setIncreaseAmount1(e.target.value)}
                      placeholder="0.0"
                      className="glass-input w-full px-3 py-2 text-white"
                    />
                  </div>

                  {/* Slippage Tolerance */}
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Slippage Tolerance
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSlippageTolerance(0.1)}
                        className={`px-3 py-1 text-sm rounded-xl ${
                          slippageTolerance === 0.1
                            ? 'glass-button-primary'
                            : 'glass-button'
                        }`}
                      >
                        0.1%
                      </button>
                      <button
                        type="button"
                        onClick={() => setSlippageTolerance(0.5)}
                        className={`px-3 py-1 text-sm rounded-xl ${
                          slippageTolerance === 0.5
                            ? 'glass-button-primary'
                            : 'glass-button'
                        }`}
                      >
                        0.5%
                      </button>
                      <button
                        type="button"
                        onClick={() => setSlippageTolerance(1.0)}
                        className={`px-3 py-1 text-sm rounded-xl ${
                          slippageTolerance === 1.0
                            ? 'glass-button-primary'
                            : 'glass-button'
                        }`}
                      >
                        1.0%
                      </button>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={slippageTolerance}
                          onChange={(e) => setSlippageTolerance(parseFloat(e.target.value) || 0.5)}
                          min="0.1"
                          max="50"
                          step="0.1"
                          className="glass-input w-20 px-2 py-1 text-sm text-white"
                        />
                        <span className="text-sm text-white/60">%</span>
                      </div>
                    </div>
                    <p className="text-xs text-white/50 mt-1">
                      Your transaction will revert if the price changes unfavorably by more than this percentage.
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column - Preview */}
              <div className="space-y-4">
                <div className="glass-card rounded-lg p-4">
                  <h4 className="text-sm font-medium text-white mb-3">Liquidity Preview</h4>
                  <div className="space-y-3">
                    <div className="text-center p-3 glass-card rounded-lg border border-white/10">
                      <div className="text-2xl font-bold text-white">
                        +{formatBalance((parseFloat(adjustedAmount0 || '0') + parseFloat(adjustedAmount1 || '0')).toString())}
                      </div>
                      <div className="text-sm text-white/70">Additional Liquidity</div>
                      {amountAdjustment && (
                        <div className="mt-2 text-xs text-orange-300">
                          (Adjusted from {formatBalance((parseFloat(increaseAmount0 || '0') + parseFloat(increaseAmount1 || '0')).toString())})
                        </div>
                      )}
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/70">New Token 0 Total:</span>
                        <span className="font-medium text-white">
                          {formatBalance(
                            (parseFloat(selectedPosition.amount0 || '0') + parseFloat(adjustedAmount0 || '0')).toString()
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/70">New Token 1 Total:</span>
                        <span className="font-medium text-white">
                          {formatBalance(
                            (parseFloat(selectedPosition.amount1 || '0') + parseFloat(adjustedAmount1 || '0')).toString()
                          )}
                        </span>
                      </div>
                    </div>

                    {selectedPosition.inRange && (
                      <div className="p-3 glass-card border border-green-500/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                          <span className="text-sm font-medium text-green-300">
                            Position is in range - earning fees
                          </span>
                        </div>
                      </div>
                    )}

                {amountAdjustment && (
                  <div className="p-3 glass-card border border-orange-500/30 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                      <span className="text-sm font-medium text-orange-300">
                        Amounts Adjusted
                      </span>
                    </div>
                    <div className="text-xs text-orange-200">
                      <div className="mb-1">{amountAdjustment.reason}</div>
                      <div className="space-y-1">
                        <div>Token 0: {formatBalance(amountAdjustment.original0)} → {formatBalance(amountAdjustment.adjusted0)}</div>
                        <div>Token 1: {formatBalance(amountAdjustment.original1)} → {formatBalance(amountAdjustment.adjusted1)}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="p-3 glass-card border border-blue-500/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                    <span className="text-sm font-medium text-blue-300">
                      Slippage tolerance: {slippageTolerance}% (your choice)
                    </span>
                  </div>
                </div>

                    {!selectedPosition.inRange && (
                      <div className="p-3 glass-card border border-red-500/30 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-red-400 rounded-full"></div>
                          <span className="text-sm font-medium text-red-300">
                            Position is out of range - not earning fees
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    onClick={handleCloseIncreaseModal}
                    className="glass-button flex-1 px-4 py-2 font-medium rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleIncreaseLiquidity}
                    disabled={!increaseAmount0 || !increaseAmount1 || isLoading}
                    className="glass-button-primary flex-1 px-4 py-2 font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? 'Increasing...' : 'Increase Liquidity'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
