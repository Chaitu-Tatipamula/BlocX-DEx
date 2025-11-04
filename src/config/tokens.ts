export interface Token {
  address: string
  symbol: string
  name: string
  decimals: number
  logoURI?: string
}

export const tokens: Record<string, Token> = {
  BCX: {
    address: '0x0000000000000000000000000000000000000000',
    symbol: 'BCX',
    name: 'BlockX',
    decimals: 18,
    logoURI: '/tokens/bcx.svg',
  },
  WBCX: {
    address: process.env.NEXT_PUBLIC_WBCX_ADDRESS || '0xb6AB8EB821618033F5FE3763dDb7290cDEE10c24',
    symbol: 'WBCX',
    name: 'Wrapped BlockX',
    decimals: 18,
    logoURI: '/tokens/bcx.svg',
  },
  TEST: {
    address: process.env.NEXT_PUBLIC_TEST_TOKEN_ADDRESS || '0x4e3e6B7862a6DEda1049A9bE69f4E4042491760f',
    symbol: 'TEST',
    name: 'Test Token',
    decimals: 18,
    logoURI: '/tokens/test.svg',
  },
  FRESH: {
    address: process.env.NEXT_PUBLIC_FRESH_TOKEN_ADDRESS || '0x207851F88bc4a597F79557ffb15B456D28489a74',
    symbol: 'FRESH',
    name: 'Fresh Test Token',
    decimals: 18,
    logoURI: '/tokens/fresh.svg',
  },
  USDT: {
    address: '0x2f174aEac9fAD6e64760882AF4cb1DcB62921A10',
    symbol: 'USDT',
    name: 'USDT',
    decimals: 6,
    logoURI: '/tokens/usdt.svg',
  },
  USDC: {
    address: '0xFb6253856a24544E454ab8336Eb90116f0afEB9F',
    symbol: 'USDC',
    name: 'USDC',
    decimals: 6,
    logoURI: '/tokens/usdc.svg',
  }
}

export const tokenList = Object.values(tokens)
