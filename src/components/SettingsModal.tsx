'use client'

import React, { useState } from 'react'
import { X, Settings } from 'lucide-react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  slippage: number
  onSlippageChange: (slippage: number) => void
  deadline: number
  onDeadlineChange: (deadline: number) => void
}

export function SettingsModal({
  isOpen,
  onClose,
  slippage,
  onSlippageChange,
  deadline,
  onDeadlineChange,
}: SettingsModalProps) {
  const [customSlippage, setCustomSlippage] = useState(slippage.toString())

  const handleSlippageChange = (value: number) => {
    onSlippageChange(value)
    setCustomSlippage(value.toString())
  }

  const handleCustomSlippageChange = (value: string) => {
    setCustomSlippage(value)
    const numValue = parseFloat(value)
    if (!isNaN(numValue)) {
      onSlippageChange(numValue)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Slippage Tolerance */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Slippage Tolerance
            </label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[0.1, 0.5, 1].map((value) => (
                <button
                  key={value}
                  onClick={() => handleSlippageChange(value)}
                  className={`px-3 py-2 text-sm rounded-md border ${
                    slippage === value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {value}%
                </button>
              ))}
            </div>
            <div className="relative">
              <input
                type="number"
                value={customSlippage}
                onChange={(e) => handleCustomSlippageChange(e.target.value)}
                placeholder="Custom"
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                step="0.1"
                min="0"
                max="50"
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500">
                %
              </span>
            </div>
            {slippage > 5 && (
              <p className="text-sm text-red-500 mt-1">
                Warning: High slippage tolerance
              </p>
            )}
          </div>

          {/* Transaction Deadline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Transaction Deadline
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={deadline}
                onChange={(e) => onDeadlineChange(parseInt(e.target.value) || 20)}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="1"
                max="4320"
              />
              <span className="text-gray-500">minutes</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Your transaction will revert if it is pending for more than this long.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
