'use client'

import React from 'react'
import Link from 'next/link'
import { PositionDetails } from '@/types/position'
import { formatBalance } from '@/lib/utils'
import { formatPrice, getPositionStatusBadge } from '@/lib/positionAnalysis'

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

  // Calculate position on price bar (0-100%)
  const pricePosition = position.inRange
    ? ((position.currentPrice - position.priceRangeLower) /
        (position.priceRangeUpper - position.priceRangeLower)) *
      100
    : position.currentPrice < position.priceRangeLower
    ? 0
    : 100

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <Link
          href={`/positions/${position.tokenId}`}
          className="font-medium text-gray-900 hover:text-blue-600 transition-colors"
        >
          Position #{position.tokenId}
        </Link>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}>
          {statusBadge.label}
        </span>
      </div>

      {/* Token Pair */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex -space-x-2">
          <div className="w-6 h-6 rounded-full bg-linear-to-br from-blue-400 to-blue-600 border-2 border-white flex items-center justify-center text-white text-xs font-bold">
            {position.token0.substring(0, 1)}
          </div>
          <div className="w-6 h-6 rounded-full bg-linear-to-br from-purple-400 to-purple-600 border-2 border-white flex items-center justify-center text-white text-xs font-bold">
            {position.token1.substring(0, 1)}
          </div>
        </div>
        <span className="text-sm text-gray-600">
          {(position.fee / 10000).toFixed(2)}% Fee Tier
        </span>
      </div>

      {/* Price Range Visualization */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-600 mb-1">
          <span>Min: {formatPrice(position.priceRangeLower, 4)}</span>
          <span>Max: {formatPrice(position.priceRangeUpper, 4)}</span>
        </div>
        <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
          {/* Active range */}
          <div className="absolute inset-0 bg-linear-to-r from-blue-400 to-blue-600"></div>
          {/* Current price indicator */}
          {position.inRange && (
            <div
              className="absolute top-0 bottom-0 w-1 bg-orange-500"
              style={{ left: `${Math.max(0, Math.min(100, pricePosition))}%` }}
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded">
                  {formatPrice(position.currentPrice, 4)}
                </div>
              </div>
            </div>
          )}
        </div>
        {!position.inRange && (
          <p className="text-xs text-yellow-600 mt-1">
            {position.currentPrice < position.priceRangeLower
              ? 'Price below range'
              : 'Price above range'}
          </p>
        )}
      </div>

      {/* Position Stats */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gray-50 rounded p-2">
          <p className="text-xs text-gray-600">Liquidity</p>
          <p className="text-sm font-semibold text-gray-900 truncate">
            {formatBalance(position.liquidity)}
          </p>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <p className="text-xs text-gray-600">Est. APR</p>
          <p className="text-sm font-semibold text-gray-900">
            {position.estimatedAPR.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Token Amounts */}
      <div className="space-y-1 mb-3">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Amount 0:</span>
          <span className="font-medium text-gray-900">{formatBalance(position.amount0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">Amount 1:</span>
          <span className="font-medium text-gray-900">{formatBalance(position.amount1)}</span>
        </div>
      </div>

      {/* Uncollected Fees */}
      {hasFees && (
        <div className="bg-green-50 border border-green-200 rounded p-2 mb-3">
          <p className="text-xs text-green-700 font-medium mb-1">Uncollected Fees</p>
          <div className="flex justify-between text-xs">
            <span className="text-green-600">Token 0:</span>
            <span className="text-green-800 font-medium">
              {formatBalance(position.tokensOwed0)}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-green-600">Token 1:</span>
            <span className="text-green-800 font-medium">
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
              className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              className="flex-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              className="flex-1 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  )
}

