'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { LiquidityService } from '@/services/liquidityService'
import { TokenSelector } from '@/components/TokenSelector'
import { SettingsModal } from '@/components/SettingsModal'
import { tokenList } from '@/config/tokens'
import { formatBalance } from '@/lib/utils'

export default function LiquidityPage() {
  const { address: userAddress, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  const [tokenA, setTokenA] = useState(tokenList[0])
  const [tokenB, setTokenB] = useState(tokenList[1])
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  const [slippage, setSlippage] = useState(0.5)
  const [deadline, setDeadline] = useState(20)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successTxHash, setSuccessTxHash] = useState<string | null>(null)
  const [poolExists, setPoolExists] = useState(false)
  const [poolLiquidity, setPoolLiquidity] = useState('0')
  const [tokenABalance, setTokenABalance] = useState('0')
  const [tokenBBalance, setTokenBBalance] = useState('0')

  const liquidityService = new LiquidityService(publicClient, walletClient)

  const fetchBalances = useCallback(async () => {
    if (!userAddress || !publicClient || !tokenA || !tokenB) return

    try {
      const tokenAAddress = tokenA.symbol === 'BCX' ? 'BCX' : tokenA.address
      const tokenBAddress = tokenB.symbol === 'BCX' ? 'BCX' : tokenB.address
      
      const balanceA = await liquidityService.getTokenBalance(tokenAAddress, userAddress)
      const balanceB = await liquidityService.getTokenBalance(tokenBAddress, userAddress)
      
      setTokenABalance(balanceA)
      setTokenBBalance(balanceB)
    } catch (error) {
      console.error('Error fetching balances:', error)
    }
  }, [userAddress, publicClient, tokenA, tokenB])

  const fetchPoolInfo = useCallback(async () => {
    if (!tokenA || !tokenB || !publicClient) return

    try {
      const info = await liquidityService.getPoolInfo(tokenA.address, tokenB.address)
      setPoolExists(info.exists)
      setPoolLiquidity(info.liquidity)
    } catch (error) {
      console.error('Error fetching pool info:', error)
      setPoolExists(false)
      setPoolLiquidity('0')
    }
  }, [publicClient, tokenA, tokenB])

  useEffect(() => {
    fetchBalances()
    fetchPoolInfo()
    const interval = setInterval(() => {
      fetchBalances()
      fetchPoolInfo()
    }, 10000)
    return () => clearInterval(interval)
  }, [fetchBalances, fetchPoolInfo])

  const handleTokenAChange = (token: any) => {
    setTokenA(token)
    setAmountA('')
    setAmountB('')
  }

  const handleTokenBChange = (token: any) => {
    setTokenB(token)
    setAmountA('')
    setAmountB('')
  }

  const handleAmountAChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAmountA(value)
    // Don't automatically set amountB - let user control each independently
  }

  const handleAmountBChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAmountB(value)
    // Don't automatically set amountA - let user control each independently
  }

  const handleAddLiquidity = async () => {
    if (!isConnected || !walletClient || !userAddress || !tokenA || !tokenB || !amountA || !amountB) {
      setError('Please connect wallet and enter amounts')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccessTxHash(null)

    try {
      const txHash = await liquidityService.addLiquidity({
        tokenA: tokenA.address,
        tokenB: tokenB.address,
        amountADesired: amountA,
        amountBDesired: amountB,
        amountAMin: (parseFloat(amountA) * (1 - slippage / 100)).toString(),
        amountBMin: (parseFloat(amountB) * (1 - slippage / 100)).toString(),
        deadline,
        recipient: userAddress,
      })
      
      setSuccessTxHash(txHash)
      setAmountA('')
      setAmountB('')
      fetchBalances()
      fetchPoolInfo()
    } catch (error) {
      console.error('Add liquidity error:', error)
      setError(error instanceof Error ? error.message : 'Add liquidity failed')
    } finally {
      setIsLoading(false)
    }
  }

  const handleMaxAClick = () => {
    setAmountA(tokenABalance)
  }

  const handleMaxBClick = () => {
    setAmountB(tokenBBalance)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-xl font-semibold text-gray-900">Add Liquidity</h1>
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

          {poolExists && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-600">
                Pool exists with {formatBalance(poolLiquidity)} liquidity
              </p>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Token A</label>
                <span className="text-sm text-gray-500">
                  Balance: {formatBalance(tokenABalance)}
                </span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    value={amountA}
                    onChange={handleAmountAChange}
                    placeholder="0.0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleMaxAClick}
                    className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    MAX
                  </button>
                  <TokenSelector
                    selectedToken={tokenA}
                    onTokenSelect={handleTokenAChange}
                    balance={tokenABalance}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-center">
              <div className="p-2 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Token B</label>
                <span className="text-sm text-gray-500">
                  Balance: {formatBalance(tokenBBalance)}
                </span>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    type="number"
                    value={amountB}
                    onChange={handleAmountBChange}
                    placeholder="0.0"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleMaxBClick}
                    className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    MAX
                  </button>
                  <TokenSelector
                    selectedToken={tokenB}
                    onTokenSelect={handleTokenBChange}
                    balance={tokenBBalance}
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
                  Liquidity added successfully! Transaction: {successTxHash}
                </p>
              </div>
            )}

            <button
              onClick={handleAddLiquidity}
              disabled={!isConnected || !amountA || !amountB || isLoading}
              className="w-full py-3 px-4 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? 'Adding Liquidity...' : 'Add Liquidity'}
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
