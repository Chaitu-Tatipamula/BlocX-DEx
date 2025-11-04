'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useAccount, usePublicClient } from 'wagmi'
import { X, Search, Wallet, TrendingUp, Clock, Import, CheckCircle2, AlertCircle } from 'lucide-react'
import { tokenList, type Token } from '@/config/tokens'
import { getTokenBalance } from '@/lib/swap'
import { formatBalance } from '@/lib/utils'
import { parseUnits, formatUnits } from 'viem'

const ERC20_ABI = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'symbol',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'name',
    outputs: [{ name: '', type: 'string' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
] as const

interface TokenSelectModalProps {
  isOpen: boolean
  onClose: () => void
  onTokenSelect: (token: Token) => void
  selectedToken: Token | null
  excludeTokens?: Token[]
  excludeBCX?: boolean
}

interface ImportedToken extends Token {
  imported: boolean
}

export function TokenSelectModal({
  isOpen,
  onClose,
  onTokenSelect,
  selectedToken,
  excludeTokens = [],
  excludeBCX = false,
}: TokenSelectModalProps) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [importAddress, setImportAddress] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importedTokens, setImportedTokens] = useState<ImportedToken[]>([])
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({})
  const [loadingBalances, setLoadingBalances] = useState(false)
  const [activeTab, setActiveTab] = useState<'select' | 'import'>('select')

  // Load imported tokens from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('importedTokens')
    if (saved) {
      try {
        const tokens = JSON.parse(saved)
        setImportedTokens(tokens)
      } catch (e) {
        console.error('Error loading imported tokens:', e)
      }
    }
  }, [])

  // Load token balances
  useEffect(() => {
    if (isOpen && isConnected && address && publicClient) {
      loadTokenBalances()
    }
  }, [isOpen, isConnected, address, publicClient])

  const loadTokenBalances = async () => {
    if (!address || !publicClient) return
    
    setLoadingBalances(true)
    const balances: Record<string, string> = {}
    
    const allTokens = [...tokenList, ...importedTokens]
    
    for (const token of allTokens) {
      try {
        const balance = await getTokenBalance(publicClient, token.address, address, token.decimals)
        balances[token.address] = balance
      } catch (e) {
        balances[token.address] = '0'
      }
    }
    
    setTokenBalances(balances)
    setLoadingBalances(false)
  }

  const importTokenByAddress = async () => {
    if (!importAddress || !publicClient || !address) return
    
    const tokenAddress = importAddress.trim().toLowerCase()
    
    // Validate address format
    if (!tokenAddress.startsWith('0x') || tokenAddress.length !== 42) {
      setImportError('Invalid address format')
      return
    }

    // Check if token is already in the list
    const existingToken = [...tokenList, ...importedTokens].find(
      t => t.address.toLowerCase() === tokenAddress
    )
    
    if (existingToken) {
      setImportError('Token already exists')
      return
    }

    setImporting(true)
    setImportError('')

    try {
      // Fetch token info
      const [symbol, name, decimals] = await Promise.all([
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'symbol',
        }),
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'name',
        }),
        publicClient.readContract({
          address: tokenAddress as `0x${string}`,
          abi: ERC20_ABI,
          functionName: 'decimals',
        }),
      ])

      const newToken: ImportedToken = {
        address: tokenAddress,
        symbol: symbol as string,
        name: name as string,
        decimals: Number(decimals),
        imported: true,
      }

      const updated = [...importedTokens, newToken]
      setImportedTokens(updated)
      localStorage.setItem('importedTokens', JSON.stringify(updated))
      
      setImportAddress('')
      setActiveTab('select')
      
      // Load balance for new token
      if (isConnected) {
        try {
          const balance = await getTokenBalance(publicClient, tokenAddress, address, Number(decimals))
          setTokenBalances(prev => ({ ...prev, [tokenAddress]: balance }))
        } catch (e) {
          // Ignore balance errors
        }
      }
    } catch (error) {
      console.error('Error importing token:', error)
      setImportError('Failed to import token. Please verify the address.')
    } finally {
      setImporting(false)
    }
  }

  const popularTokens = useMemo(() => {
    return tokenList.filter(token => 
      ['BCX', 'WBCX', 'TEST', 'FRESH'].includes(token.symbol)
    )
  }, [])

  const userTokens = useMemo(() => {
    const allTokens = [...tokenList, ...importedTokens]
    return allTokens.filter(token => {
      const balance = tokenBalances[token.address]
      return balance && parseFloat(balance) > 0
    })
  }, [tokenBalances, importedTokens])

  const filteredTokens = useMemo(() => {
    const allTokens = [...tokenList, ...importedTokens]
    
    return allTokens.filter(token => {
      // Exclude BCX if requested
      if (excludeBCX && token.symbol === 'BCX') return false
      
      // Exclude specified tokens
      if (excludeTokens.some(t => t.address === token.address)) return false
      
      // Filter by search
      if (searchTerm) {
        const search = searchTerm.toLowerCase()
        return (
          token.symbol.toLowerCase().includes(search) ||
          token.name.toLowerCase().includes(search) ||
          token.address.toLowerCase().includes(search)
        )
      }
      
      return true
    })
  }, [searchTerm, excludeTokens, excludeBCX, importedTokens])

  const handleTokenSelect = (token: Token) => {
    onTokenSelect(token)
    onClose()
    setSearchTerm('')
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
      <div className="relative glass-modal w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden text-white">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-xl font-semibold text-white">Select a token</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          <button
            onClick={() => setActiveTab('select')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'select'
                ? 'text-white border-b-2 border-white/30 bg-white/5'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Select
          </button>
          <button
            onClick={() => setActiveTab('import')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'import'
                ? 'text-white border-b-2 border-white/30 bg-white/5'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Import
          </button>
        </div>

        {activeTab === 'select' ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Search */}
            <div className="p-4 border-b border-white/10">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-white/50" />
                <input
                  type="text"
                  placeholder="Search tokens"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="glass-input w-full pl-10 pr-3 py-2.5 text-white"
                  autoFocus
                />
              </div>
            </div>

            {/* Popular Tokens */}
            {!searchTerm && (
              <div className="p-4 border-b border-white/10">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="w-4 h-4 text-white/60" />
                  <span className="text-sm font-medium text-white/80">Popular tokens</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {popularTokens
                    .filter(t => !excludeTokens.some(et => et.address === t.address))
                    .filter(t => !excludeBCX || t.symbol !== 'BCX')
                    .map((token) => (
                      <button
                        key={token.address}
                        onClick={() => handleTokenSelect(token)}
                        className="flex items-center gap-2 px-3 py-1.5 glass-button rounded-full text-sm"
                      >
                        <div className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center">
                          <span className="text-xs font-medium text-white">{token.symbol.charAt(0)}</span>
                        </div>
                        <span className="text-sm font-medium">{token.symbol}</span>
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Token List */}
            <div className="flex-1 overflow-y-auto">
              {/* Your tokens */}
              {!searchTerm && userTokens.length > 0 && (
                <div className="p-4 border-b border-white/10">
                  <div className="flex items-center gap-2 mb-3">
                    <Wallet className="w-4 h-4 text-white/60" />
                    <span className="text-sm font-medium text-white/80">Your tokens</span>
                  </div>
                  <div className="space-y-1">
                    {userTokens
                      .filter(t => !excludeTokens.some(et => et.address === t.address))
                      .filter(t => !excludeBCX || t.symbol !== 'BCX')
                      .map((token) => (
                        <TokenRow
                          key={token.address}
                          token={token}
                          balance={tokenBalances[token.address] || '0'}
                          isSelected={selectedToken?.address === token.address}
                          onSelect={() => handleTokenSelect(token)}
                        />
                      ))}
                  </div>
                </div>
              )}

              {/* All tokens */}
              <div className="p-4">
                <div className="mb-3">
                  <span className="text-sm font-medium text-white/80">
                    {searchTerm ? 'Search results' : 'Tokens'}
                  </span>
                </div>
                <div className="space-y-1">
                  {filteredTokens.length === 0 ? (
                    <div className="text-center py-8 text-white/50">
                      <p>No tokens found</p>
                    </div>
                  ) : (
                    filteredTokens.map((token) => (
                      <TokenRow
                        key={token.address}
                        token={token}
                        balance={tokenBalances[token.address] || '0'}
                        isSelected={selectedToken?.address === token.address}
                        onSelect={() => handleTokenSelect(token)}
                        isImported={(token as ImportedToken).imported}
                      />
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-white/90 mb-2">Import token</h3>
              <p className="text-xs text-white/60 mb-4">
                Import a token by entering its contract address on BlockX network
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Token contract address
                </label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={importAddress}
                  onChange={(e) => {
                    setImportAddress(e.target.value)
                    setImportError('')
                  }}
                  className="glass-input w-full px-3 py-2.5 text-white"
                />
                {importError && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>{importError}</span>
                  </div>
                )}
              </div>

              <button
                onClick={importTokenByAddress}
                disabled={!importAddress || importing}
                className="glass-button-primary w-full py-2.5 px-4 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {importing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <Import className="w-4 h-4" />
                    <span>Import</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface TokenRowProps {
  token: Token
  balance: string
  isSelected: boolean
  onSelect: () => void
  isImported?: boolean
}

function TokenRow({ token, balance, isSelected, onSelect, isImported }: TokenRowProps) {
  const hasBalance = parseFloat(balance) > 0

  return (
    <button
      onClick={onSelect}
      className="w-full p-3 hover:bg-white/5 rounded-xl transition-colors flex items-center justify-between group glass-card border border-white/5"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center border border-white/20">
          {token.logoURI ? (
            <img src={token.logoURI} alt={token.symbol} className="w-full h-full rounded-full" />
          ) : (
            <span className="text-sm font-medium text-white">{token.symbol.charAt(0)}</span>
          )}
        </div>
        <div className="text-left">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">{token.symbol}</span>
            {isImported && (
              <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-lg border border-yellow-500/30">
                Imported
              </span>
            )}
          </div>
          <div className="text-sm text-white/60">{token.name}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {hasBalance && (
          <div className="text-right">
            <div className="text-sm font-medium text-white">{formatBalance(balance)}</div>
          </div>
        )}
        {isSelected && (
          <CheckCircle2 className="w-5 h-5 text-white" />
        )}
      </div>
    </button>
  )
}
