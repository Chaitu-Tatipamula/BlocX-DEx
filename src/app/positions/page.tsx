'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import Link from 'next/link'
import { PositionService } from '@/services/positionService'
import { PoolService } from '@/services/poolService'
import { Position, PositionDetails } from '@/types/position'
import { PoolDetails } from '@/types/pool'
import { PositionInfoCard } from '@/components/PositionInfoCard'
import { IncreaseLiquidityModal } from '@/components/IncreaseLiquidityModal'
import { isInRange, getPriceRangeDisplay, getTokenAmounts, estimateAPR, calculateShareOfPool, formatPrice } from '@/lib/positionAnalysis'
import { formatBalance } from '@/lib/utils'
import { formatUnits } from 'viem'
import { Loader2, Plus } from 'lucide-react'
import { tokenList } from '@/config/tokens'
import { useTx } from '@/context/tx'

export default function PositionsPage() {
  const { address: userAddress, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const { addError, addTx } = useTx()
  const [positions, setPositions] = useState<Position[]>([])
  const [enhancedPositions, setEnhancedPositions] = useState<PositionDetails[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadingPositions, setLoadingPositions] = useState<Record<string, { type: 'collect' | 'remove' | 'burn' }>>({})
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
  const [activeTab, setActiveTab] = useState<'active' | 'closed'>('active')

  const positionService = new PositionService(publicClient, walletClient)

  const fetchPositions = useCallback(async () => {
    if (!userAddress || !publicClient) return

    setIsLoading(true)
    
    try {
      const userPositions = await positionService.getPositions(userAddress)
      setPositions(userPositions)

      // Enhance positions with pool data and calculations - PARALLELIZE WITH BATCHING
      const poolService = new PoolService(publicClient)
      
      // Create lazy promise functions to avoid flooding RPC
      const poolDetailFunctions = userPositions.map(position => 
        () => poolService.getPoolDetails(
          position.token0,
          position.token1,
          position.fee
        ).catch(() => null)
      )

      // Execute in batches to prevent RPC flooding
      const BATCH_SIZE = 5 // Process 5 positions at a time
      const pools: Array<PromiseSettledResult<PoolDetails | null>> = []
      
      for (let i = 0; i < poolDetailFunctions.length; i += BATCH_SIZE) {
        const batch = poolDetailFunctions.slice(i, i + BATCH_SIZE)
        // Only create promises when ready to execute this batch
        const batchPromises = batch.map(fn => fn())
        const batchResults = await Promise.allSettled(batchPromises)
        pools.push(...batchResults)
        
        // Small delay between batches
        if (i + BATCH_SIZE < poolDetailFunctions.length) {
          await new Promise(resolve => setTimeout(resolve, 50))
        }
      }

      // Process results in parallel
      const enhanced: PositionDetails[] = userPositions.map((position, index) => {
        const poolResult = pools[index]
        if (poolResult.status === 'fulfilled' && poolResult.value) {
          const pool = poolResult.value
          try {
            const inRange = isInRange(pool.currentTick, position.tickLower, position.tickUpper)
            const priceRange = getPriceRangeDisplay(position.tickLower, position.tickUpper)
            const amounts = getTokenAmounts(
              position.liquidity,
              pool.sqrtPriceX96,
              position.tickLower,
              position.tickUpper
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
            
            const apr = estimateAPR(position, position.fee, '0') // No volume data available
            const shareOfPool = calculateShareOfPool(position.liquidity, pool.liquidity)

            return {
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
            }
          } catch (error) {
            console.error(`Error processing position ${position.tokenId}:`, error)
          }
        }
        
        // Fallback: basic enhanced position without pool data
        return {
          ...position,
          inRange: false,
          amount0: '0',
          amount1: '0',
          estimatedAPR: 0,
          shareOfPool: 0,
          priceRangeLower: 0,
          priceRangeUpper: 0,
          currentPrice: 0,
        }
      })

      setEnhancedPositions(enhanced)
    } catch (error) {
      console.error('Error fetching positions:', error)
      addError({ title: 'Failed to Fetch Positions', message: error instanceof Error ? error.message : 'Failed to fetch positions' })
    } finally {
      setIsLoading(false)
    }
  }, [userAddress, publicClient])

  useEffect(() => {
    fetchPositions()
    // Removed automatic refetch interval - user can manually refresh if needed
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
      addError({ title: 'Invalid Amounts', message: 'Please enter valid positive amounts for both tokens' })
      return
    }

    setIsLoading(true)

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
      addTx({ hash: txHash, title: 'Liquidity Increased' })
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
      
      addError({ title: 'Failed to Increase Liquidity', message: errorMessage })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveLiquidity = async (tokenId: string, liquidity: string) => {
    if (!walletClient || !userAddress) return

    setLoadingPositions(prev => ({ ...prev, [tokenId]: { type: 'remove' } }))

    try {
      const txHash = await positionService.removeLiquidity(
        tokenId,
        liquidity,
        '0',
        '0',
        20,
        userAddress
      )
      
      addTx({ hash: txHash, title: 'Liquidity Removed' })
      fetchPositions()
    } catch (error) {
      console.error('Error removing liquidity:', error)
      addError({ title: 'Failed to Remove Liquidity', message: error instanceof Error ? error.message : 'Failed to remove liquidity' })
    } finally {
      setLoadingPositions(prev => {
        const next = { ...prev }
        delete next[tokenId]
        return next
      })
    }
  }

  const handleBurnPosition = async (tokenId: string, liquidity: string) => {
    if (!walletClient || !userAddress) return

    if (!confirm('Are you sure you want to burn this position? This will remove all liquidity and cannot be undone.')) {
      return
    }

    setLoadingPositions(prev => ({ ...prev, [tokenId]: { type: 'burn' } }))

    try {
      const txHash = await positionService.burnPosition(
        tokenId,
      )
      
      addTx({ hash: txHash, title: 'Position Burned' })
      fetchPositions()
    } catch (error) {
      console.error('Error burning position:', error)
      addError({ title: 'Failed to Burn Position', message: error instanceof Error ? error.message : 'Failed to burn position' })
    } finally {
      setLoadingPositions(prev => {
        const next = { ...prev }
        delete next[tokenId]
        return next
      })
    }
  }

  const handleCollectFees = async (tokenId: string) => {
    if (!walletClient || !userAddress) return

    setLoadingPositions(prev => ({ ...prev, [tokenId]: { type: 'collect' } }))

    try {
      const maxUint128 = '340282366920938463463374607431768211455'
      const hash = await positionService.collectFees(tokenId, userAddress, maxUint128, maxUint128)
      addTx({ hash, title: 'Fees Collected' })
      await fetchPositions()
    } catch (error) {
      console.error('Error collecting fees:', error)
      addError({ title: 'Failed to Collect Fees', message: error instanceof Error ? error.message : 'Failed to collect fees' })
    } finally {
      setLoadingPositions(prev => {
        const next = { ...prev }
        delete next[tokenId]
        return next
      })
    }
  }

  // Separate positions into active and closed
  const activePositions = enhancedPositions.filter(p => p.inRange && parseFloat(p.liquidity) > 0)
  const closedPositions = enhancedPositions.filter(p => !p.inRange || parseFloat(p.liquidity) === 0)

  // Group positions by pool
  const groupPositions = (positions: PositionDetails[]) => {
    return positions.reduce((acc, position) => {
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
  }

  const groupedActivePositions = groupPositions(activePositions)
  const groupedClosedPositions = groupPositions(closedPositions)

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
            <div>
              {/* Tabs */}
              <div className="flex border-b border-white/10 mb-6">
                <button
                  onClick={() => setActiveTab('active')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'active'
                      ? 'text-white border-b-2 border-white/30 bg-white/5'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Active Positions
                  {activePositions.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-white/10">
                      {activePositions.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setActiveTab('closed')}
                  className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                    activeTab === 'closed'
                      ? 'text-white border-b-2 border-white/30 bg-white/5'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  Closed Positions
                  {closedPositions.length > 0 && (
                    <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-white/10">
                      {closedPositions.length}
                    </span>
                  )}
                </button>
              </div>

              {/* Tab Content */}
              <div className="space-y-6">
                {activeTab === 'active' ? (
                  Object.keys(groupedActivePositions).length > 0 ? (
                    Object.values(groupedActivePositions).map((group, index) => {
                      const token0Symbol = getTokenSymbol(group.token0)
                      const token1Symbol = getTokenSymbol(group.token1)
                      return (
                        <div key={index} className="space-y-3">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-white">
                              {token0Symbol} / {token1Symbol}
                            </h3>
                            <span className="px-2 py-1 glass-button text-xs rounded-full">
                              {(group.fee / 10000).toFixed(2)}% Fee
                            </span>
                            <span className="text-sm text-white/60">
                              {group.positions.length} {group.positions.length === 1 ? 'position' : 'positions'}
                            </span>
                          </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {group.positions.map((position) => {
                            const loadingState = loadingPositions[position.tokenId]
                            const isAnyLoading = !!loadingState
                            
                            return (
                              <PositionInfoCard
                                key={position.tokenId}
                                position={position}
                                onCollectFees={handleCollectFees}
                                onIncrease={() => handleOpenIncreaseModal(position)}
                                onRemove={() => handleRemoveLiquidity(position.tokenId, position.liquidity)}
                                isLoading={isAnyLoading}
                                loadingType={loadingState?.type === 'burn' ? 'remove' : (loadingState?.type === 'collect' || loadingState?.type === 'remove' ? loadingState.type : undefined)}
                                showActions={true}
                              />
                            )
                          })}
                        </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-white/70">No active positions found.</p>
                    </div>
                  )
                ) : (
                  Object.keys(groupedClosedPositions).length > 0 ? (
                    Object.values(groupedClosedPositions).map((group, index) => {
                      const token0Symbol = getTokenSymbol(group.token0)
                      const token1Symbol = getTokenSymbol(group.token1)
                      return (
                        <div key={index} className="space-y-3">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold text-white">
                              {token0Symbol} / {token1Symbol}
                            </h3>
                            <span className="px-2 py-1 glass-button text-xs rounded-full">
                              {(group.fee / 10000).toFixed(2)}% Fee
                            </span>
                            <span className="text-sm text-white/60">
                              {group.positions.length} {group.positions.length === 1 ? 'position' : 'positions'}
                            </span>
                          </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {group.positions.map((position) => {
                            const loadingState = loadingPositions[position.tokenId]
                            const isAnyLoading = !!loadingState
                            
                            return (
                              <PositionInfoCard
                                key={position.tokenId}
                                position={position}
                                onCollectFees={handleCollectFees}
                                onIncrease={() => handleOpenIncreaseModal(position)}
                                onRemove={() => handleBurnPosition(position.tokenId, position.liquidity)}
                                isLoading={isAnyLoading}
                                loadingType={loadingState?.type === 'burn' ? 'remove' : (loadingState?.type === 'collect' || loadingState?.type === 'remove' ? loadingState.type : undefined)}
                                showActions={true}
                              />
                            )
                          })}
                        </div>
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-white/70">No closed positions found.</p>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Increase Liquidity Modal */}
      {selectedPosition && (
        <IncreaseLiquidityModal
          isOpen={showIncreaseModal}
          onClose={handleCloseIncreaseModal}
          position={selectedPosition}
          onSuccess={() => {
            fetchPositions()
            handleCloseIncreaseModal()
          }}
        />
      )}
    </div>
  )
}
