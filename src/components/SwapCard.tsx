'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { ArrowUpDown, Settings, Loader2, CheckCircle, AlertTriangle, XCircle, Plus, Droplets } from 'lucide-react'
import { TokenSelector } from './TokenSelector'
import { SettingsModal } from './SettingsModal'
import { SwapPreview } from './SwapPreview'
import { tokens, type Token } from '@/config/tokens'
import { getQuote, getTokenBalance, executeSwap, approveToken, getTokenAllowance, wrapBCX, unwrapWBCX, isWrapUnwrapOperation, checkPoolExists, checkPoolLiquidity } from '@/lib/swap'
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
  const [minimumReceived, setMinimumReceived] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')
  const [fee, setFee] = useState('0.05%')
  const [isLoading, setIsLoading] = useState(false)
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [slippage, setSlippage] = useState(DEFAULT_SLIPPAGE)
  const [deadline, setDeadline] = useState(DEFAULT_DEADLINE)
  
  // Balances
  const [tokenInBalance, setTokenInBalance] = useState('0')
  const [tokenOutBalance, setTokenOutBalance] = useState('0')
  
  // Pool status
  const [poolExists, setPoolExists] = useState<boolean | null>(null)
  const [poolLiquidity, setPoolLiquidity] = useState<{ hasLiquidity: boolean; liquidity: string } | null>(null)
  const [poolStatus, setPoolStatus] = useState<'checking' | 'exists' | 'no-liquidity' | 'not-exists' | null>(null)

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

  // Check pool status
  const checkPoolStatus = useCallback(async () => {
    if (!tokenIn || !tokenOut || !publicClient) {
      setPoolStatus(null)
      setPoolExists(null)
      setPoolLiquidity(null)
      return
    }

    // Skip for wrap/unwrap operations
    const wrapUnwrapType = isWrapUnwrapOperation(tokenIn, tokenOut)
    if (wrapUnwrapType) {
      setPoolStatus('exists')
      setPoolExists(true)
      setPoolLiquidity({ hasLiquidity: true, liquidity: '∞' })
      return
    }

    setPoolStatus('checking')
    
    try {
      const tokenInAddress = tokenIn.symbol === 'BCX' ? tokens.WBCX.address : tokenIn.address
      const tokenOutAddress = tokenOut.symbol === 'BCX' ? tokens.WBCX.address : tokenOut.address
      const fee = 500

      const exists = await checkPoolExists(publicClient, tokenInAddress, tokenOutAddress, fee)
      setPoolExists(exists)

      if (exists) {
        const liquidity = await checkPoolLiquidity(publicClient, tokenInAddress, tokenOutAddress, fee)
        setPoolLiquidity(liquidity)
        setPoolStatus(liquidity.hasLiquidity ? 'exists' : 'no-liquidity')
      } else {
        setPoolLiquidity({ hasLiquidity: false, liquidity: '0' })
        setPoolStatus('not-exists')
      }
    } catch (error) {
      console.error('Error checking pool status:', error)
      setPoolStatus('not-exists')
    }
  }, [tokenIn, tokenOut, publicClient])

  // Get quote when amount changes
  useEffect(() => {
    const getQuoteData = async () => {
      if (!amountIn || !tokenIn || !tokenOut || !publicClient) {
        setAmountOut('')
        setPriceImpact(0)
        return
      }

      // Check if this is a wrap/unwrap operation
      const wrapUnwrapType = isWrapUnwrapOperation(tokenIn, tokenOut)
      
      if (wrapUnwrapType === 'wrap' || wrapUnwrapType === 'unwrap') {
        // For wrap/unwrap, output amount equals input amount (1:1)
        setAmountOut(amountIn)
        setPriceImpact(0)
        setMinimumReceived(amountIn)
        setExchangeRate('1.00')
        setFee('0%')
        setError('')
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
        setMinimumReceived(quote.minimumReceived)
        
        // Calculate exchange rate
        const rate = parseFloat(amountOut) / parseFloat(amountIn)
        setExchangeRate(rate.toFixed(6))
        
        // Calculate fee (simplified - in real implementation, get from pool)
        setFee('0.05%')
      } catch (err) {
        setError('Failed to get quote')
        setAmountOut('')
        setPriceImpact(0)
        setMinimumReceived('')
        setExchangeRate('')
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

  // Check pool status when tokens change
  useEffect(() => {
    checkPoolStatus()
  }, [checkPoolStatus])

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
      // Check if this is a wrap/unwrap operation
      const wrapUnwrapType = isWrapUnwrapOperation(tokenIn, tokenOut)
      
      if (wrapUnwrapType === 'wrap') {
        // Wrap BCX to WBCX
        const wrapHash = await wrapBCX(walletClient, amountIn)
        await publicClient.waitForTransactionReceipt({ hash: wrapHash as `0x${string}` })
        
        // Reset form and refresh balances
        setAmountIn('')
        setAmountOut('')
        fetchBalances()
        return
      }
      
      if (wrapUnwrapType === 'unwrap') {
        // Unwrap WBCX to BCX
        const unwrapHash = await unwrapWBCX(walletClient, amountIn)
        await publicClient.waitForTransactionReceipt({ hash: unwrapHash as `0x${string}` })
        
        // Reset form and refresh balances
        setAmountIn('')
        setAmountOut('')
        fetchBalances()
        return
      }

      // Regular swap operation
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
      setError(err.message || 'Operation failed')
    } finally {
      setIsLoading(false)
    }
  }

  const wrapUnwrapType = isWrapUnwrapOperation(tokenIn, tokenOut)
  const canSwap = isConnected && amountIn && amountOut && !isLoading && !isQuoteLoading && !error

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-200">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-4">
        {/* Left Column - Swap Form */}
        <div className="space-y-4">
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

        {/* Pool Status Indicator */}
        {poolStatus && (
          <div className="text-sm">
            {poolStatus === 'checking' && (
              <div className="flex items-center gap-2 text-blue-600">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Checking pool status...</span>
              </div>
            )}
            
            {poolStatus === 'exists' && (
              <div className="flex items-center gap-2 text-green-600 bg-green-50 p-3 rounded-lg border border-green-200">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div className="flex-1">
                  <div className="font-medium">Pool has liquidity</div>
                  <div className="text-xs text-green-600 mt-1">Ready to swap</div>
                </div>
              </div>
            )}
            
            {poolStatus === 'no-liquidity' && (
              <div className="flex items-center gap-2 text-orange-600 bg-orange-50 p-3 rounded-lg border border-orange-200">
                <AlertTriangle className="w-5 h-5 text-orange-500" />
                <div className="flex-1">
                  <div className="font-medium">Pool exists but has no liquidity</div>
                  <div className="text-xs text-orange-600 mt-1">
                    Add liquidity to the {tokenIn?.symbol} → {tokenOut?.symbol} pool first
                  </div>
                </div>
              </div>
            )}
            
            {poolStatus === 'not-exists' && (
              <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
                <XCircle className="w-5 h-5 text-red-500" />
                <div className="flex-1">
                  <div className="font-medium">No liquidity pool found</div>
                  <div className="text-xs text-red-600 mt-1">
                    Create a pool for {tokenIn?.symbol} → {tokenOut?.symbol} to enable swaps
                  </div>
                </div>
              </div>
            )}
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
              {wrapUnwrapType === 'wrap' ? 'Wrapping...' : 
               wrapUnwrapType === 'unwrap' ? 'Unwrapping...' : 'Swapping...'}
            </div>
          ) : !isConnected ? (
            'Connect Wallet'
          ) : !amountIn ? (
            'Enter Amount'
          ) : wrapUnwrapType === 'wrap' ? (
            'Wrap BCX'
          ) : wrapUnwrapType === 'unwrap' ? (
            'Unwrap WBCX'
          ) : (
            'Swap'
          )}
        </button>

        {/* Create Pool Button - Show when no pool exists */}
        {poolStatus === 'not-exists' && isConnected && (
          <button
            onClick={() => {
              const params = new URLSearchParams({
                token0: tokenIn?.address || '',
                token1: tokenOut?.address || '',
                token0Symbol: tokenIn?.symbol || '',
                token1Symbol: tokenOut?.symbol || '',
                action: 'create'
              })
              window.open(`/liquidity?${params.toString()}`, '_blank')
            }}
            className="w-full py-3 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create {tokenIn?.symbol} → {tokenOut?.symbol} Pool
          </button>
        )}

        {/* Add Liquidity Button - Show when pool exists but no liquidity */}
        {poolStatus === 'no-liquidity' && isConnected && (
          <button
            onClick={() => {
              const params = new URLSearchParams({
                token0: tokenIn?.address || '',
                token1: tokenOut?.address || '',
                token0Symbol: tokenIn?.symbol || '',
                token1Symbol: tokenOut?.symbol || '',
                action: 'add'
              })
              window.open(`/liquidity?${params.toString()}`, '_blank')
            }}
            className="w-full py-3 px-4 bg-orange-600 text-white rounded-lg font-medium hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
          >
            <Droplets className="w-4 h-4" />
            Add Liquidity to {tokenIn?.symbol} → {tokenOut?.symbol} Pool
          </button>
        )}
        </div>

        {/* Right Column - Swap Preview */}
        <div className="lg:block">
          <SwapPreview
            tokenIn={tokenIn}
            tokenOut={tokenOut}
            amountIn={amountIn}
            amountOut={amountOut}
            priceImpact={priceImpact}
            slippage={slippage}
            minimumReceived={minimumReceived}
            exchangeRate={exchangeRate}
            fee={fee}
            isLoading={isQuoteLoading}
          />
        </div>
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
