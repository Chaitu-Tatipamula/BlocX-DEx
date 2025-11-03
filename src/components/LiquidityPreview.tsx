'use client'

import React from 'react'
import { getTokenDistribution, calculateLiquidityMultiplier } from '@/lib/positionAnalysis'
import { priceToTick } from '@/lib/tickMath'
import { formatPrice } from '@/lib/positionAnalysis'
import { formatBalance } from '@/lib/utils'

interface LiquidityPreviewProps {
  currentPrice: number
  minPrice: number
  maxPrice: number
  minTick: number
  maxTick: number
  amount0: string
  amount1: string
  token0Symbol: string
  token1Symbol: string
}

export function LiquidityPreview({
  currentPrice,
  minPrice,
  maxPrice,
  minTick,
  maxTick,
  amount0,
  amount1,
  token0Symbol,
  token1Symbol,
}: LiquidityPreviewProps) {
  const currentTick = currentPrice > 0 ? priceToTick(currentPrice) : 0
  const distribution = getTokenDistribution(currentTick, minTick, maxTick)
  const multiplier = calculateLiquidityMultiplier(minTick, maxTick)
  
  const amount0Num = parseFloat(amount0) || 0
  const amount1Num = parseFloat(amount1) || 0
  const hasAmounts = amount0Num > 0 || amount1Num > 0

  // Calculate position in range for visual
  const pricePosition = currentPrice > 0 && minPrice < maxPrice
    ? ((currentPrice - minPrice) / (maxPrice - minPrice)) * 100
    : 50

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-3">Position Preview</h3>
        
        {/* Visual Liquidity Distribution */}
        <div className="relative h-20 bg-gradient-to-r from-transparent via-blue-100 to-transparent rounded-lg mb-4 overflow-hidden">
          {/* Liquidity bar */}
          <div className="absolute inset-y-0 left-1/4 right-1/4 bg-gradient-to-r from-blue-400 to-blue-600 opacity-70"></div>
          
          {/* Current price marker */}
          {currentPrice > 0 && (
            <div
              className="absolute top-0 bottom-0 w-1 bg-orange-500 z-10"
              style={{ left: `${Math.max(0, Math.min(100, pricePosition))}%` }}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="bg-orange-500 text-white text-xs px-2 py-1 rounded">
                  Current: {formatPrice(currentPrice, 4)}
                </div>
              </div>
            </div>
          )}

          {/* Range markers */}
          <div className="absolute bottom-1 left-1/4 text-xs text-gray-600 -translate-x-1/2">
            Min: {formatPrice(minPrice, 4)}
          </div>
          <div className="absolute bottom-1 right-1/4 text-xs text-gray-600 translate-x-1/2">
            Max: {formatPrice(maxPrice, 4)}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-xs text-blue-600 mb-1">Capital Efficiency</p>
            <p className="text-lg font-bold text-blue-900">{multiplier.toFixed(2)}x</p>
            <p className="text-xs text-blue-600 mt-1">vs Full Range</p>
          </div>
          
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-xs text-green-600 mb-1">Position Status</p>
            <p className="text-lg font-bold text-green-900">
              {currentTick >= minTick && currentTick <= maxTick ? 'In Range' : 'Out of Range'}
            </p>
            <p className="text-xs text-green-600 mt-1">
              {currentTick >= minTick && currentTick <= maxTick ? '✓ Earning Fees' : '✗ Not Earning'}
            </p>
          </div>
        </div>

        {/* Token Distribution */}
        <div className="mt-4">
          <p className="text-xs text-gray-600 mb-2">Token Distribution</p>
          <div className="flex h-8 rounded-lg overflow-hidden border border-gray-200">
            <div
              className="bg-blue-500 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${distribution.token0Percent}%` }}
            >
              {distribution.token0Percent > 15 && `${distribution.token0Percent.toFixed(0)}% ${token0Symbol}`}
            </div>
            <div
              className="bg-purple-500 flex items-center justify-center text-white text-xs font-medium"
              style={{ width: `${distribution.token1Percent}%` }}
            >
              {distribution.token1Percent > 15 && `${distribution.token1Percent.toFixed(0)}% ${token1Symbol}`}
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>{token0Symbol}: {distribution.token0Percent.toFixed(1)}%</span>
            <span>{token1Symbol}: {distribution.token1Percent.toFixed(1)}%</span>
          </div>
        </div>

        {/* Deposit Amounts Summary */}
        {hasAmounts && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs font-medium text-gray-700 mb-2">You will deposit:</p>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{token0Symbol}:</span>
                <span className="font-medium text-gray-900">
                  {amount0Num > 0 ? formatBalance(amount0Num.toString(), 6) : '0'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{token1Symbol}:</span>
                <span className="font-medium text-gray-900">
                  {amount1Num > 0 ? formatBalance(amount1Num.toString(), 6) : '0'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Warning if out of range */}
        {!(currentTick >= minTick && currentTick <= maxTick) && (
          <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-xs text-yellow-800">
              <strong>⚠️ Position will be out of range:</strong> You won't earn fees until the price moves into your range.
            </p>
          </div>
        )}

        {/* Info about concentrated liquidity */}
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs text-blue-800">
            <strong>💡 Concentrated Liquidity:</strong> Your {multiplier.toFixed(1)}x capital efficiency means you'll earn {multiplier.toFixed(1)}x more fees per dollar when trades occur in your range.
          </p>
        </div>
      </div>
    </div>
  )
}

