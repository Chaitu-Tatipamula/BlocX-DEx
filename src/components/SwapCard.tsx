'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { ArrowUpDown, Settings, Loader2, CheckCircle, AlertTriangle, XCircle, Plus, Droplets, Info } from 'lucide-react'
import { TokenSelector } from './TokenSelector'
import { SettingsModal } from './SettingsModal'
import { SwapDetailsModal } from './SwapDetailsModal'
import { tokens, type Token } from '@/config/tokens'
import { getQuote, getTokenBalance, executeSwap, approveToken, getTokenAllowance, wrapBCX, unwrapWBCX, isWrapUnwrapOperation, checkPoolExists, checkPoolLiquidity, FEE_TIERS } from '@/lib/swap'
import { formatBalance, formatPriceImpact, getPriceImpactColor } from '@/lib/utils'
import { useTx } from "../context/tx"

const DEFAULT_SLIPPAGE = 0.5
const DEFAULT_DEADLINE = 20

export function SwapCard() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { addTx, addError } = useTx()

  // State
  const [tokenIn, setTokenIn] = useState<Token | null>(tokens.BCX)
  const [tokenOut, setTokenOut] = useState<Token | null>(tokens.WBCX)
  const [amountIn, setAmountIn] = useState('')
  const [amountOut, setAmountOut] = useState('')
  const [priceImpact, setPriceImpact] = useState(0)
  const [minimumReceived, setMinimumReceived] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')
  const [fee, setFee] = useState('0.05%')
  const [selectedFeeTier, setSelectedFeeTier] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isQuoteLoading, setIsQuoteLoading] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
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
      
      const inBalance = await getTokenBalance(
        publicClient,
        inTokenAddress,
        address,
        tokenIn?.decimals
      )
      const outBalance = await getTokenBalance(
        publicClient,
        outTokenAddress,
        address,
        tokenOut?.decimals
      )
      
      setTokenInBalance(inBalance)
      setTokenOutBalance(outBalance)
    } catch (error) {
      console.error('Error fetching balances:', error)
    }
  }, [address, publicClient, tokenIn?.address, tokenIn?.symbol, tokenOut?.address, tokenOut?.symbol])

  // Check pool status - check all fee tiers
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
      
      // Check all fee tiers to find pools with liquidity
      let foundPool = false
      let bestLiquidity: { hasLiquidity: boolean; liquidity: string } | null = null
      
      for (const fee of FEE_TIERS) {
        const exists = await checkPoolExists(publicClient, tokenInAddress, tokenOutAddress, fee)
        if (exists) {
          foundPool = true
          const liquidity = await checkPoolLiquidity(publicClient, tokenInAddress, tokenOutAddress, fee)
          if (liquidity.hasLiquidity) {
            // Found a pool with liquidity, use it
            setPoolExists(true)
            setPoolLiquidity(liquidity)
            setPoolStatus('exists')
            return
          } else if (!bestLiquidity) {
            // Store first pool found even if no liquidity (for display)
            bestLiquidity = liquidity
          }
        }
      }
      
      if (foundPool) {
        // Pool exists but no liquidity
        setPoolExists(true)
        setPoolLiquidity(bestLiquidity || { hasLiquidity: false, liquidity: '0' })
        setPoolStatus('no-liquidity')
      } else {
        // No pool found across any fee tier
        setPoolExists(false)
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
        return
      }

      setIsQuoteLoading(true)

      try {
        // Convert BCX to WBCX for quote (pools use WBCX, not BCX)
        const tokenInForQuote = tokenIn.symbol === 'BCX' ? 'BCX' : tokenIn.address
        const tokenOutForQuote = tokenOut.symbol === 'BCX' ? 'BCX' : tokenOut.address
        
        const quote = await getQuote(
          publicClient,
          tokenInForQuote,
          tokenOutForQuote,
          amountIn
        )
        
        setAmountOut(quote.amountOut)
        setPriceImpact(quote.priceImpact)
        setMinimumReceived(quote.minimumReceived)
        setSelectedFeeTier(quote.fee)
        
        // Calculate exchange rate
        const rate = parseFloat(quote.amountOut) / parseFloat(amountIn)
        setExchangeRate(rate.toFixed(6))
        
        // Display fee tier from quote
        setFee(`${(quote.fee / 10000).toFixed(2)}%`)
      } catch (err) {
        addError({ title: 'Failed to Get Quote', message: 'Failed to get swap quote. Please try again.' })
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

  const handlePercentageClick = (percentage: number) => {
    const balance = parseFloat(tokenInBalance)
    if (isNaN(balance) || balance <= 0) return
    
    const amount = (balance * percentage / 100).toString()
    setAmountIn(amount)
  }

  const handleSwap = async () => {
    if (!address || !walletClient || !publicClient || !tokenIn || !tokenOut) {
      addError({ title: 'Wallet Not Connected', message: 'Please connect your wallet' })
      return
    }

    if (!amountIn || parseFloat(amountIn) <= 0) {
      addError({ title: 'Invalid Amount', message: 'Please enter a valid amount' })
      return
    }

    setIsLoading(true)

    try {
      // Check if this is a wrap/unwrap operation
      const wrapUnwrapType = isWrapUnwrapOperation(tokenIn, tokenOut)
      
      if (wrapUnwrapType === 'wrap') {
        // Wrap BCX to WBCX
        const wrapHash = await wrapBCX(walletClient, amountIn)
        if (wrapHash) {
          addTx({ hash: wrapHash, title: 'BCX Wrapped' })
        }
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
         if (unwrapHash) {
          addTx({ hash: unwrapHash, title: 'BCX Unwrapped' })
        }
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
        const allowance = await getTokenAllowance(publicClient, tokenIn.address, address, tokenIn.decimals)
        const amountInWei = parseFloat(amountIn)
        
        if (parseFloat(allowance) < amountInWei) {
          // Approve token
          const approveHash = await approveToken(walletClient, tokenIn.address, amountIn, tokenIn.decimals)
          if (approveHash) {
            addTx({ hash: approveHash, title: `Approved ${tokenIn.symbol}` })
          }
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
        decimalsIn: tokenIn.decimals,
        decimalsOut: tokenOut.decimals,
        fee: selectedFeeTier || undefined, // Use the fee tier from the quote
      })
      
      if (swapHash) {
        addTx({ hash: swapHash, title: `Swapped ${tokenIn.symbol} → ${tokenOut.symbol}` })
      }

      // Wait for transaction
      await publicClient.waitForTransactionReceipt({ hash: swapHash as `0x${string}` })
      
      // Reset form and refresh balances
      setAmountIn('')
      setAmountOut('')
      fetchBalances()
      
    } catch (err: any) {
      addError({ title: 'Swap Failed', message: err.message || 'Operation failed' })
    } finally {
      setIsLoading(false)
    }
  }

  const wrapUnwrapType = isWrapUnwrapOperation(tokenIn, tokenOut)
  const canSwap = isConnected && amountIn && amountOut && !isLoading && !isQuoteLoading

  return (
    <div className="w-full max-w-lg mx-auto glass-card">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <h1 className="text-xl font-semibold text-white">Swap</h1>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 space-y-4">
        {/* From Token */}
        <div className="bg-black/20 rounded-xl p-4 border border-white/10 glass-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/70">From</span>
            <span className="text-sm text-white/60">
              Balance: {formatBalance(tokenInBalance)}
            </span>
          </div>
          <div className="flex items-start gap-3">
            {/* Large Input Field */}
            <div className="flex-1 min-w-0">
              <input
                type="number"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                placeholder="0.0"
                className="w-full text-2xl font-medium bg-transparent border-none outline-none text-white placeholder:text-white/40 mb-1"
                disabled={isLoading}
              />
              <div className="flex items-center gap-2">
                <span className="text-sm text-white/50">$0</span>
                {/* Compact Percentage Buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePercentageClick(25)}
                    disabled={isLoading || !tokenInBalance || parseFloat(tokenInBalance) <= 0}
                    className="px-2 py-0.5 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
                  >
                    25%
                  </button>
                  <button
                    onClick={() => handlePercentageClick(50)}
                    disabled={isLoading || !tokenInBalance || parseFloat(tokenInBalance) <= 0}
                    className="px-2 py-0.5 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
                  >
                    50%
                  </button>
                  <button
                    onClick={() => handlePercentageClick(75)}
                    disabled={isLoading || !tokenInBalance || parseFloat(tokenInBalance) <= 0}
                    className="px-2 py-0.5 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
                  >
                    75%
                  </button>
                  <button
                    onClick={handleMaxClick}
                    disabled={isLoading || !tokenInBalance || parseFloat(tokenInBalance) <= 0}
                    className="px-2 py-0.5 text-xs font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-white/10"
                  >
                    MAX
                  </button>
                </div>
              </div>
            </div>
            {/* Compact Token Selector */}
            <div className="shrink-0">
              <TokenSelector
                selectedToken={tokenIn}
                onTokenSelect={setTokenIn}
                balance={tokenInBalance}
                excludeTokens={tokenOut ? [tokenOut] : []}
                compact
              />
            </div>
          </div>
        </div>

        {/* Swap Button */}
        <div className="flex justify-center -my-2 relative z-10">
          <button
            onClick={handleSwapTokens}
            className="p-2 bg-black/30 backdrop-blur-md border-2 border-white/20 hover:border-white/30 rounded-full transition-colors shadow-lg glass-card"
            disabled={isLoading}
          >
            <ArrowUpDown className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* To Token */}
        <div className="bg-black/20 rounded-xl p-4 border border-white/10 glass-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-white/70">To</span>
            <span className="text-sm text-white/60">
              Balance: {formatBalance(tokenOutBalance)}
            </span>
          </div>
          <div className="flex items-start gap-3">
            {/* Large Input Field */}
            <div className="flex-1 min-w-0">
              {isQuoteLoading ? (
                <div className="flex items-center gap-2 mb-1">
                  <Loader2 className="w-4 h-4 animate-spin text-white/50" />
                  <span className="text-2xl font-medium text-white/50">Calculating...</span>
                </div>
              ) : (
                <div className="text-2xl font-medium text-white mb-1">
                  {amountOut ? formatBalance(amountOut) : '0.0'}
                </div>
              )}
              <div>
                <span className="text-sm text-white/50">$0</span>
              </div>
            </div>
            {/* Compact Token Selector */}
            <div className="shrink-0">
              <TokenSelector
                selectedToken={tokenOut}
                onTokenSelect={setTokenOut}
                balance={tokenOutBalance}
                disabled={isLoading}
                excludeTokens={tokenIn ? [tokenIn] : []}
                compact
              />
            </div>
          </div>
        </div>

        {/* Pool Status Indicator */}
        {poolStatus && (
          <div className="text-sm">
            {poolStatus === 'checking' && (
              <div className="flex items-center gap-2 text-white/70 glass-card p-3 rounded-xl border border-white/10">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Checking pool status...</span>
              </div>
            )}
            
            {poolStatus === 'exists' && (
              <div className="flex items-center gap-2 text-green-400 bg-green-500/10 p-3 rounded-xl border border-green-500/20 glass-card">
                <CheckCircle className="w-5 h-5 text-green-400" />
                <div className="flex-1">
                  <div className="font-medium text-white">Pool has liquidity</div>
                  <div className="text-xs text-green-400 mt-1">Ready to swap</div>
                </div>
              </div>
            )}
            
            {poolStatus === 'no-liquidity' && (
              <div className="flex items-center gap-2 text-orange-400 bg-orange-500/10 p-3 rounded-xl border border-orange-500/20 glass-card">
                <AlertTriangle className="w-5 h-5 text-orange-400" />
                <div className="flex-1">
                  <div className="font-medium text-white">Pool exists but has no liquidity</div>
                  <div className="text-xs text-orange-400 mt-1">
                    Add liquidity to the {tokenIn?.symbol} → {tokenOut?.symbol} pool first
                  </div>
                </div>
              </div>
            )}
            
            {poolStatus === 'not-exists' && (
              <div className="flex items-center gap-2 text-red-400 bg-red-500/10 p-3 rounded-xl border border-red-500/20 glass-card">
                <XCircle className="w-5 h-5 text-red-400" />
                <div className="flex-1">
                  <div className="font-medium text-white">No liquidity pool found</div>
                  <div className="text-xs text-red-400 mt-1">
                    Create a pool for {tokenIn?.symbol} → {tokenOut?.symbol} to enable swaps
                  </div>
                </div>
              </div>
            )}
          </div>
        )}


        {/* Swap Info and Button */}
        <div className="space-y-2">
          {/* Details Button - Show when we have swap data */}
          {amountIn && amountOut && tokenIn && tokenOut && (
            <button
              onClick={() => setShowDetails(true)}
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-white/70 hover:text-white hover:bg-white/5 rounded-lg transition-colors glass-button"
            >
              <Info className="w-4 h-4" />
              <span>View Swap Details</span>
            </button>
          )}

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={!canSwap}
            className="w-full py-3 px-4 glass-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
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
        </div>

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
            className="w-full py-3 px-4 bg-green-500/20 text-green-400 rounded-xl font-medium hover:bg-green-500/30 transition-colors flex items-center justify-center gap-2 border border-green-500/30 glass-card"
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

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        slippage={slippage}
        onSlippageChange={setSlippage}
        deadline={deadline}
        onDeadlineChange={setDeadline}
      />

      {/* Swap Details Modal */}
      <SwapDetailsModal
        isOpen={showDetails}
        onClose={() => setShowDetails(false)}
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
  )
}

