'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { PositionDetails } from '@/types/position'
import { PositionService } from '@/services/positionService'
import { formatBalance } from '@/lib/utils'
import { formatPrice } from '@/lib/positionAnalysis'
import { X } from 'lucide-react'
import { useTx } from '@/context/tx'

interface IncreaseLiquidityModalProps {
  isOpen: boolean
  onClose: () => void
  position: PositionDetails
  onSuccess?: () => void
}

export function IncreaseLiquidityModal({
  isOpen,
  onClose,
  position,
  onSuccess,
}: IncreaseLiquidityModalProps) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [increaseAmount0, setIncreaseAmount0] = useState('')
  const [increaseAmount1, setIncreaseAmount1] = useState('')
  const [slippageTolerance, setSlippageTolerance] = useState(0.5)
  const [adjustedAmount0, setAdjustedAmount0] = useState('0')
  const [adjustedAmount1, setAdjustedAmount1] = useState('0')
  const [amountAdjustment, setAmountAdjustment] = useState<{
    original0: string
    original1: string
    adjusted0: string
    adjusted1: string
    reason: string
  } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { addError, addTx } = useTx()

  const positionService = new PositionService(publicClient, walletClient)

  const calculateAdjustedAmounts = useCallback(async () => {
    if (!position || !increaseAmount0 || !increaseAmount1 || !publicClient) {
      setAdjustedAmount0('0')
      setAdjustedAmount1('0')
      setAmountAdjustment(null)
      return
    }

    try {
      let currentTick: number | undefined
      try {
        const poolAddress = await positionService.getPoolAddress(
          position.token0,
          position.token1,
          position.fee
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

      const { calculateLiquidityAmounts } = await import('@/lib/positionAnalysis')
      
      const { amount0, amount1 } = calculateLiquidityAmounts(
        increaseAmount0,
        increaseAmount1,
        currentTick,
        position.tickLower,
        position.tickUpper
      )

      setAdjustedAmount0(amount0)
      setAdjustedAmount1(amount1)

      const original0 = parseFloat(increaseAmount0)
      const original1 = parseFloat(increaseAmount1)
      const adjusted0 = parseFloat(amount0)
      const adjusted1 = parseFloat(amount1)

      if (Math.abs(original0 - adjusted0) > 0.01 || Math.abs(original1 - adjusted1) > 0.01) {
        let reason = ''
        if (currentTick < position.tickLower) {
          reason = 'Price is below your range - only token0 will be added'
        } else if (currentTick >= position.tickUpper) {
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
  }, [position, increaseAmount0, increaseAmount1, publicClient, positionService])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      calculateAdjustedAmounts()
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [calculateAdjustedAmounts])

  const handleIncreaseLiquidity = async () => {
    if (!walletClient || !address || !increaseAmount0 || !increaseAmount1) return

    const amount0 = parseFloat(increaseAmount0)
    const amount1 = parseFloat(increaseAmount1)
    
    if (isNaN(amount0) || isNaN(amount1) || amount0 <= 0 || amount1 <= 0) {
      addError({ title: 'Invalid Amounts', message: 'Please enter valid positive amounts for both tokens' })
      return
    }

    setIsLoading(true)

    try {
      let currentTick: number | undefined
      try {
        const poolAddress = await positionService.getPoolAddress(
          position.token0,
          position.token1,
          position.fee
        )
        
        if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
          const poolData = await positionService.getPoolData(poolAddress)
          currentTick = poolData.currentTick
        }
      } catch (poolError) {
        console.warn('Could not fetch current pool tick:', poolError)
      }

      const finalAmount0 = adjustedAmount0 || increaseAmount0
      const finalAmount1 = adjustedAmount1 || increaseAmount1

      const slippageMultiplier = (100 - slippageTolerance) / 100
      const amount0Min = (parseFloat(finalAmount0) * slippageMultiplier).toString()
      const amount1Min = (parseFloat(finalAmount1) * slippageMultiplier).toString()

      const txHash = await positionService.increaseLiquidity({
        tokenId: position.tokenId,
        amount0Desired: finalAmount0,
        amount1Desired: finalAmount1,
        amount0Min,
        amount1Min,
        deadline: Math.floor(Date.now() / 1000) + 3600,
        recipient: address,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
        currentTick: currentTick,
      })
      
      addTx({ hash: txHash, title: 'Liquidity Increased' })
      onSuccess?.()
      onClose()
      setIncreaseAmount0('')
      setIncreaseAmount1('')
    } catch (error) {
      console.error('Error increasing liquidity:', error)
      
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

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="glass-modal-backdrop absolute inset-0"
        onClick={onClose}
      />
      <div className="relative glass-modal w-full max-w-2xl max-h-[90vh] rounded-xl flex flex-col overflow-hidden text-white">
        <div className="flex items-center justify-between p-6 border-b border-white/10 shrink-0">
          <h3 className="text-xl font-semibold text-white">
            Increase Liquidity - Position #{position.tokenId}
          </h3>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors p-2"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Position Range Info */}
              <div className="glass-card rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-3">Position Range</h4>
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 text-sm">
                    <span className="text-white/70 shrink-0">Price Range:</span>
                    <span className="font-medium text-white break-words overflow-wrap-anywhere sm:text-right min-w-0">
                      {formatPrice(position.priceRangeLower)} - {formatPrice(position.priceRangeUpper)}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 text-sm">
                    <span className="text-white/70 shrink-0">Current Price:</span>
                    <span className="font-medium text-white break-words overflow-wrap-anywhere sm:text-right min-w-0">
                      {position.currentPrice ? formatPrice(position.currentPrice) : 'Loading...'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Status:</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      position.inRange 
                        ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
                        : 'bg-red-500/20 text-red-300 border border-red-500/30'
                    }`}>
                      {position.inRange ? 'In Range' : 'Out of Range'}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/70">Fee Tier:</span>
                    <span className="font-medium text-white">
                      {(position.fee / 10000).toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Current Position */}
              <div className="glass-card border border-blue-500/30 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-3">Current Position</h4>
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 text-sm">
                    <span className="text-white/70 shrink-0">Token 0 Amount:</span>
                    <span className="font-medium text-white break-words overflow-wrap-anywhere sm:text-right min-w-0">
                      {position.amount0 ? formatBalance(position.amount0) : '0.00'}
                    </span>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 text-sm">
                    <span className="text-white/70 shrink-0">Token 1 Amount:</span>
                    <span className="font-medium text-white break-words overflow-wrap-anywhere sm:text-right min-w-0">
                      {position.amount1 ? formatBalance(position.amount1) : '0.00'}
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
                  <div className="flex flex-wrap gap-2">
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

            {/* Right Column */}
            <div className="space-y-4">
              <div className="glass-card rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-3">Liquidity Preview</h4>
                <div className="space-y-3">
                  <div className="text-center p-3 glass-card rounded-lg border border-white/10">
                    <div className="text-2xl font-bold text-white break-words overflow-wrap-anywhere">
                      +{formatBalance((parseFloat(adjustedAmount0 || '0') + parseFloat(adjustedAmount1 || '0')).toString())}
                    </div>
                    <div className="text-sm text-white/70">Additional Liquidity</div>
                    {amountAdjustment && (
                      <div className="mt-2 text-xs text-orange-300 break-words overflow-wrap-anywhere">
                        (Adjusted from {formatBalance((parseFloat(increaseAmount0 || '0') + parseFloat(increaseAmount1 || '0')).toString())})
                      </div>
                    )}
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 text-sm">
                      <span className="text-white/70 shrink-0">New Token 0 Total:</span>
                      <span className="font-medium text-white break-words overflow-wrap-anywhere sm:text-right min-w-0">
                        {formatBalance(
                          (parseFloat(position.amount0 || '0') + parseFloat(adjustedAmount0 || '0')).toString()
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-2 text-sm">
                      <span className="text-white/70 shrink-0">New Token 1 Total:</span>
                      <span className="font-medium text-white break-words overflow-wrap-anywhere sm:text-right min-w-0">
                        {formatBalance(
                          (parseFloat(position.amount1 || '0') + parseFloat(adjustedAmount1 || '0')).toString()
                        )}
                      </span>
                    </div>
                  </div>

                  {position.inRange && (
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
                      <div className="text-xs text-orange-200 break-words overflow-wrap-anywhere">
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
                      <span className="text-sm font-medium text-blue-300 break-words overflow-wrap-anywhere">
                        Slippage tolerance: {slippageTolerance}% (your choice)
                      </span>
                    </div>
                  </div>

                  {!position.inRange && (
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
              <div className="flex gap-3 pt-4 shrink-0">
                <button
                  onClick={onClose}
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
    </div>
  )
}

