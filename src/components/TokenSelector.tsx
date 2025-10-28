'use client'

import React, { useState } from 'react'
import { Search, ChevronDown } from 'lucide-react'
import { tokenList, type Token } from '@/config/tokens'
import { formatBalance } from '@/lib/utils'

interface TokenSelectorProps {
  selectedToken: Token | null
  onTokenSelect: (token: Token) => void
  balance?: string
  disabled?: boolean
  excludeBCX?: boolean // New prop to exclude BCX for liquidity operations
}

export function TokenSelector({ 
  selectedToken, 
  onTokenSelect, 
  balance = '0',
  disabled = false,
  excludeBCX = false
}: TokenSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')

  const filteredTokens = tokenList.filter(token => {
    // Filter by search term
    const matchesSearch = token.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      token.name.toLowerCase().includes(searchTerm.toLowerCase())
    
    // Exclude BCX if requested (for liquidity operations)
    const isNotBCX = !excludeBCX || token.symbol !== 'BCX'
    
    return matchesSearch && isNotBCX
  })

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className="w-full p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {selectedToken ? (
              <>
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium">
                    {selectedToken.symbol.charAt(0)}
                  </span>
                </div>
                <div className="text-left">
                  <div className="font-medium">{selectedToken.symbol}</div>
                  <div className="text-sm text-gray-500">{selectedToken.name}</div>
                </div>
              </>
            ) : (
              <span className="text-gray-500">Select token</span>
            )}
          </div>
          <ChevronDown className="w-5 h-5 text-gray-400" />
        </div>
        {selectedToken && (
          <div className="text-right text-sm text-gray-500 mt-1">
            Balance: {formatBalance(balance)}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search tokens..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {filteredTokens.map((token) => (
              <button
                key={token.address}
                onClick={() => {
                  onTokenSelect(token)
                  setIsOpen(false)
                  setSearchTerm('')
                }}
                className="w-full p-3 hover:bg-gray-50 flex items-center gap-3 text-left"
              >
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium">
                    {token.symbol.charAt(0)}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="font-medium">{token.symbol}</div>
                  <div className="text-sm text-gray-500">{token.name}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  )
}
