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
    logoURI: '/tokens/bcx.png',
  },
  WBCX: {
    address: process.env.NEXT_PUBLIC_WBCX_ADDRESS || '0xb6AB8EB821618033F5FE3763dDb7290cDEE10c24',
    symbol: 'WBCX',
    name: 'Wrapped BlockX',
    decimals: 18,
    logoURI: '/tokens/wbcx.png',
  },
  TEST: {
    address: process.env.NEXT_PUBLIC_TEST_TOKEN_ADDRESS || '0x4e3e6B7862a6DEda1049A9bE69f4E4042491760f',
    symbol: 'TEST',
    name: 'Test Token',
    decimals: 18,
    logoURI: '/tokens/test.png',
  },
  FRESH: {
    address: process.env.NEXT_PUBLIC_FRESH_TOKEN_ADDRESS || '0x207851F88bc4a597F79557ffb15B456D28489a74',
    symbol: 'FRESH',
    name: 'Fresh Test Token',
    decimals: 18,
    logoURI: '/tokens/fresh.png',
  },
}

export const tokenList = Object.values(tokens)
