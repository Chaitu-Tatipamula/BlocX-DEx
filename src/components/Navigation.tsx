'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { WalletButton } from './WalletButton'

export function Navigation() {
  const pathname = usePathname()

  const navItems = [
    { href: '/swap', label: 'Swap' },
    { href: '/liquidity', label: 'Add Liquidity' },
    { href: '/pools', label: 'Pools' },
    { href: '/positions', label: 'My Positions' },
  ]

  return (
    <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <img src="/Blockx-logo.svg" alt="BlockX" className="h-7 w-auto" />
            </Link>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-6">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`py-2 text-sm font-medium transition-colors ${
                  pathname === item.href || (item.href === '/swap' && pathname === '/')
                    ? 'text-blue-700'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Wallet Button */}
          <div className="flex items-center">
            <WalletButton />
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden border-t border-gray-100">
          <div className="flex justify-around py-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  pathname === item.href || (item.href === '/swap' && pathname === '/')
                    ? 'text-blue-700'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}
