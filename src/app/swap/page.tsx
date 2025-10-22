'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { SwapService } from '@/services/swapService'
import { TokenSelector } from '@/components/TokenSelector'
import { SettingsModal } from '@/components/SettingsModal'
import { tokenList } from '@/config/tokens'
import { formatBalance } from '@/lib/utils'

export default function SwapPage() {
  const { address: userAddress, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [tokenIn, setTokenIn] = useState(tokenList[0])
  const [tokenOut, setTokenOut] = useState(tokenList[1])
  const [amountIn, setAmountIn] = useState('')
  const [amountOut, setAmountOut] = useState('')
  const [slippage, setSlippage] = useState(0.5)
  const [deadline, setDeadline] = useState(20)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successTxHash, setSuccessTxHash] = useState<string | null>(null)
  const [tokenInBalance, setTokenInBalance] = useState('0')
  const [tokenOutBalance, setTokenOutBalance] = useState('0')

  const swapService = new SwapService(publicClient, walletClient)

  const fetchBalances = useCallback(async () => {
    if (!userAddress || !publicClient || !tokenIn || !tokenOut) return

    try {
      const tokenInAddress = tokenIn.symbol === 'BCX' ? 'BCX' : tokenIn.address
      const tokenOutAddress = tokenOut.symbol === 'BCX' ? 'BCX' : tokenOut.address
      
      const balanceIn = await swapService.getTokenBalance(tokenInAddress, userAddress)
      const balanceOut = await swapService.getTokenBalance(tokenOutAddress, userAddress)
      
      setTokenInBalance(balanceIn)
      setTokenOutBalance(balanceOut)
    } catch (error) {
      console.error('Error fetching balances:', error)
    }
  }, [userAddress, publicClient, tokenIn, tokenOut])

  useEffect(() => {
    fetchBalances()
    const interval = setInterval(fetchBalances, 10000)
    return () => clearInterval(interval)
  }, [fetchBalances])

  const handleTokenInChange = (token: any) => {
    setTokenIn(token)
    setAmountIn('')
    setAmountOut('')
  }

  const handleTokenOutChange = (token: any) => {
    setTokenOut(token)
    setAmountIn('')
    setAmountOut('')
  }

  const handleAmountInChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAmountIn(value)
    
    if (value && parseFloat(value) > 0) {
      try {
        const quote = await swapService.getQuote(
          tokenIn?.address || '',
          tokenOut?.address || '',
          value
        )
        setAmountOut(quote.amountOut)
      } catch (error) {
        console.error('Error getting quote:', error)
        setAmountOut('')
      }
    } else {
      setAmountOut('')
    }
  }

  const handleAmountOutChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAmountOut(value)
    
    if (value && parseFloat(value) > 0) {
      try {
        // For reverse quote, we need to calculate how much input is needed for the desired output
        // This is a simplified approach - in a real DEX, you'd use a reverse quote function
        const estimatedInput = (parseFloat(value) * 1.01).toString() // Add 1% for slippage
        setAmountIn(estimatedInput)
      } catch (error) {
        console.error('Error calculating reverse quote:', error)
        setAmountIn('')
      }
    } else {
      setAmountIn('')
    }
  }

  const handleSwap = async () => {
    if (!isConnected || !walletClient || !userAddress || !tokenIn || !tokenOut || !amountIn) {
      setError('Please connect wallet and enter amount')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccessTxHash(null)

    try {
      const txHash = await swapService.executeSwap({
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        amountIn,
        slippage,
        deadline,
        recipient: userAddress,
      })
      
      setSuccessTxHash(txHash)
      setAmountIn('')
      setAmountOut('')
      fetchBalances()
    } catch (error) {
      console.error('Swap error:', error)
      setError(error instanceof Error ? error.message : 'Swap failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMaxInClick = () => {
    setAmountIn(tokenInBalance)
  }

  const handleMaxOutClick = () => {
    setAmountOut(tokenOutBalance)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-gray-900">Swap</h1>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">From</label>
                <span className="text-sm text-gray-500">
                  Balance: {formatBalance(tokenInBalance)}
                </span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    value={amountIn}
                    onChange={handleAmountInChange}
                    placeholder="0.0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleMaxInClick}
                    className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    MAX
                  </button>
                  <TokenSelector
                    selectedToken={tokenIn}
                    onTokenSelect={handleTokenInChange}
                    balance={tokenInBalance}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">To</label>
                <span className="text-sm text-gray-500">
                  Balance: {formatBalance(tokenOutBalance)}
                </span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    value={amountOut}
                    onChange={handleAmountOutChange}
                    placeholder="0.0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleMaxOutClick}
                    className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    MAX
                  </button>
                  <TokenSelector
                    selectedToken={tokenOut}
                    onTokenSelect={handleTokenOutChange}
                    balance={tokenOutBalance}
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {successTxHash && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-600">
                  Swap successful! Transaction: {successTxHash}
                </p>
              </div>
            )}

            <button
              onClick={handleSwap}
              disabled={!isConnected || !amountIn || isLoading}
              className="w-full py-3 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Swapping...' : 'Swap'}
            </button>
          </div>
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        slippage={slippage}
        onSlippageChange={setSlippage}
        deadline={deadline}
        onDeadlineChange={setDeadline}
      />
    </div>
  )
}
