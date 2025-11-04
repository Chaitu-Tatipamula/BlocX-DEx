'use client'

import React from 'react'
import Link from 'next/link'
import { SwapCard } from '@/components/SwapCard'

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
          {/* Main Heading */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4">
              Swap anytime, anywhere.
            </h1>
            <p className="text-lg md:text-xl text-white/70 max-w-2xl mx-auto">
              Trade tokens instantly on the BlockX network with low fees and fast transactions.
            </p>
          </div>

          {/* Swap Card Container */}
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <SwapCard />
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-12 text-center">
            <p className="text-sm text-white/60">
              Buy and sell tokens with concentrated liquidity on BlockX network.
            </p>
          </div>

          {/* Quick Links */}
          <div className="mt-16 flex flex-wrap justify-center gap-6">
            <Link
              href="/liquidity"
              className="px-6 py-3 glass-button-primary font-medium"
            >
              Add Liquidity
            </Link>
            <Link
              href="/pools"
              className="px-6 py-3 glass-button font-medium"
            >
              Explore Pools
            </Link>
            <Link
              href="/positions"
              className="px-6 py-3 glass-button font-medium"
            >
              My Positions
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
