'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAccount, usePublicClient, useWalletClient } from 'wagmi'
import { Settings, Loader2, Info, RefreshCw } from 'lucide-react'
import { TokenSelector } from './TokenSelector'
import { SettingsModal } from './SettingsModal'
import { FeeTierSelector } from './FeeTierSelector'
import { PriceRangeSelector } from './PriceRangeSelector'
import { LiquidityPreview } from './LiquidityPreview'
import { tokens, type Token } from '@/config/tokens'
import { getTokenBalance } from '@/lib/liquidity'
import { formatBalance } from '@/lib/utils'
import { parseUnits, type Address } from 'viem'
import { CONTRACT_ADDRESSES, NONFUNGIBLE_POSITION_MANAGER_ABI, ERC20_ABI } from '@/lib/contracts'
import { PoolService } from '@/services/poolService'
import { priceToTick, tickToPrice } from '@/lib/tickMath'
import { calculateOptimalAmount } from '@/lib/positionAnalysis'

export function LiquidityCard() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()

  // State
  const [tokenA, setTokenA] = useState<Token | null>(tokens.WBCX)
  const [tokenB, setTokenB] = useState<Token | null>(tokens.FRESH)
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  const [feeTier, setFeeTier] = useState(500) // Default 0.05%
  const [minTick, setMinTick] = useState(0)
  const [maxTick, setMaxTick] = useState(0)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null) // FIX: null initially
  const [isLoading, setIsLoading] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [slippage, setSlippage] = useState(0.5)
  const [deadline, setDeadline] = useState(20)
  
  // Balances
  const [tokenABalance, setTokenABalance] = useState('0')
  const [tokenBBalance, setTokenBBalance] = useState('0')
  
  // Pool info
  const [poolExists, setPoolExists] = useState(false)
  const [loadingPoolInfo, setLoadingPoolInfo] = useState(false)
  const [poolDataLoaded, setPoolDataLoaded] = useState(false) // FIX: Track if pool data is loaded

  // URL parameters for pre-selecting tokens
  const [urlParams, setUrlParams] = useState<{
    token0?: string
    token1?: string
    token0Symbol?: string
    token1Symbol?: string
    action?: string
  }>({})

  // Read URL parameters and pre-select tokens
  const initializeFromUrlParams = useCallback(() => {
    if (typeof window === 'undefined') return

    const params = new URLSearchParams(window.location.search)
    const token0 = params.get('token0')
    const token1 = params.get('token1')
    const token0Symbol = params.get('token0Symbol')
    const token1Symbol = params.get('token1Symbol')
    const action = params.get('action')

    if (token0 && token1 && token0Symbol && token1Symbol) {
      setUrlParams({ token0, token1, token0Symbol, token1Symbol, action: action || undefined })
      
      // Find tokens by address or symbol
      const foundTokenA = Object.values(tokens).find(
        token => token.address === token0 || token.symbol === token0Symbol
      )
      const foundTokenB = Object.values(tokens).find(
        token => token.address === token1 || token.symbol === token1Symbol
      )

      if (foundTokenA && foundTokenB) {
        setTokenA(foundTokenA)
        setTokenB(foundTokenB)
        console.log(`Pre-selected tokens from URL: ${foundTokenA.symbol} → ${foundTokenB.symbol}`)
      }
    }
  }, [])

  // Get token balances
  const fetchBalances = useCallback(async (isRefresh = false) => {
    if (!address || !publicClient) return

    if (isRefresh) {
      setIsRefreshing(true)
    }

    try {
      const tokenAAddress = tokenA?.symbol === 'BCX' ? 'BCX' : (tokenA?.address || '')
      const tokenBAddress = tokenB?.symbol === 'BCX' ? 'BCX' : (tokenB?.address || '')
      
      const balanceA = await getTokenBalance(publicClient, tokenAAddress, address)
      const balanceB = await getTokenBalance(publicClient, tokenBAddress, address)
      
      setTokenABalance(balanceA)
      setTokenBBalance(balanceB)
      setLastUpdated(new Date())
    } catch (error) {
      console.error('Error fetching balances:', error)
    } finally {
      if (isRefresh) {
        setIsRefreshing(false)
      }
    }
  }, [address, publicClient, tokenA?.address, tokenA?.symbol, tokenB?.address, tokenB?.symbol])

  // Get pool info and current price
  const fetchPoolInfo = useCallback(async () => {
    if (!tokenA || !tokenB || !publicClient) return

    setLoadingPoolInfo(true)
    try {
      const poolService = new PoolService(publicClient)
      const pool = await poolService.getPoolDetails(tokenA.address, tokenB.address, feeTier)
      
      if (pool) {
        setPoolExists(true)
        setCurrentPrice(pool.currentPrice)
      } else {
        setPoolExists(false)
        setCurrentPrice(1) // Default 1:1 ratio for new pools
      }
      setPoolDataLoaded(true) // FIX: Mark as loaded
    } catch (error) {
      console.error('Error fetching pool info:', error)
      setPoolExists(false)
      setCurrentPrice(1)
      setPoolDataLoaded(true) // FIX: Mark as loaded even on error
    } finally {
      setLoadingPoolInfo(false)
    }
  }, [tokenA, tokenB, feeTier, publicClient])

  // Fetch balances and pool info when tokens change
  useEffect(() => {
    fetchBalances()
    fetchPoolInfo()
  }, [fetchBalances, fetchPoolInfo])

  // Initialize from URL parameters on mount
  useEffect(() => {
    initializeFromUrlParams()
  }, [initializeFromUrlParams])

  // FIX: Auto-calculate amount B based on amount A using PROPER concentrated liquidity math
  useEffect(() => {
    if (!amountA || parseFloat(amountA) === 0 || currentPrice === null || minTick >= maxTick) {
      return
    }

    try {
      const currentTick = priceToTick(currentPrice)
      const optimalAmountB = calculateOptimalAmount(amountA, true, currentTick, minTick, maxTick)
      setAmountB(parseFloat(optimalAmountB).toFixed(6))
    } catch (error) {
      console.error('Error calculating amount B:', error)
    }
  }, [amountA, currentPrice, minTick, maxTick])

  // FIX: Auto-calculate amount A when amount B changes
  const handleAmountBChange = (value: string) => {
    setAmountB(value)
    
    if (!value || parseFloat(value) === 0 || currentPrice === null || minTick >= maxTick) {
      return
    }

    try {
      const currentTick = priceToTick(currentPrice)
      const optimalAmountA = calculateOptimalAmount(value, false, currentTick, minTick, maxTick)
      setAmountA(parseFloat(optimalAmountA).toFixed(6))
    } catch (error) {
      console.error('Error calculating amount A:', error)
    }
  }

  const handleTokenASelect = (token: Token) => {
    setTokenA(token)
    setAmountA('')
    setAmountB('')
    setPoolDataLoaded(false) // Reset when changing tokens
  }

  const handleTokenBSelect = (token: Token) => {
    setTokenB(token)
    setAmountA('')
    setAmountB('')
    setPoolDataLoaded(false) // Reset when changing tokens
  }

  const handleRangeChange = (newMinTick: number, newMaxTick: number) => {
    setMinTick(newMinTick)
    setMaxTick(newMaxTick)
    
    // Recalculate amount B when range changes
    if (amountA && parseFloat(amountA) > 0 && currentPrice !== null) {
      const currentTick = priceToTick(currentPrice)
      const optimalAmountB = calculateOptimalAmount(amountA, true, currentTick, newMinTick, newMaxTick)
      setAmountB(parseFloat(optimalAmountB).toFixed(6))
    }
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

    if (minTick >= maxTick) {
      setError('Invalid price range')
      return
    }

    // Check if using native BCX token (not allowed for pools)
    if (tokenA?.symbol === 'BCX' || tokenB?.symbol === 'BCX') {
      setError('Cannot create pools with native BCX. Please use WBCX (Wrapped BCX) instead.')
      return
    }

    // Check if token addresses are valid
    if (tokenA?.address === '0x0000000000000000000000000000000000000000' || 
        tokenB?.address === '0x0000000000000000000000000000000000000000') {
      setError('Invalid token address. Please select valid tokens.')
      return
    }

    setIsLoading(true)
    setError('')

    try {
      const amountADesiredWei = parseUnits(amountA, 18)
      const amountBDesiredWei = parseUnits(amountB, 18)
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60

      // Check if pool exists, create if needed
      if (!poolExists) {
        const poolService = new PoolService(publicClient, walletClient)
        await poolService.createPoolIfNeeded(
          tokenA.address,
          tokenB.address,
          feeTier,
          currentPrice || 1
        )
      }

      // Approve tokens
      const tokenAContract = { address: tokenA.address as Address, abi: ERC20_ABI }
      const tokenBContract = { address: tokenB.address as Address, abi: ERC20_ABI }
      
      const allowanceA = await publicClient.readContract({
        ...tokenAContract,
        functionName: 'allowance',
        args: [address, CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER],
      })
      
      if (allowanceA < amountADesiredWei) {
        const approveHashA = await walletClient.writeContract({
          ...tokenAContract,
          functionName: 'approve',
          args: [CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER, amountADesiredWei],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHashA })
      }
      
      const allowanceB = await publicClient.readContract({
        ...tokenBContract,
        functionName: 'allowance',
        args: [address, CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER],
      })
      
      if (allowanceB < amountBDesiredWei) {
        const approveHashB = await walletClient.writeContract({
          ...tokenBContract,
          functionName: 'approve',
          args: [CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER, amountBDesiredWei],
        })
        await publicClient.waitForTransactionReceipt({ hash: approveHashB })
      }

      // Mint position with custom tick range
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'mint',
        args: [{
          token0: tokenA.address as Address,
          token1: tokenB.address as Address,
          fee: feeTier,
          tickLower: minTick,
          tickUpper: maxTick,
          amount0Desired: amountADesiredWei,
          amount1Desired: amountBDesiredWei,
          amount0Min: BigInt(0),
          amount1Min: BigInt(0),
          recipient: address,
          deadline: BigInt(deadlineTimestamp),
        }],
        value: BigInt(0),
      })

      await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
      
      // Reset form and refresh
      setAmountA('')
      setAmountB('')
      fetchBalances()
      fetchPoolInfo()
      
    } catch (err: any) {
      console.error('Add liquidity error:', err)
      setError(err.message || 'Add liquidity failed')
    } finally {
      setIsLoading(false)
    }
  }

  const canAddLiquidity = isConnected && amountA && amountB && !isLoading && !error && minTick < maxTick

  return (
    <div className="w-full max-w-4xl mx-auto bg-white rounded-2xl shadow-xl border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div>
          <h1 className="text-xl font-semibold">Add Liquidity</h1>
          {urlParams.token0 && urlParams.token1 && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <p className="text-xs text-blue-600">
                Pre-selected from swap: {urlParams.token0Symbol} → {urlParams.token1Symbol}
              </p>
            </div>
          )}
          {lastUpdated && (
            <p className="text-xs text-gray-500 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchBalances(true)}
            disabled={isRefreshing}
            className="p-2 hover:bg-gray-100 rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
            title="Refresh balances and pool info"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 hover:bg-gray-100 rounded-full"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Pool Info */}
      {loadingPoolInfo ? (
        <div className="p-4 bg-blue-50 border-b border-gray-200 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm text-blue-700">Loading pool information...</span>
        </div>
      ) : poolDataLoaded && poolExists ? (
        <div className="p-4 bg-green-50 border-b border-gray-200">
          <div className="text-sm text-green-700 flex items-center gap-2">
            <Info className="w-4 h-4" />
            <span>Pool exists • Current price: {currentPrice?.toFixed(6)}</span>
          </div>
        </div>
      ) : poolDataLoaded ? (
        <div className="p-4 bg-yellow-50 border-b border-gray-200">
          <div className="text-sm text-yellow-700 flex items-center gap-2">
            <Info className="w-4 h-4" />
            <span>Pool doesn't exist • Will be created on first liquidity add</span>
          </div>
        </div>
      ) : null}

      {/* Liquidity Form */}
      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Configuration */}
          <div className="space-y-6">
            {/* Token Pair Selection */}
            <div className="grid grid-cols-2 gap-4">
              {/* Token A */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Token A</span>
                  <span className="text-sm text-gray-500">
                    Balance: {formatBalance(tokenABalance)}
                  </span>
                </div>
                <TokenSelector
                  selectedToken={tokenA}
                  onTokenSelect={handleTokenASelect}
                  balance={tokenABalance}
                  excludeBCX={true}
                />
              </div>

              {/* Token B */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Token B</span>
                  <span className="text-sm text-gray-500">
                    Balance: {formatBalance(tokenBBalance)}
                  </span>
                </div>
                <TokenSelector
                  selectedToken={tokenB}
                  onTokenSelect={handleTokenBSelect}
                  balance={tokenBBalance}
                  disabled={isLoading}
                  excludeBCX={true}
                />
              </div>
            </div>

            {/* Fee Tier Selection */}
            <FeeTierSelector
              selectedFee={feeTier}
              onFeeSelect={setFeeTier}
              disabled={isLoading}
            />

            {/* FIX: Only render PriceRangeSelector after pool data is loaded */}
            {poolDataLoaded && currentPrice !== null ? (
              <PriceRangeSelector
                currentPrice={currentPrice}
                feeTier={feeTier}
                onRangeChange={handleRangeChange}
                disabled={isLoading}
              />
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Loading price data...</p>
              </div>
            )}

            {/* Amount Inputs */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Deposit Amounts
              </label>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    {tokenA?.symbol} Amount
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amountA}
                      onChange={(e) => setAmountA(e.target.value)}
                      placeholder="0.0"
                      className="w-full px-3 py-2 pr-16 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isLoading}
                    />
                    <button
                      onClick={handleMaxClickA}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      disabled={isLoading}
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 mb-1">
                    {tokenB?.symbol} Amount
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amountB}
                      onChange={(e) => handleAmountBChange(e.target.value)}
                      placeholder="0.0"
                      className="w-full px-3 py-2 pr-16 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isLoading}
                    />
                    <button
                      onClick={handleMaxClickB}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-700 font-medium"
                      disabled={isLoading}
                    >
                      MAX
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-sm text-red-500 bg-red-50 p-3 rounded-lg">
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
                poolExists ? 'Add Liquidity' : 'Create Pool & Add Liquidity'
              )}
            </button>
          </div>

          {/* Right Column - Preview */}
          <div className="bg-gray-50 rounded-lg p-6">
            {poolDataLoaded && currentPrice !== null && minTick < maxTick ? (
              <LiquidityPreview
                currentPrice={currentPrice}
                minPrice={tickToPrice(minTick)}
                maxPrice={tickToPrice(maxTick)}
                minTick={minTick}
                maxTick={maxTick}
                amount0={amountA}
                amount1={amountB}
                token0Symbol={tokenA?.symbol || 'Token0'}
                token1Symbol={tokenB?.symbol || 'Token1'}
              />
            ) : (
              <div className="text-center py-12">
                <p className="text-sm text-gray-500">
                  Configure your position to see preview
                </p>
              </div>
            )}
          </div>
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
