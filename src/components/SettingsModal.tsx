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
        className="glass-modal-backdrop absolute inset-0"
        onClick={onClose}
      />
      {/* Modal */}
      <div className="relative glass-modal max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden text-white">
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-white" />
            <h2 className="text-lg font-semibold text-white">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-full text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Slippage Tolerance */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Slippage Tolerance
            </label>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[0.1, 0.5, 1].map((value) => (
                <button
                  key={value}
                  onClick={() => handleSlippageChange(value)}
                  className={`px-3 py-2 text-sm rounded-xl border transition-colors ${
                    slippage === value
                      ? 'glass-button-primary border-white/30 text-black'
                      : 'glass-button border-white/15 text-white'
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
                className="glass-input w-full px-3 py-2 text-white pr-10"
                step="0.1"
                min="0"
                max="50"
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/60">
                %
              </span>
            </div>
            {slippage > 5 && (
              <p className="text-sm text-red-400 mt-1">
                Warning: High slippage tolerance
              </p>
            )}
          </div>

          {/* Transaction Deadline */}
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Transaction Deadline
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={deadline}
                onChange={(e) => onDeadlineChange(parseInt(e.target.value) || 20)}
                className="glass-input flex-1 px-3 py-2 text-white"
                min="1"
                max="4320"
              />
              <span className="text-white/60">minutes</span>
            </div>
            <p className="text-xs text-white/50 mt-1">
              Your transaction will revert if it is pending for more than this long.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={onClose}
            className="glass-button-primary w-full px-4 py-2"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
