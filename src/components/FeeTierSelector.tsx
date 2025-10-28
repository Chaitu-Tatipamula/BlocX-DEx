'use client'

import React from 'react'
import { FEE_TIERS } from '@/types/pool'

interface FeeTierSelectorProps {
  selectedFee: number
  onFeeSelect: (fee: number) => void
  disabled?: boolean
}

export function FeeTierSelector({ selectedFee, onFeeSelect, disabled }: FeeTierSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Fee Tier
      </label>
      <div className="grid grid-cols-2 gap-3">
        {FEE_TIERS.map((tier) => {
          const isSelected = selectedFee === tier.fee
          return (
            <button
              key={tier.fee}
              type="button"
              onClick={() => onFeeSelect(tier.fee)}
              disabled={disabled}
              className={`
                relative p-4 rounded-lg border-2 transition-all text-left
                ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg font-semibold text-gray-900">
                  {tier.label}
                </span>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-white"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-600">{tier.description}</p>
              <div className="mt-2 text-xs text-gray-500">
                Tick spacing: {tier.tickSpacing}
              </div>
            </button>
          )
        })}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Lower fees are better for stable pairs with high volume. Higher fees provide more rewards but may reduce trading activity.
      </p>
    </div>
  )
}

