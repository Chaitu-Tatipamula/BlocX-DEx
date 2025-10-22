import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatAddress(address: string): string {
  if (!address) return ''
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function formatBalance(balance: string, decimals: number = 4): string {
  const num = parseFloat(balance)
  if (num === 0) return '0'
  if (num < 0.0001) return '< 0.0001'
  return num.toFixed(decimals)
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
