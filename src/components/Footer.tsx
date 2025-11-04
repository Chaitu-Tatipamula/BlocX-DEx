import React from "react";
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-slate-900/90 to-slate-950/95 text-slate-100 border-t border-white/5">
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row md:items-start md:justify-between gap-8">
        <div className="flex items-start gap-4 min-w-[180px]">
          <div className="flex items-center">
            <Link href="/" className="flex items-center">
              <img src="/Blockx-logo.svg" alt="BlockX" className="h-7 w-auto" />
            </Link>
          </div>

          <div>
            <div className="text-white font-semibold text-sm">BlockX Dex</div>
            <div className="text-slate-300 text-xs mt-1">Decentralized liquidity, simply.</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 flex-1 min-w-0">
          <div>
            <div className="text-slate-100 font-semibold text-sm mb-2">Products</div>
            <nav className="flex flex-col text-slate-300 text-sm space-y-1">
              <a className="hover:text-white transition-colors" href="/swap">Swap</a>
              <a className="hover:text-white transition-colors" href="/pools">Pools</a>
              <a className="hover:text-white transition-colors" href="/liquidity">Liquidity</a>
            </nav>
          </div>

          <div>
            <div className="text-slate-100 font-semibold text-sm mb-2">Resources</div>
            <nav className="flex flex-col text-slate-300 text-sm space-y-1">
              <a className="hover:text-white transition-colors" href="/positions">Positions</a>
              <a className="hover:text-white transition-colors" href="/">Settings</a>
              <a className="hover:text-white transition-colors" href="/" target="_blank" rel="noopener noreferrer">Docs</a>
            </nav>
          </div>

          <div>
            <div className="text-slate-100 font-semibold text-sm mb-2">Community</div>
            <nav className="flex flex-col text-slate-300 text-sm space-y-1">
              <a className="hover:text-white transition-colors" href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a className="hover:text-white transition-colors" href="https://twitter.com" target="_blank" rel="noopener noreferrer">Twitter</a>
              <a className="hover:text-white transition-colors" href="https://discord.com" target="_blank" rel="noopener noreferrer">Discord</a>
            </nav>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-4 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-slate-300 text-sm">
        <div>© {new Date().getFullYear()} BlockX Dex — Built with care.</div>
        <div className="flex items-center gap-3">
          <a className="hover:underline text-slate-300" href="/terms">Terms</a>
          <span className="text-white/40">•</span>
          <a className="hover:underline text-slate-300" href="/privacy">Privacy</a>
        </div>
      </div>
    </footer>
  );
}
