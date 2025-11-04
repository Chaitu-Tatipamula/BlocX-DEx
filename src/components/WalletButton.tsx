'use client'

import React, { useState, useEffect } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'

export function WalletButton() {
  const [isMounted, setIsMounted] = useState(false)

  // Prevent hydration mismatch by only rendering after mount
  useEffect(() => {
    setIsMounted(true)
  }, [])

  if (!isMounted) {
    return <ConnectButton />
  }

  return <ConnectButton />
}
