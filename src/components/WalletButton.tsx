'use client'

import React from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useBalance } from 'wagmi'
import { formatAddress, formatBalance } from '@/lib/utils'

export function WalletButton() {
  const { address, isConnected } = useAccount()
  const { data: balance } = useBalance({
    address,
  })

  if (!isConnected) {
    return <ConnectButton />
  }

  return (
    <div className="flex items-center gap-3">
      <div className="text-right">
        <div className="text-sm font-medium">
          {formatAddress(address || '')}
        </div>
        <div className="text-xs text-gray-500">
          {balance ? `${formatBalance(balance.formatted)} ${balance.symbol}` : '0 BCX'}
        </div>
      </div>
      <ConnectButton />
    </div>
  )
}
