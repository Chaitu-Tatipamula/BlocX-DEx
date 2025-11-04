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
        className="glass-modal-backdrop absolute inset-0"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative glass-modal w-full max-w-md overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">Swap Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-4">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span className="text-sm text-white/60">Calculating swap details...</span>
            </div>
          )}

          {!isLoading && (
            <>
              {/* Route Visualization */}
              <div className="flex items-center justify-center gap-3 py-4">
                <div className="flex items-center gap-2 glass-card rounded-xl px-4 py-3 border border-white/10">
                  <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center border border-white/20">
                    {tokenIn.logoURI ? (
                      <img src={tokenIn.logoURI} alt={tokenIn.symbol} className="w-full h-full rounded-full" />
                    ) : (
                      <span className="text-sm font-medium text-white">
                        {tokenIn.symbol.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-white/60">You pay</div>
                    <div className="font-medium text-white">
                      {formatBalance(amountIn)} {tokenIn.symbol}
                    </div>
                  </div>
                </div>
                
                <ArrowRight className="w-5 h-5 text-white/50" />
                
                <div className="flex items-center gap-2 glass-card rounded-xl px-4 py-3 border border-white/10">
                  <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center border border-white/20">
                    {tokenOut.logoURI ? (
                      <img src={tokenOut.logoURI} alt={tokenOut.symbol} className="w-full h-full rounded-full" />
                    ) : (
                      <span className="text-sm font-medium text-white">
                        {tokenOut.symbol.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-white/60">You receive</div>
                    <div className="font-medium text-white">
                      {formatBalance(amountOut)} {tokenOut.symbol}
                    </div>
                  </div>
                </div>
              </div>

              {/* Details */}
              <div className="space-y-3 pt-2 border-t border-white/10">
                {/* Exchange Rate */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-white/70">Exchange Rate</span>
                  <span className="text-sm font-medium text-white text-right">
                    1 {tokenIn.symbol} = {exchangeRate} {tokenOut.symbol}
                  </span>
                </div>

                {/* Price Impact */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-white/70">Price Impact</span>
                  <span className={`text-sm font-medium ${
                    isHighImpact ? 'text-red-400' : isMediumImpact ? 'text-yellow-400' : 'text-green-400'
                  } flex items-center gap-1`}>
                    {formatPriceImpact(priceImpact)}
                    {isHighImpact && <AlertTriangle className="w-3 h-3" />}
                  </span>
                </div>

                {/* Minimum Received */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-white/70">Minimum Received</span>
                  <span className="text-sm font-medium text-white">
                    {formatBalance(minimumReceived)} {tokenOut.symbol}
                  </span>
                </div>

                {/* Fee */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-white/70">Trading Fee</span>
                  <span className="text-sm font-medium text-white">{fee}</span>
                </div>

                {/* Slippage */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm text-white/70">Slippage Tolerance</span>
                  <span className="text-sm font-medium text-white">{slippage}%</span>
                </div>
              </div>

              {/* Warnings */}
              {isHighImpact && (
                <div className="flex items-start gap-3 p-4 glass-card border border-red-500/30 rounded-xl">
                  <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-red-400 mb-1">High Price Impact</p>
                    <p className="text-sm text-red-300">
                      This swap will have a high price impact ({formatPriceImpact(priceImpact)}). 
                      Consider splitting your trade into smaller amounts.
                    </p>
                  </div>
                </div>
              )}

              {isMediumImpact && !isHighImpact && (
                <div className="flex items-start gap-3 p-4 glass-card border border-yellow-500/30 rounded-xl">
                  <Info className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="font-medium text-yellow-400 mb-1">Medium Price Impact</p>
                    <p className="text-sm text-yellow-300">
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
