'use client'

import React, { useState, useEffect } from 'react'
import {
  priceToTick,
  tickToPrice,
  getNearestValidTick,
  getTickSpacing,
  getPriceRangeFromPercentage,
  getFullRangeTicks,
} from '@/lib/tickMath'
import { calculateLiquidityMultiplier, formatPrice } from '@/lib/positionAnalysis'

interface PriceRangeSelectorProps {
  currentPrice: number | null
  feeTier: number
  onRangeChange: (minTick: number, maxTick: number) => void
  disabled?: boolean
}

const PRESET_RANGES = [
  { label: '±5%', percentage: 5 },
  { label: '±10%', percentage: 10 },
  { label: '±25%', percentage: 25 },
  { label: '±50%', percentage: 50 },
  { label: 'Full Range', percentage: null },
]

export function PriceRangeSelector({
  currentPrice,
  feeTier,
  onRangeChange,
  disabled,
}: PriceRangeSelectorProps) {
  const tickSpacing = getTickSpacing(feeTier)
  
  const [minPrice, setMinPrice] = useState<string>('')
  const [maxPrice, setMaxPrice] = useState<string>('')
  const [minTick, setMinTick] = useState<number>(0)
  const [maxTick, setMaxTick] = useState<number>(0)
  const [minSlider, setMinSlider] = useState<number>(25) // 0-100 range
  const [maxSlider, setMaxSlider] = useState<number>(75) // 0-100 range

  // Initialize with full range
  useEffect(() => {
    if (currentPrice === null) return
    
    const { minTick: fullMinTick, maxTick: fullMaxTick } = getFullRangeTicks(tickSpacing)
    setMinTick(fullMinTick)
    setMaxTick(fullMaxTick)
    setMinPrice(formatPrice(tickToPrice(fullMinTick)))
    setMaxPrice(formatPrice(tickToPrice(fullMaxTick)))
    onRangeChange(fullMinTick, fullMaxTick)
  }, [tickSpacing, currentPrice])

  const handlePresetClick = (percentage: number | null) => {
    if (currentPrice === null) return
    
    if (percentage === null) {
      // Full range
      const { minTick: fullMinTick, maxTick: fullMaxTick } = getFullRangeTicks(tickSpacing)
      setMinTick(fullMinTick)
      setMaxTick(fullMaxTick)
      setMinPrice(formatPrice(tickToPrice(fullMinTick)))
      setMaxPrice(formatPrice(tickToPrice(fullMaxTick)))
      setMinSlider(0)
      setMaxSlider(100)
      onRangeChange(fullMinTick, fullMaxTick)
    } else {
      // Percentage range
      const { minTick: newMinTick, maxTick: newMaxTick, minPrice: newMinPrice, maxPrice: newMaxPrice } =
        getPriceRangeFromPercentage(currentPrice, percentage, tickSpacing)
      
      setMinTick(newMinTick)
      setMaxTick(newMaxTick)
      setMinPrice(formatPrice(newMinPrice))
      setMaxPrice(formatPrice(newMaxPrice))
      
      // Update sliders to match
      const currentTick = priceToTick(currentPrice)
      const tickRange = newMaxTick - newMinTick
      setMinSlider(40)
      setMaxSlider(60)
      
      onRangeChange(newMinTick, newMaxTick)
    }
  }

  const handleMinPriceChange = (value: string) => {
    setMinPrice(value)
    const priceNum = parseFloat(value)
    if (!isNaN(priceNum) && priceNum > 0) {
      const rawTick = priceToTick(priceNum)
      const validTick = getNearestValidTick(rawTick, tickSpacing)
      setMinTick(validTick)
      onRangeChange(validTick, maxTick)
    }
  }

  const handleMaxPriceChange = (value: string) => {
    setMaxPrice(value)
    const priceNum = parseFloat(value)
    if (!isNaN(priceNum) && priceNum > 0) {
      const rawTick = priceToTick(priceNum)
      const validTick = getNearestValidTick(rawTick, tickSpacing)
      setMaxTick(validTick)
      onRangeChange(minTick, validTick)
    }
  }

  // Handle slider changes for min price
  const handleMinSliderChange = (value: number) => {
    if (currentPrice === null || value >= maxSlider) return
    
    setMinSlider(value)
    
    // Convert slider value (0-100) to price
    // Use logarithmic scale for better UX
    const sliderRange = 100
    const priceRangeLog = Math.log(currentPrice * 3) - Math.log(currentPrice / 3)
    const minPriceLog = Math.log(currentPrice / 3) + (value / sliderRange) * priceRangeLog
    const newMinPrice = Math.exp(minPriceLog)
    
    const rawTick = priceToTick(newMinPrice)
    const validTick = getNearestValidTick(rawTick, tickSpacing)
    const actualPrice = tickToPrice(validTick)
    
    setMinTick(validTick)
    setMinPrice(formatPrice(actualPrice))
    onRangeChange(validTick, maxTick)
  }

  // Handle slider changes for max price
  const handleMaxSliderChange = (value: number) => {
    if (currentPrice === null || value <= minSlider) return
    
    setMaxSlider(value)
    
    // Convert slider value (0-100) to price
    const sliderRange = 100
    const priceRangeLog = Math.log(currentPrice * 3) - Math.log(currentPrice / 3)
    const maxPriceLog = Math.log(currentPrice / 3) + (value / sliderRange) * priceRangeLog
    const newMaxPrice = Math.exp(maxPriceLog)
    
    const rawTick = priceToTick(newMaxPrice)
    const validTick = getNearestValidTick(rawTick, tickSpacing)
    const actualPrice = tickToPrice(validTick)
    
    setMaxTick(validTick)
    setMaxPrice(formatPrice(actualPrice))
    onRangeChange(minTick, validTick)
  }

  const minPriceNum = parseFloat(minPrice) || 0
  const maxPriceNum = parseFloat(maxPrice) || 0
  const isValidRange = minPriceNum > 0 && maxPriceNum > minPriceNum

  const liquidityMultiplier = isValidRange
    ? calculateLiquidityMultiplier(minTick, maxTick)
    : 1

  // Calculate if current price is in range
  const currentTick = currentPrice && currentPrice > 0 ? priceToTick(currentPrice) : 0
  const isInRange = currentPrice ? (currentTick >= minTick && currentTick <= maxTick) : false

  // Calculate percentage from current price
  const percentageFromCurrent = currentPrice && currentPrice > 0 ? {
    min: ((minPriceNum / currentPrice - 1) * 100).toFixed(1),
    max: ((maxPriceNum / currentPrice - 1) * 100).toFixed(1),
  } : { min: '0', max: '0' }

  if (currentPrice === null) {
    return (
      <div className="space-y-4">
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">Loading pool information...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Price Range
        </label>
        <p className="text-xs text-gray-500 mb-3">
          Select the price range for your position. Narrower ranges provide more capital efficiency but may go out of range.
        </p>
      </div>

      {/* Preset Buttons */}
      <div className="flex gap-2 flex-wrap">
        {PRESET_RANGES.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => handlePresetClick(preset.percentage)}
            disabled={disabled}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Interactive Sliders */}
      <div className="space-y-6">
        {/* Min Price Slider */}
        <div>
          <label className="block text-xs text-gray-600 mb-2">Min Price (Drag to adjust)</label>
          <input
            type="range"
            min="0"
            max="100"
            value={minSlider}
            onChange={(e) => handleMinSliderChange(parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            style={{
              background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${minSlider}%, #e5e7eb ${minSlider}%, #e5e7eb 100%)`
            }}
          />
        </div>

        {/* Max Price Slider */}
        <div>
          <label className="block text-xs text-gray-600 mb-2">Max Price (Drag to adjust)</label>
          <input
            type="range"
            min="0"
            max="100"
            value={maxSlider}
            onChange={(e) => handleMaxSliderChange(parseInt(e.target.value))}
            disabled={disabled}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
            style={{
              background: `linear-gradient(to right, #e5e7eb 0%, #e5e7eb ${maxSlider}%, #9333ea ${maxSlider}%, #9333ea 100%)`
            }}
          />
        </div>
      </div>

      {/* Visual Range Indicator */}
      <div className="relative h-24 bg-gradient-to-r from-blue-100 via-green-100 to-blue-100 rounded-lg p-4">
        <div className="relative h-full">
          {/* Current Price Indicator */}
          {currentPrice > 0 && isValidRange && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-orange-500"
              style={{
                left: `${Math.max(0, Math.min(100, ((currentPrice - minPriceNum) / (maxPriceNum - minPriceNum)) * 100))}%`,
              }}
            >
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <div className="bg-orange-500 text-white text-xs px-2 py-1 rounded">
                  Current: {formatPrice(currentPrice)}
                </div>
              </div>
            </div>
          )}

          {/* Range Labels */}
          <div className="absolute bottom-0 left-0 text-xs font-medium text-blue-700">
            Min
          </div>
          <div className="absolute bottom-0 right-0 text-xs font-medium text-blue-700">
            Max
          </div>
        </div>
      </div>

      {/* Manual Price Inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Min Price
          </label>
          <input
            type="number"
            value={minPrice}
            onChange={(e) => handleMinPriceChange(e.target.value)}
            placeholder="0.0"
            step="any"
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {currentPrice > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {percentageFromCurrent.min}% from current
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Max Price
          </label>
          <input
            type="number"
            value={maxPrice}
            onChange={(e) => handleMaxPriceChange(e.target.value)}
            placeholder="0.0"
            step="any"
            disabled={disabled}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          {currentPrice > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              +{percentageFromCurrent.max}% from current
            </p>
          )}
        </div>
      </div>

      {/* Range Statistics */}
      {isValidRange && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Capital Efficiency:</span>
            <span className="font-semibold text-blue-600">
              {liquidityMultiplier.toFixed(2)}x
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Position Status:</span>
            <span className={`font-semibold ${isInRange ? 'text-green-600' : 'text-yellow-600'}`}>
              {isInRange ? 'In Range ✓' : 'Out of Range'}
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Tick Range:</span>
            <span className="font-mono text-xs text-gray-700">
              {minTick} to {maxTick}
            </span>
          </div>
        </div>
      )}

      {!isValidRange && (
        <div className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">
          Invalid range: Max price must be greater than min price
        </div>
      )}
    </div>
  )
}
