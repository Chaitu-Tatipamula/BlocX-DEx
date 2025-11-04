'use client'

import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { type Token } from '@/config/tokens'
import { formatBalance } from '@/lib/utils'
import { TokenSelectModal } from './TokenSelectModal'

interface TokenSelectorProps {
  selectedToken: Token | null
  onTokenSelect: (token: Token) => void
  balance?: string
  disabled?: boolean
  excludeBCX?: boolean
  excludeTokens?: Token[]
  compact?: boolean
}

export function TokenSelector({ 
  selectedToken, 
  onTokenSelect, 
  balance = '0',
  disabled = false,
  excludeBCX = false,
  excludeTokens = [],
  compact = false,
}: TokenSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)

  if (compact) {
    return (
      <>
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={disabled}
          className="flex items-center gap-2 px-3 py-2 glass-button rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          {selectedToken ? (
            <>
              <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center shrink-0 p-0.5 border-2 border-white/20">
                {selectedToken.logoURI ? (
                  <img src={selectedToken.logoURI} alt={selectedToken.symbol} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                    <span className="text-xs font-medium text-white">
                      {selectedToken.symbol.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              <span className="font-medium text-white">{selectedToken.symbol}</span>
              <ChevronDown className="w-4 h-4 text-white/70 shrink-0" />
            </>
          ) : (
            <>
              <span className="text-white/70 text-sm">Select</span>
              <ChevronDown className="w-4 h-4 text-white/70 shrink-0" />
            </>
          )}
        </button>

        <TokenSelectModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onTokenSelect={onTokenSelect}
          selectedToken={selectedToken}
          excludeTokens={excludeTokens}
          excludeBCX={excludeBCX}
        />
      </>
    )
  }

  return (
    <>
      <button
        onClick={() => setIsModalOpen(true)}
        disabled={disabled}
        className="w-full p-3 glass-button rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between min-h-[56px]"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {selectedToken ? (
            <>
              <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shrink-0 p-0.5 border-2 border-white/20">
                {selectedToken.logoURI ? (
                  <img src={selectedToken.logoURI} alt={selectedToken.symbol} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center">
                    <span className="text-sm font-medium text-white">
                      {selectedToken.symbol.charAt(0)}
                    </span>
                  </div>
                )}
              </div>
              <div className="text-left min-w-0 flex-1">
                <div className="font-medium text-white truncate">{selectedToken.symbol}</div>
                <div className="text-sm text-white/70 truncate">{selectedToken.name}</div>
              </div>
            </>
          ) : (
            <span className="text-white/70">Select token</span>
          )}
        </div>
        <ChevronDown className="w-5 h-5 text-white/70 shrink-0" />
      </button>

      <TokenSelectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onTokenSelect={onTokenSelect}
        selectedToken={selectedToken}
        excludeTokens={excludeTokens}
        excludeBCX={excludeBCX}
      />
    </>
  )
}
