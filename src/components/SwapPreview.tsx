'use client'

import React from 'react'
import { ArrowRight, AlertTriangle, Info } from 'lucide-react'
import { formatBalance, formatPriceImpact, getPriceImpactColor } from '@/lib/utils'
import { type Token } from '@/config/tokens'

interface SwapPreviewProps {
  tokenIn: Token | null
  tokenOut: Token | null
  amountIn: string
  amountOut: string
  priceImpact: number
  slippage: number
  minimumReceived: string
  exchangeRate: string
  fee: string
  isLoading?: boolean
}

export function SwapPreview({
  tokenIn,
  tokenOut,
  amountIn,
  amountOut,
  priceImpact,
  slippage,
  minimumReceived,
  exchangeRate,
  fee,
  isLoading = false
}: SwapPreviewProps) {
  if (!tokenIn || !tokenOut || !amountIn || !amountOut) {
    return null
  }

  const isHighImpact = priceImpact > 3
  const isMediumImpact = priceImpact > 1 && priceImpact <= 3

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Swap Preview</h3>
        {isLoading && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <div className="w-3 h-3 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
            Calculating...
          </div>
        )}
      </div>

      {/* Route Visualization */}
      <div className="flex items-center justify-center gap-2 py-2">
        <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border">
          <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
            <span className="text-xs font-medium text-blue-600">
              {tokenIn.symbol.charAt(0)}
            </span>
          </div>
          <span className="text-sm font-medium">{formatBalance(amountIn)} {tokenIn.symbol}</span>
        </div>
        
        <ArrowRight className="w-4 h-4 text-gray-400" />
        
        <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border">
          <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
            <span className="text-xs font-medium text-purple-600">
              {tokenOut.symbol.charAt(0)}
            </span>
          </div>
          <span className="text-sm font-medium">{formatBalance(amountOut)} {tokenOut.symbol}</span>
        </div>
      </div>

      {/* Exchange Rate */}
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Exchange Rate:</span>
        <span className="font-medium text-gray-900">
          1 {tokenIn.symbol} = {exchangeRate} {tokenOut.symbol}
        </span>
      </div>

      {/* Price Impact */}
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Price Impact:</span>
        <span className={`font-medium ${getPriceImpactColor(priceImpact)}`}>
          {formatPriceImpact(priceImpact)}
          {isHighImpact && (
            <AlertTriangle className="inline w-3 h-3 ml-1" />
          )}
        </span>
      </div>

      {/* Minimum Received */}
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Minimum Received:</span>
        <span className="font-medium text-gray-900">
          {formatBalance(minimumReceived)} {tokenOut.symbol}
        </span>
      </div>

      {/* Fee */}
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Trading Fee:</span>
        <span className="font-medium text-gray-900">{fee}</span>
      </div>

      {/* Slippage */}
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Slippage Tolerance:</span>
        <span className="font-medium text-gray-900">{slippage}%</span>
      </div>

      {/* Warnings */}
      {isHighImpact && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-red-800">High Price Impact</p>
            <p className="text-red-700">
              This swap will have a high price impact ({formatPriceImpact(priceImpact)}). 
              Consider splitting your trade into smaller amounts.
            </p>
          </div>
        </div>
      )}

      {isMediumImpact && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <Info className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-yellow-800">Medium Price Impact</p>
            <p className="text-yellow-700">
              This swap will have a moderate price impact ({formatPriceImpact(priceImpact)}).
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
