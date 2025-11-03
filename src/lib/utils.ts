import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatBalance(balance: string | number, decimals: number = 4): string {
  const num = typeof balance === 'number' ? balance : Number(balance)

  if (!isFinite(num) || isNaN(num)) return '0'
  if (num === 0) return '0'

  const abs = Math.abs(num)

  // Tiny amounts
  if (abs < 0.000001) return '< 0.000001'

  // Very large amounts – use compact notation (K, M, B, T)
  if (abs >= 1e9) {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(num)
  }

  // Default – fixed with grouping
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num)
}

export function formatPriceImpact(priceImpact: number): string {
  if (priceImpact < 0.01) return '< 0.01%'
  return `${priceImpact.toFixed(2)}%`
}

export function getSlippageColor(slippage: number): string {
  if (slippage <= 0.5) return 'text-green-500'
  if (slippage <= 1) return 'text-yellow-500'
  return 'text-red-500'
}

export function getPriceImpactColor(priceImpact: number): string {
  if (priceImpact <= 1) return 'text-green-500'
  if (priceImpact <= 5) return 'text-yellow-500'
  return 'text-red-500'
}
