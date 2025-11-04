'use client'

import React, { useMemo } from 'react'
import Link from 'next/link'
import { PositionDetails } from '@/types/position'
import { formatBalance } from '@/lib/utils'
import { formatPrice, getPositionStatusBadge } from '@/lib/positionAnalysis'
import { tokenList, type Token } from '@/config/tokens'

interface PositionInfoCardProps {
  position: PositionDetails
  onCollectFees?: (tokenId: string) => void
  onIncrease?: (tokenId: string) => void
  onRemove?: (tokenId: string) => void
  isLoading?: boolean
  showActions?: boolean
}

export function PositionInfoCard({
  position,
  onCollectFees,
  onIncrease,
  onRemove,
  isLoading,
  showActions = true,
}: PositionInfoCardProps) {
  const statusBadge = getPositionStatusBadge(position.inRange)
  const hasFees = parseFloat(position.tokensOwed0) > 0 || parseFloat(position.tokensOwed1) > 0

  // Get token info from addresses
  const token0 = useMemo(() => {
    return tokenList.find(t => t.address.toLowerCase() === position.token0.toLowerCase()) || null
  }, [position.token0])
  
  const token1 = useMemo(() => {
    return tokenList.find(t => t.address.toLowerCase() === position.token1.toLowerCase()) || null
  }, [position.token1])

  // Calculate position on price bar (0-100%)
  const pricePosition = position.inRange
    ? ((position.currentPrice - position.priceRangeLower) /
        (position.priceRangeUpper - position.priceRangeLower)) *
      100
    : position.currentPrice < position.priceRangeLower
    ? 0
    : 100

  return (
    <div className="glass-card border border-white/10 rounded-xl p-4 transition-all hover:border-white/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <Link
          href={`/positions/${position.tokenId}`}
          className="font-medium text-white hover:text-white/80 transition-colors"
        >
          Position #{position.tokenId}
        </Link>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          position.inRange 
            ? 'bg-green-500/20 text-green-300 border border-green-500/30' 
            : 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
        }`}>
          {statusBadge.label}
        </span>
      </div>

      {/* Token Pair */}
      <div className="flex items-center gap-2 mb-3">
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
        <span className="text-sm text-white/70">
          {(position.fee / 10000).toFixed(2)}% Fee Tier
        </span>
      </div>

      {/* Price Range Visualization */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-white/70 mb-1">
          <span>Min: {formatPrice(position.priceRangeLower, 4)}</span>
          <span>Max: {formatPrice(position.priceRangeUpper, 4)}</span>
        </div>
        <div className="relative h-2 glass-card rounded-full overflow-hidden">
          {/* Active range */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-600"></div>
          {/* Current price indicator */}
          {position.inRange && (
            <div
              className="absolute top-0 bottom-0 w-1 bg-orange-400"
              style={{ left: `${Math.max(0, Math.min(100, pricePosition))}%` }}
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="glass-card border border-orange-400/30 text-white text-xs px-1.5 py-0.5 rounded">
                  {formatPrice(position.currentPrice, 4)}
                </div>
              </div>
            </div>
          )}
        </div>
        {!position.inRange && (
          <p className="text-xs text-yellow-300 mt-1">
            {position.currentPrice < position.priceRangeLower
              ? 'Price below range'
              : 'Price above range'}
          </p>
        )}
      </div>

      {/* Position Stats */}
      <div className="glass-card rounded p-2 mb-3">
        <p className="text-xs text-white/70">Est. APR</p>
        <p className="text-sm font-semibold text-white">
          {position.estimatedAPR.toFixed(2)}%
        </p>
      </div>

      {/* Token Amounts */}
      <div className="space-y-1 mb-3">
        <div className="flex justify-between text-sm">
          <span className="text-white/70">Amount 0:</span>
          <span className="font-medium text-white">{formatBalance(position.amount0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-white/70">Amount 1:</span>
          <span className="font-medium text-white">{formatBalance(position.amount1)}</span>
        </div>
      </div>

      {/* Uncollected Fees */}
      {hasFees && (
        <div className="glass-card border border-green-500/30 rounded p-2 mb-3">
          <p className="text-xs text-green-300 font-medium mb-1">Uncollected Fees</p>
          <div className="flex justify-between text-xs">
            <span className="text-green-300/80">Token 0:</span>
            <span className="text-green-300 font-medium">
              {formatBalance(position.tokensOwed0)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-green-300/80">Token 1:</span>
            <span className="text-green-300 font-medium">
              {formatBalance(position.tokensOwed1)}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      {showActions && (
        <div className="flex gap-2">
          {onCollectFees && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onCollectFees(position.tokenId)
              }}
              disabled={isLoading || !hasFees}
              className="glass-button-primary flex-1 px-3 py-2 text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Collect
            </button>
          )}
          {onIncrease && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onIncrease(position.tokenId)
              }}
              disabled={isLoading}
              className="glass-button-primary flex-1 px-3 py-2 text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          )}
          {onRemove && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onRemove(position.tokenId)
              }}
              disabled={isLoading}
              className="glass-button-primary flex-1 px-3 py-2 text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  )
}

