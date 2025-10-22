'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { ArrowUpDown, Settings, Loader2 } from 'lucide-react'
import { TokenSelector } from './TokenSelector'
import { SettingsModal } from './SettingsModal'
import { tokens, type Token } from '@/config/tokens'
import { getQuote, getTokenBalance, executeSwap, approveToken, getTokenAllowance } from '@/lib/swap'
import { formatBalance, formatPriceImpact, getPriceImpactColor } from '@/lib/utils'

const DEFAULT_SLIPPAGE = 0.5
const DEFAULT_DEADLINE = 20

export function SwapCard() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // State
  const [tokenIn, setTokenIn] = useState<Token | null>(tokens.BCX)
  const [tokenOut, setTokenOut] = useState<Token | null>(tokens.WBCX)
  const [amountIn, setAmountIn] = useState('')
  const [amountOut, setAmountOut] = useState('')
  const [priceImpact, setPriceImpact] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE)
  const [deadline, setDeadline] = useState(DEFAULT_DEADLINE)
  
  // Balances
  const [tokenInBalance, setTokenInBalance] = useState('0')
  const [tokenOutBalance, setTokenOutBalance] = useState('0')

  // Get token balances
  const fetchBalances = useCallback(async () => {
    if (!address || !publicClient) return

    try {
      // Handle BCX (native token) properly
      const inTokenAddress = tokenIn?.symbol === 'BCX' ? 'BCX' : (tokenIn?.address || '')
      const outTokenAddress = tokenOut?.symbol === 'BCX' ? 'BCX' : (tokenOut?.address || '')
      
      const inBalance = await getTokenBalance(publicClient, inTokenAddress, address)
      const outBalance = await getTokenBalance(publicClient, outTokenAddress, address)
      
      setTokenInBalance(inBalance)
      setTokenOutBalance(outBalance)
    } catch (error) {
      console.error('Error fetching balances:', error)
    }
  }, [address, publicClient, tokenIn?.address, tokenIn?.symbol, tokenOut?.address, tokenOut?.symbol])

  // Get quote when amount changes
  useEffect(() => {
    const getQuoteData = async () => {
      if (!amountIn || !tokenIn || !tokenOut || !publicClient) {
        setAmountOut('')
        setPriceImpact(0)
        return
      }

      setIsQuoteLoading(true)
      setError('')

      try {
        const quote = await getQuote(
          publicClient,
          tokenIn.address,
          tokenOut.address,
          amountIn
        )
        
        setAmountOut(quote.amountOut)
        setPriceImpact(quote.priceImpact)
      } catch (err) {
        setError('Failed to get quote')
        setAmountOut('')
        setPriceImpact(0)
      } finally {
        setIsQuoteLoading(false)
      }
    }

    const timeoutId = setTimeout(getQuoteData, 500)
    return () => clearTimeout(timeoutId)
  }, [amountIn, tokenIn, tokenOut, publicClient])

  // Fetch balances when tokens change
  useEffect(() => {
    fetchBalances()
  }, [fetchBalances])

  const handleSwapTokens = () => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setAmountIn(amountOut)
    setAmountOut('')
  }

  const handleMaxClick = () => {
    setAmountIn(tokenInBalance)
  }

  const handleSwap = async () => {
    if (!address || !walletClient || !publicClient || !tokenIn || !tokenOut) {
      setError('Please connect your wallet')
      return
    }

    if (!amountIn || parseFloat(amountIn) <= 0) {
      setError('Please enter a valid amount')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      // Check if token approval is needed
      if (tokenIn.address !== '0x0000000000000000000000000000000000000000') {
        const allowance = await getTokenAllowance(publicClient, tokenIn.address, address)
        const amountInWei = parseFloat(amountIn)
        
        if (parseFloat(allowance) < amountInWei) {
          // Approve token
          const approveHash = await approveToken(walletClient, tokenIn.address, amountIn)
          await publicClient.waitForTransactionReceipt({ hash: approveHash as `0x${string}` })
        }
      }

      // Execute swap
      const swapHash = await executeSwap(walletClient, publicClient, {
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn,
        slippage,
        deadline,
        recipient: address,
      })

      // Wait for transaction
      await publicClient.waitForTransactionReceipt({ hash: swapHash as `0x${string}` })
      
      // Reset form and refresh balances
      setAmountIn('')
      setAmountOut('')
      fetchBalances()
      
    } catch (err: any) {
      setError(err.message || 'Swap failed')
    } finally {
      setIsLoading(false)
    }
  }

  const canSwap = isConnected && amountIn && amountOut && !isLoading && !isQuoteLoading && !error

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h1 className="text-xl font-semibold">Swap</h1>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-gray-100 rounded-full"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Swap Form */}
      <div className="p-4 space-y-4">
        {/* From Token */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">From</span>
            <span className="text-sm text-gray-500">
              Balance: {formatBalance(tokenInBalance)}
            </span>
          </div>
          <div className="flex gap-2">
            <TokenSelector
              selectedToken={tokenIn}
              onTokenSelect={setTokenIn}
              balance={tokenInBalance}
            />
            <div className="flex flex-col gap-1">
              <input
                type="number"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                placeholder="0.0"
                className="w-32 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={handleMaxClick}
                className="text-xs text-blue-600 hover:text-blue-700"
                disabled={isLoading}
              >
                MAX
              </button>
            </div>
          </div>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center">
          <button
            onClick={handleSwapTokens}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
            disabled={isLoading}
          >
            <ArrowUpDown className="w-5 h-5" />
          </button>
        </div>

        {/* To Token */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">To</span>
            <span className="text-sm text-gray-500">
              Balance: {formatBalance(tokenOutBalance)}
            </span>
          </div>
          <div className="flex gap-2">
            <TokenSelector
              selectedToken={tokenOut}
              onTokenSelect={setTokenOut}
              balance={tokenOutBalance}
              disabled={isLoading}
            />
            <div className="w-32 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg flex items-center">
              {isQuoteLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span className="text-gray-900">
                  {amountOut ? formatBalance(amountOut) : '0.0'}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Price Impact */}
        {priceImpact > 0 && (
          <div className="text-sm">
            <span className="text-gray-600">Price Impact: </span>
            <span className={getPriceImpactColor(priceImpact)}>
              {formatPriceImpact(priceImpact)}
            </span>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">
            {error}
          </div>
        )}

        {/* Swap Button */}
        <button
          onClick={handleSwap}
          disabled={!canSwap}
          className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Swapping...
            </div>
          ) : !isConnected ? (
            'Connect Wallet'
          ) : !amountIn ? (
            'Enter Amount'
          ) : (
            'Swap'
          )}
        </button>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        slippage={slippage}
        onSlippageChange={setSlippage}
        deadline={deadline}
        onDeadlineChange={setDeadline}
      />
    </div>
  )
}
