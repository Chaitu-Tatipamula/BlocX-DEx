'use client'

import React from 'react'
import { X, ArrowRight, AlertTriangle, Info } from 'lucide-react'
import { formatBalance, formatPriceImpact, getPriceImpactColor } from '@/lib/utils'
import { type Token } from '@/config/tokens'

interface SwapDetailsModalProps {
  isOpen: boolean
  onClose: () => void
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

export function SwapDetailsModal({
  isOpen,
  onClose,
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
}: SwapDetailsModalProps) {
  if (!isOpen) return null

  const isHighImpact = priceImpact > 3
  const isMediumImpact = priceImpact > 1 && priceImpact <= 3

  if (!tokenIn || !tokenOut || !amountIn || !amountOut) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold">Swap Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-4">
              <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin"></div>
              <span className="text-sm text-gray-500">Calculating swap details...</span>
            </div>
          )}

          {!isLoading && (
            <>
              {/* Route Visualization */}
              <div className="flex items-center justify-center gap-3 py-4">
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full flex items-center justify-center">
                    {tokenIn.logoURI ? (
                      <img src={tokenIn.logoURI} alt={tokenIn.symbol} className="w-full h-full rounded-full" />
                    ) : (
                      <span className="text-sm font-medium text-blue-700">
                        {tokenIn.symbol.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">You pay</div>
                    <div className="font-medium text-gray-900">
                      {formatBalance(amountIn)} {tokenIn.symbol}
                    </div>
                  </div>
                </div>
                
                <ArrowRight className="w-5 h-5 text-gray-400" />
                
                <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-4 py-3 border border-gray-200">
                  <div className="w-8 h-8 bg-gradient-to-br from-purple-100 to-pink-100 rounded-full flex items-center justify-center">
                    {tokenOut.logoURI ? (
                      <img src={tokenOut.logoURI} alt={tokenOut.symbol} className="w-full h-full rounded-full" />
                    ) : (
                      <span className="text-sm font-medium text-purple-700">
                        {tokenOut.symbol.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">You receive</div>
                    <div className="font-medium text-gray-900">
                      {formatBalance(amountOut)} {tokenOut.symbol}
                    </div>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3 pt-2 border-t border-gray-200">
                {/* Exchange Rate */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-600">Exchange Rate</span>
                  <span className="text-sm font-medium text-gray-900 text-right">
                    1 {tokenIn.symbol} = {exchangeRate} {tokenOut.symbol}
                  </span>
                </div>

                {/* Price Impact */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-600">Price Impact</span>
                  <span className={`text-sm font-medium ${getPriceImpactColor(priceImpact)} flex items-center gap-1`}>
                    {formatPriceImpact(priceImpact)}
                    {isHighImpact && <AlertTriangle className="w-3 h-3" />}
                  </span>
                </div>

                {/* Minimum Received */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-600">Minimum Received</span>
                  <span className="text-sm font-medium text-gray-900">
                    {formatBalance(minimumReceived)} {tokenOut.symbol}
                  </span>
                </div>

                {/* Fee */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-600">Trading Fee</span>
                  <span className="text-sm font-medium text-gray-900">{fee}</span>
                </div>

                {/* Slippage */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-gray-600">Slippage Tolerance</span>
                  <span className="text-sm font-medium text-gray-900">{slippage}%</span>
                </div>
              </div>

              {/* Warnings */}
              {isHighImpact && (
                <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-red-800 mb-1">High Price Impact</p>
                    <p className="text-sm text-red-700">
                      This swap will have a high price impact ({formatPriceImpact(priceImpact)}). 
                      Consider splitting your trade into smaller amounts.
                    </p>
                  </div>
                </div>
              )}

              {isMediumImpact && !isHighImpact && (
                <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <Info className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-800 mb-1">Medium Price Impact</p>
                    <p className="text-sm text-yellow-700">
                      This swap will have a moderate price impact ({formatPriceImpact(priceImpact)}).
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
