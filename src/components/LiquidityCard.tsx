'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { Plus, Minus, Settings, Loader2 } from 'lucide-react'
import { TokenSelector } from './TokenSelector'
import { SettingsModal } from './SettingsModal'
import { tokens, type Token } from '@/config/tokens'
import { getTokenBalance, addLiquidity, getPoolInfo } from '@/lib/liquidity'
import { formatBalance, formatPriceImpact, getPriceImpactColor } from '@/lib/utils'

export function LiquidityCard() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // State
  const [tokenA, setTokenA] = useState<Token | null>(tokens.WBCX)
  const [tokenB, setTokenB] = useState<Token | null>(tokens.TEST)
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  const [priceRatio, setPriceRatio] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [slippage, setSlippage] = useState(0.5)
  const [deadline, setDeadline] = useState(20)
  
  // Balances
  const [tokenABalance, setTokenABalance] = useState('0')
  const [tokenBBalance, setTokenBBalance] = useState('0')
  
  // Pool info
  const [poolExists, setPoolExists] = useState(false)
  const [poolLiquidity, setPoolLiquidity] = useState('0')

  // Get token balances
  const fetchBalances = useCallback(async () => {
    if (!address || !publicClient) return

    try {
      // Handle BCX (native token) properly
      const tokenAAddress = tokenA?.symbol === 'BCX' ? 'BCX' : (tokenA?.address || '')
      const tokenBAddress = tokenB?.symbol === 'BCX' ? 'BCX' : (tokenB?.address || '')
      
      const balanceA = await getTokenBalance(publicClient, tokenAAddress, address)
      const balanceB = await getTokenBalance(publicClient, tokenBAddress, address)
      
      setTokenABalance(balanceA)
      setTokenBBalance(balanceB)
    } catch (error) {
      console.error('Error fetching balances:', error)
    }
  }, [address, publicClient, tokenA?.address, tokenA?.symbol, tokenB?.address, tokenB?.symbol])

  // Get pool info
  const fetchPoolInfo = useCallback(async () => {
    if (!tokenA || !tokenB || !publicClient) return

    try {
      const poolInfo = await getPoolInfo(publicClient, tokenA.address, tokenB.address)
      setPoolExists(poolInfo.exists)
      setPoolLiquidity(poolInfo.liquidity)
    } catch (error) {
      console.error('Error fetching pool info:', error)
      setPoolExists(false)
    }
  }, [tokenA, tokenB, publicClient])

  // Calculate price ratio when amounts change
  useEffect(() => {
    if (amountA && amountB && parseFloat(amountA) > 0 && parseFloat(amountB) > 0) {
      const ratio = (parseFloat(amountB) / parseFloat(amountA)).toFixed(6)
      setPriceRatio(ratio)
    } else {
      setPriceRatio('')
    }
  }, [amountA, amountB])

  // Fetch balances and pool info when tokens change
  useEffect(() => {
    fetchBalances()
    fetchPoolInfo()
  }, [fetchBalances, fetchPoolInfo])

  const handleTokenASelect = (token: Token) => {
    setTokenA(token)
    setAmountA('')
    setAmountB('')
  }

  const handleTokenBSelect = (token: Token) => {
    setTokenB(token)
    setAmountA('')
    setAmountB('')
  }

  const handleMaxClickA = () => {
    setAmountA(tokenABalance)
  }

  const handleMaxClickB = () => {
    setAmountB(tokenBBalance)
  }

  const handleAddLiquidity = async () => {
    if (!address || !walletClient || !publicClient || !tokenA || !tokenB) {
      setError('Please connect your wallet')
      return
    }

    if (!amountA || !amountB || parseFloat(amountA) <= 0 || parseFloat(amountB) <= 0) {
      setError('Please enter valid amounts')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const hash = await addLiquidity(walletClient, publicClient, {
        tokenA: tokenA.address,
        tokenB: tokenB.address,
        amountADesired: amountA,
        amountBDesired: amountB,
        amountAMin: (parseFloat(amountA) * (1 - slippage / 100)).toString(),
        amountBMin: (parseFloat(amountB) * (1 - slippage / 100)).toString(),
        deadline: deadline,
        recipient: address,
      })

      // Wait for transaction
      await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
      
      // Reset form and refresh balances
      setAmountA('')
      setAmountB('')
      fetchBalances()
      fetchPoolInfo()
      
    } catch (err: any) {
      setError(err.message || 'Add liquidity failed')
    } finally {
      setIsLoading(false)
    }
  }

  const canAddLiquidity = isConnected && amountA && amountB && !isLoading && !error

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h1 className="text-xl font-semibold">Add Liquidity</h1>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-gray-100 rounded-full"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* Pool Info */}
      {poolExists && (
        <div className="p-4 bg-blue-50 border-b border-gray-200">
          <div className="text-sm text-blue-700">
            <div>Pool exists with {formatBalance(poolLiquidity)} liquidity</div>
          </div>
        </div>
      )}

      {/* Liquidity Form */}
      <div className="p-4 space-y-4">
        {/* Token A */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Token A</span>
            <span className="text-sm text-gray-500">
              Balance: {formatBalance(tokenABalance)}
            </span>
          </div>
          <div className="flex gap-2">
            <TokenSelector
              selectedToken={tokenA}
              onTokenSelect={handleTokenASelect}
              balance={tokenABalance}
            />
            <div className="flex flex-col gap-1">
              <input
                type="number"
                value={amountA}
                onChange={(e) => setAmountA(e.target.value)}
                placeholder="0.0"
                className="w-32 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={handleMaxClickA}
                className="text-xs text-blue-600 hover:text-blue-700"
                disabled={isLoading}
              >
                MAX
              </button>
            </div>
          </div>
        </div>

        {/* Plus Icon */}
        <div className="flex justify-center">
          <div className="p-2 bg-gray-100 rounded-full">
            <Plus className="w-5 h-5 text-gray-400" />
          </div>
        </div>

        {/* Token B */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Token B</span>
            <span className="text-sm text-gray-500">
              Balance: {formatBalance(tokenBBalance)}
            </span>
          </div>
          <div className="flex gap-2">
            <TokenSelector
              selectedToken={tokenB}
              onTokenSelect={handleTokenBSelect}
              balance={tokenBBalance}
              disabled={isLoading}
            />
            <div className="flex flex-col gap-1">
              <input
                type="number"
                value={amountB}
                onChange={(e) => setAmountB(e.target.value)}
                placeholder="0.0"
                className="w-32 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <button
                onClick={handleMaxClickB}
                className="text-xs text-blue-600 hover:text-blue-700"
                disabled={isLoading}
              >
                MAX
              </button>
            </div>
          </div>
        </div>

        {/* Price Ratio */}
        {priceRatio && (
          <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
            <div className="flex justify-between">
              <span>Price:</span>
              <span>1 {tokenA?.symbol} = {priceRatio} {tokenB?.symbol}</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="text-sm text-red-500 bg-red-50 p-2 rounded-lg">
            {error}
          </div>
        )}

        {/* Add Liquidity Button */}
        <button
          onClick={handleAddLiquidity}
          disabled={!canAddLiquidity}
          className="w-full py-3 px-4 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Adding Liquidity...
            </div>
          ) : !isConnected ? (
            'Connect Wallet'
          ) : !amountA || !amountB ? (
            'Enter Amounts'
          ) : (
            'Add Liquidity'
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
