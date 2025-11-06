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
import { parseUnits, formatUnits, type Address } from 'viem'
import { CONTRACT_ADDRESSES, NONFUNGIBLE_POSITION_MANAGER_ABI, ERC20_ABI } from '@/lib/contracts'
import { PoolService } from '@/services/poolService'
import { priceToTick, tickToPrice } from '@/lib/tickMath'
import { calculateOptimalAmount, formatPrice } from '@/lib/positionAnalysis'
import { useTx } from '../context/tx'

export function LiquidityCard() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { addTx, addError } = useTx()

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
  const [initialPriceInput, setInitialPriceInput] = useState('1')

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
      
      const balanceA = await getTokenBalance(publicClient, tokenAAddress, address, tokenA?.decimals)
      const balanceB = await getTokenBalance(publicClient, tokenBAddress, address, tokenB?.decimals)
      
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
        setCurrentPrice(parseFloat(initialPriceInput) || 1) // Default from input for new pools
      }
      setPoolDataLoaded(true) // FIX: Mark as loaded
    } catch (error) {
      console.error('Error fetching pool info:', error)
      setPoolExists(false)
      setCurrentPrice(parseFloat(initialPriceInput) || 1)
      setPoolDataLoaded(true) // FIX: Mark as loaded even on error
    } finally {
      setLoadingPoolInfo(false)
    }
  }, [tokenA, tokenB, feeTier, publicClient, initialPriceInput])

  // When creating a new pool, reflect manual initial price in the range selector preview
  useEffect(() => {
    if (!poolExists) {
      const v = parseFloat(initialPriceInput)
      if (!isNaN(v) && v > 0) setCurrentPrice(v)
    }
  }, [initialPriceInput, poolExists])

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
      
      // Calculate sqrt prices for logging
      const sqrtPriceCurrent = Math.sqrt(Math.pow(1.0001, currentTick))
      const sqrtPriceLower = Math.sqrt(Math.pow(1.0001, minTick))
      const sqrtPriceUpper = Math.sqrt(Math.pow(1.0001, maxTick))
      
      // Uniswap V3 liquidity formula:
      // When providing token0 (WBCX): L = amount0 / (1/√P_current - 1/√P_upper)
      // Then calculate token1 (USDC): amount1 = L * (√P_current - √P_lower)
      const amount0 = parseFloat(amountA)
      const liquidity = amount0 / (1 / sqrtPriceCurrent - 1 / sqrtPriceUpper)
      const amount1 = liquidity * (sqrtPriceCurrent - sqrtPriceLower)
      
      console.log('📊 Amount calculation breakdown:', {
        input: { amount0: `${amountA} ${tokenA?.symbol}`, currentPrice },
        priceRange: {
          minPrice: tickToPrice(minTick),
          maxPrice: tickToPrice(maxTick),
          currentPrice,
          minTick,
          maxTick,
          currentTick,
        },
        sqrtPrices: {
          sqrtPriceCurrent: sqrtPriceCurrent.toFixed(10),
          sqrtPriceLower: sqrtPriceLower.toFixed(10),
          sqrtPriceUpper: sqrtPriceUpper.toFixed(10),
        },
        calculation: {
          liquidity: liquidity.toFixed(10),
          formula: 'L = amount0 / (1/√P_current - 1/√P_upper)',
          amount1Formula: 'amount1 = L * (√P_current - √P_lower)',
          calculatedAmount1: amount1.toFixed(10),
        },
        result: {
          amount1: `${amount1.toFixed(6)} ${tokenB?.symbol}`,
        },
      })
      
      const optimalAmountB = calculateOptimalAmount(amountA, true, currentTick, minTick, maxTick)
      setAmountB(parseFloat(optimalAmountB).toFixed(6))
    } catch (error) {
      console.error('Error calculating amount B:', error)
    }
  }, [amountA, currentPrice, minTick, maxTick, tokenA?.symbol, tokenB?.symbol])

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
      addError({ title: 'Wallet Not Connected', message: 'Please connect your wallet' })
      return
    }

    // Allow one-sided positions (one amount can be 0)
    const amountANum = parseFloat(amountA) || 0
    const amountBNum = parseFloat(amountB) || 0
    
    if (amountANum <= 0 && amountBNum <= 0) {
      addError({ title: 'Invalid Amounts', message: 'Please enter valid amounts (at least one token must be > 0)' })
      return
    }

    if (minTick >= maxTick) {
      addError({ title: 'Invalid Price Range', message: 'Invalid price range' })
      return
    }

    // Check if using native BCX token (not allowed for pools)
    if (tokenA?.symbol === 'BCX' || tokenB?.symbol === 'BCX') {
      addError({ title: 'Invalid Token', message: 'Cannot create pools with native BCX. Please use WBCX (Wrapped BCX) instead.' })
      return
    }

    // Check if token addresses are valid
    if (tokenA?.address === '0x0000000000000000000000000000000000000000' || 
        tokenB?.address === '0x0000000000000000000000000000000000000000') {
      addError({ title: 'Invalid Token Address', message: 'Invalid token address. Please select valid tokens.' })
      return
    }

    setIsLoading(true)

    try {
      // Handle one-sided positions (one amount can be 0)
      const amountADesiredWei = amountANum > 0 ? parseUnits(amountA, tokenA.decimals) : BigInt(0)
      const amountBDesiredWei = amountBNum > 0 ? parseUnits(amountB, tokenB.decimals) : BigInt(0)
      const deadlineTimestamp = Math.floor(Date.now() / 1000) + deadline * 60

      // Check if pool exists, create if needed
      if (!poolExists) {
        const poolService = new PoolService(publicClient, walletClient)
        // Compute initial price for pool initialization (token1/token0) adjusted for decimals
        const token0 = tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? tokenA : tokenB
        const token1 = token0.address === tokenA.address ? tokenB : tokenA
        const inputPriceAB = parseFloat(initialPriceInput) || 1 // price of tokenA in tokenB
        const price01 = token0.address === tokenA.address ? inputPriceAB : (inputPriceAB > 0 ? 1 / inputPriceAB : 1)
        const normalizedPrice = price01 * Math.pow(10, (token1.decimals - token0.decimals))

        await poolService.createPoolIfNeeded(
          tokenA.address,
          tokenB.address,
          feeTier,
          normalizedPrice
        )
      }

      // Approve tokens
      const tokenAContract = { address: tokenA.address as Address, abi: ERC20_ABI }
      const tokenBContract = { address: tokenB.address as Address, abi: ERC20_ABI }
      
      // Only approve if amount > 0
      if (amountANum > 0) {
        const allowanceA = await publicClient.readContract({
          ...tokenAContract,
          functionName: 'allowance',
          args: [address, CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER],
        })
        
        console.log(`Token A (${tokenA.symbol}) approval check:`, {
          allowance: allowanceA.toString(),
          required: amountADesiredWei.toString(),
          needsApproval: allowanceA < amountADesiredWei,
          amountFormatted: formatUnits(amountADesiredWei, tokenA.decimals),
        })
        
        if (allowanceA < amountADesiredWei) {
          console.log(`Approving ${tokenA.symbol}...`)
          const approveHashA = await walletClient.writeContract({
            ...tokenAContract,
            functionName: 'approve',
            args: [CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER, amountADesiredWei],
          })
          if (approveHashA) addTx({ hash: approveHashA, title: `Approve ${tokenA.symbol}`})
          await publicClient.waitForTransactionReceipt({ hash: approveHashA })
          console.log(`✓ ${tokenA.symbol} approved`)
        }
      }
      
      // Only approve if amount > 0
      if (amountBNum > 0) {
        const allowanceB = await publicClient.readContract({
          ...tokenBContract,
          functionName: 'allowance',
          args: [address, CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER],
        })
        
        console.log(`Token B (${tokenB.symbol}) approval check:`, {
          allowance: allowanceB.toString(),
          required: amountBDesiredWei.toString(),
          needsApproval: allowanceB < amountBDesiredWei,
          amountFormatted: formatUnits(amountBDesiredWei, tokenB.decimals),
        })
        
        if (allowanceB < amountBDesiredWei) {
          console.log(`Approving ${tokenB.symbol}...`)
          const approveHashB = await walletClient.writeContract({
            ...tokenBContract,
            functionName: 'approve',
            args: [CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER, amountBDesiredWei],
          })
          if (approveHashB) addTx({ hash: approveHashB, title: `Approve ${tokenB.symbol}` })

          await publicClient.waitForTransactionReceipt({ hash: approveHashB })
          console.log(`✓ ${tokenB.symbol} approved`)
        }
      }

      // IMPORTANT: Uniswap V3 requires token0 < token1 (address comparison)
      // Sort tokens and swap amounts accordingly
      const token0Address = tokenA.address.toLowerCase() < tokenB.address.toLowerCase() 
        ? tokenA.address as Address 
        : tokenB.address as Address
      const token1Address = tokenA.address.toLowerCase() < tokenB.address.toLowerCase() 
        ? tokenB.address as Address 
        : tokenA.address as Address
      
      // Swap amounts if tokens were swapped
      const amount0Desired = tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
        ? amountADesiredWei
        : amountBDesiredWei
      const amount1Desired = tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
        ? amountBDesiredWei
        : amountADesiredWei

      // Validate ticks
      if (minTick >= maxTick) {
        throw new Error('Invalid tick range: minTick must be less than maxTick')
      }

      // Get token info for logging
      const token0Info = tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? tokenA : tokenB
      const token1Info = tokenA.address.toLowerCase() < tokenB.address.toLowerCase() ? tokenB : tokenA
      
      // Check if price range includes current price
      const currentTick = currentPrice ? priceToTick(currentPrice) : null
      const isInRange = currentTick !== null && currentTick >= minTick && currentTick <= maxTick
      
      if (!isInRange && currentTick !== null) {
        console.warn('⚠️ Price range does not include current price!', {
          currentTick,
          currentPrice,
          minTick,
          maxTick,
          minPrice: tickToPrice(minTick),
          maxPrice: tickToPrice(maxTick),
          warning: 'Only one token will be deposited if price is out of range'
        })
      }
      
      console.log('Minting position with:', {
        token0: { address: token0Address, symbol: token0Info.symbol, decimals: token0Info.decimals },
        token1: { address: token1Address, symbol: token1Info.symbol, decimals: token1Info.decimals },
        fee: feeTier,
        tickLower: minTick,
        tickUpper: maxTick,
        amount0Desired: amount0Desired.toString(),
        amount1Desired: amount1Desired.toString(),
        amount0DesiredFormatted: formatUnits(amount0Desired, token0Info.decimals),
        amount1DesiredFormatted: formatUnits(amount1Desired, token1Info.decimals),
        currentPrice,
        currentTick,
        minPrice: tickToPrice(minTick),
        maxPrice: tickToPrice(maxTick),
        isInRange,
      })

      // Simulate mint first to see actual amounts that will be deposited
      try {
        const simulateResult = await publicClient.simulateContract({
          address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
          abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
          functionName: 'mint',
          args: [{
            token0: token0Address,
            token1: token1Address,
            fee: feeTier,
            tickLower: minTick,
            tickUpper: maxTick,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: BigInt(0),
            amount1Min: BigInt(0),
            recipient: address,
            deadline: BigInt(deadlineTimestamp),
          }],
          account: address,
        })

        const [tokenId, liquidity, actualAmount0, actualAmount1] = simulateResult.result as [bigint, bigint, bigint, bigint]
        
        console.log('⚠️ Simulated mint result (actual amounts that will be deposited):', {
          tokenId: tokenId.toString(),
          liquidity: liquidity.toString(),
          amount0: {
            raw: actualAmount0.toString(),
            formatted: formatUnits(actualAmount0, token0Info.decimals),
            symbol: token0Info.symbol,
          },
          amount1: {
            raw: actualAmount1.toString(),
            formatted: formatUnits(actualAmount1, token1Info.decimals),
            symbol: token1Info.symbol,
          },
          desiredAmount0: {
            raw: amount0Desired.toString(),
            formatted: formatUnits(amount0Desired, token0Info.decimals),
          },
          desiredAmount1: {
            raw: amount1Desired.toString(),
            formatted: formatUnits(amount1Desired, token1Info.decimals),
          },
        })

        // Validate that both tokens will be deposited if desired
        if (actualAmount0 === BigInt(0) && amount0Desired > BigInt(0)) {
          throw new Error(
            `${token0Info.symbol} amount is too small and will be rounded to 0. ` +
            `Please increase the ${token0Info.symbol} amount or adjust the price range. ` +
            `Desired: ${formatUnits(amount0Desired, token0Info.decimals)} ${token0Info.symbol}, Actual: 0`
          )
        }
        
        if (actualAmount1 === BigInt(0) && amount1Desired > BigInt(0)) {
          // Calculate actual price range bounds
          const minPrice = tickToPrice(minTick)
          const maxPrice = tickToPrice(maxTick)
          const rangeWidth = currentPrice && currentPrice > 0 
            ? ((maxPrice - minPrice) / currentPrice) * 100 
            : 0
          
          // Calculate required amount based on range width and current price position
          // Wider ranges require larger amounts due to precision loss in integer math
          // Based on testing: even 10% ranges need 10+ USDC to avoid rounding to 0
          let minSuggestedAmount = BigInt(20000000) // Default: 20 USDC for very wide ranges
          
          if (rangeWidth > 0) {
            if (rangeWidth < 5) {
              minSuggestedAmount = BigInt(5000000) // 5 USDC for very narrow ranges (<5%)
            } else if (rangeWidth < 10) {
              minSuggestedAmount = BigInt(10000000) // 10 USDC for narrow ranges (5-10%)
            } else if (rangeWidth < 20) {
              minSuggestedAmount = BigInt(15000000) // 15 USDC for medium ranges (10-20%)
            } else {
              minSuggestedAmount = BigInt(20000000) // 20 USDC for wide ranges (>20%)
            }
          }
          
          const rangeInfo = rangeWidth > 0
            ? `\nPrice range width: ${rangeWidth.toFixed(2)}% (wider ranges require larger amounts due to integer precision). `
            : `\nWide price ranges require larger amounts due to integer precision. `
          
          throw new Error(
            `${token1Info.symbol} amount is too small and will be rounded to 0 by the contract's integer math. ` +
            `\n\nDesired: ${formatUnits(amount1Desired, token1Info.decimals)} ${token1Info.symbol}, Actual: 0. ` +
            rangeInfo +
            `\n\nWhy this happens: Uniswap V3 uses integer arithmetic. The liquidity calculation ` +
            `results in very small intermediate values that round to 0 when converted back to token amounts. ` +
            `This is especially problematic with 6-decimal tokens (USDC/USDT) where the smallest unit is larger. ` +
            `\n\nSolutions:` +
            `\n1. Increase ${token1Info.symbol} to at least ${formatUnits(minSuggestedAmount, token1Info.decimals)} ${token1Info.symbol} (recommended), or` +
            `\n2. Use a much narrower price range (try ±1% or ±2% for smaller amounts)`
          )
        }
        
        // Warn if amounts differ significantly
        const amount0Diff = actualAmount0 < amount0Desired ? amount0Desired - actualAmount0 : BigInt(0)
        const amount1Diff = actualAmount1 < amount1Desired ? amount1Desired - actualAmount1 : BigInt(0)
        
        if (amount0Diff > BigInt(0) || amount1Diff > BigInt(0)) {
          console.warn('⚠️ Note: Actual deposited amounts may differ from desired amounts:', {
            token0Diff: formatUnits(amount0Diff, token0Info.decimals),
            token1Diff: formatUnits(amount1Diff, token1Info.decimals),
          })
        }
      } catch (simulateError) {
        // If simulation fails, don't block - might be a simulation issue
        console.error('Error simulating mint (continuing anyway):', simulateError)
        if (simulateError instanceof Error && simulateError.message.includes('rounded to 0')) {
          throw simulateError // Re-throw our validation errors
        }
      }

      // Mint position with custom tick range
      console.log('Submitting mint transaction...')
      const hash = await walletClient.writeContract({
        address: CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER,
        abi: NONFUNGIBLE_POSITION_MANAGER_ABI,
        functionName: 'mint',
        args: [{
          token0: token0Address,
          token1: token1Address,
          fee: feeTier,
          tickLower: minTick,
          tickUpper: maxTick,
          amount0Desired: amount0Desired,
          amount1Desired: amount1Desired,
          amount0Min: BigInt(0),
          amount1Min: BigInt(0),
        recipient: address,
          deadline: BigInt(deadlineTimestamp),
        }],
        value: BigInt(0),
      })
      if (hash) addTx({ hash: hash as string, title: poolExists ? 'Added Liquidity' : 'Create Pool & Add Liquidity'})

      console.log('Transaction hash:', hash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash: hash as `0x${string}` })
      
      // Log transaction receipt to see what was actually deposited
      console.log('Transaction receipt:', {
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
        logs: receipt.logs.length,
      })
      
      // Try to find the IncreaseLiquidity event or check logs for token transfers
      const positionManagerInterface = '0x' + CONTRACT_ADDRESSES.NONFUNGIBLE_POSITION_MANAGER.slice(2).toLowerCase()
      const transferEvents = receipt.logs.filter(log => 
        log.address.toLowerCase() === token0Address.toLowerCase() || 
        log.address.toLowerCase() === token1Address.toLowerCase()
      )
      
      console.log('Token transfer events found:', transferEvents.length)
      transferEvents.forEach((log, i) => {
        console.log(`Transfer ${i + 1}:`, {
          address: log.address,
          topics: log.topics,
          data: log.data,
        })
      })
      
      // Reset form and refresh
      setAmountA('')
      setAmountB('')
      fetchBalances()
      fetchPoolInfo()
      
    } catch (err: any) {
      console.error('Add liquidity error:', err)
      
      // Provide more detailed error messages
      let errorMessage = 'Add liquidity failed'
      if (err?.message) {
        errorMessage = err.message
        // Check for common errors
        if (err.message.includes('execution reverted')) {
          errorMessage = 'Transaction failed. This could be due to:\n- Insufficient token balance\n- Invalid tick range\n- Pool not initialized\n- Token approval issues'
        } else if (err.message.includes('user rejected')) {
          errorMessage = 'Transaction was rejected'
        } else if (err.message.includes('token0') || err.message.includes('token1')) {
          errorMessage = `Token ordering error: ${err.message}`
        }
      }
      
      addError({ title: 'Failed to Add Liquidity', message: errorMessage })
    } finally {
      setIsLoading(false)
    }
  }

  // Allow one-sided positions (at least one amount must be > 0)
  const amountANum = parseFloat(amountA) || 0
  const amountBNum = parseFloat(amountB) || 0
  const hasValidAmounts = amountANum > 0 || amountBNum > 0
  // Don't block on errors - allow users to retry
  const canAddLiquidity = isConnected && hasValidAmounts && !isLoading && minTick < maxTick

  return (
    <div className="w-full max-w-4xl mx-auto glass-card">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/10">
        <div>
        <h1 className="text-xl font-semibold text-white">Add Liquidity</h1>
          {urlParams.token0 && urlParams.token1 && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <p className="text-xs text-blue-300">
                Pre-selected from swap: {urlParams.token0Symbol} → {urlParams.token1Symbol}
              </p>
            </div>
          )}
          {lastUpdated && (
            <p className="text-xs text-white/50 mt-1">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchBalances(true)}
            disabled={isRefreshing}
            className="p-2 hover:bg-white/10 rounded-full disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            title="Refresh balances and pool info"
          >
            <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        <button
          onClick={() => setShowSettings(true)}
          className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
        >
          <Settings className="w-5 h-5" />
        </button>
        </div>
      </div>

      {/* Pool Info */}
      {loadingPoolInfo ? (
        <div className="p-4 glass-card border-b border-white/10 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
          <span className="text-sm text-blue-300">Loading pool information...</span>
        </div>
      ) : poolDataLoaded && poolExists ? (
        <div className="p-4 glass-card border-b border-white/10 border border-green-500/30">
          <div className="text-sm text-green-300 flex items-center gap-2">
            <Info className="w-4 h-4" />
            <span>Pool exists • Current price: {currentPrice ? formatPrice(currentPrice) : 'N/A'}</span>
          </div>
        </div>
      ) : poolDataLoaded ? (
        <div className="p-4 glass-card border-b border-white/10 border border-yellow-500/30">
          <div className="text-sm text-yellow-300 flex items-center gap-2">
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
            <span className="text-sm text-white/70">Token A</span>
            <span className="text-sm text-white/60">
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
            <span className="text-sm text-white/70">Token B</span>
            <span className="text-sm text-white/60">
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

            {/* Initial price (only when pool does not exist) */}
            {poolDataLoaded && !poolExists && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Initial price (1 {tokenA?.symbol} in {tokenB?.symbol})
                </label>
              <input
                type="number"
                  value={initialPriceInput}
                  onChange={(e) => setInitialPriceInput(e.target.value)}
                  placeholder="e.g. 0.1"
                  className="glass-input w-full px-3 py-2 text-white"
                  min="0"
                  step="any"
                  disabled={isLoading}
                />
                <p className="text-xs text-white/50 mt-1">
                  Used to initialize the pool price. This sets the starting ratio.
                </p>
              </div>
            )}

            {/* FIX: Only render PriceRangeSelector after pool data is loaded */}
            {poolDataLoaded && currentPrice !== null ? (
              <PriceRangeSelector
                currentPrice={currentPrice}
                feeTier={feeTier}
                onRangeChange={handleRangeChange}
                disabled={isLoading}
              />
            ) : (
              <div className="text-center py-8 glass-card rounded-lg">
                <Loader2 className="w-6 h-6 animate-spin text-white mx-auto mb-2" />
                <p className="text-sm text-white/70">Loading price data...</p>
              </div>
            )}

            {/* Amount Inputs */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-white/80">
                Deposit Amounts
              </label>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/70 mb-1">
                    {tokenA?.symbol} Amount
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amountA}
                      onChange={(e) => setAmountA(e.target.value)}
                      placeholder="0.0"
                      className="glass-input w-full px-3 py-2 pr-16 text-white"
                      disabled={isLoading}
                    />
                    <button
                      onClick={handleMaxClickA}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-300 hover:text-blue-200 font-medium"
                      disabled={isLoading}
                    >
                      MAX
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white/70 mb-1">
                    {tokenB?.symbol} Amount
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={amountB}
                      onChange={(e) => handleAmountBChange(e.target.value)}
                      placeholder="0.0"
                      className="glass-input w-full px-3 py-2 pr-16 text-white"
                disabled={isLoading}
              />
              <button
                onClick={handleMaxClickB}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-300 hover:text-blue-200 font-medium"
                disabled={isLoading}
              >
                MAX
              </button>
            </div>
          </div>
        </div>
            </div>


        {/* Add Liquidity Button */}
        <button
          onClick={handleAddLiquidity}
          disabled={!canAddLiquidity}
          className="glass-button-primary w-full py-3 px-4 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Adding Liquidity...
            </div>
          ) : !isConnected ? (
            'Connect Wallet'
              ) : !hasValidAmounts ? (
            'Enter Amounts'
          ) : (
                poolExists ? 'Add Liquidity' : 'Create Pool & Add Liquidity'
          )}
        </button>
          </div>

          {/* Right Column - Preview */}
          <div className="glass-card rounded-lg p-6">
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
                <p className="text-sm text-white/50">
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
