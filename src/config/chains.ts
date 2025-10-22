import { defineChain } from 'viem'

export const blockx = defineChain({
  id: 19191,
  name: 'BlockX',
  nativeCurrency: {
    name: 'BlockX',
    symbol: 'BCX',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_BLOCKX_RPC_URL || 'https://web3.blockxnet.com'],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_BLOCKX_RPC_URL || 'https://web3.blockxnet.com'],
    },
  },
  blockExplorers: {
    default: {
      name: 'BlockXScan',
      url: process.env.NEXT_PUBLIC_BLOCKX_EXPLORER_URL || 'https://explorer.blockxnet.com',
    },
  },
  testnet: false,
})

export const supportedChains = [blockx]
