# BlockX DEX

A decentralized exchange (DEX) application built for the BlockX network using Next.js 14, RainbowKit, wagmi v2, and Tailwind CSS.

## Features

- 🔗 **Wallet Connection**: Multi-wallet support via RainbowKit (MetaMask, WalletConnect, Coinbase Wallet, etc.)
- 💱 **Token Swapping**: Swap between BCX, WBCX, and test tokens on BlockX network
- 💧 **Liquidity Provision**: Add liquidity to token pairs and earn trading fees
- 📊 **Position Management**: View and manage your liquidity positions
- ⚙️ **Advanced Settings**: Customizable slippage tolerance and transaction deadline
- 📱 **Responsive Design**: Mobile and desktop optimized interface
- 🎨 **Modern UI**: Clean, PancakeSwap-inspired design with Tailwind CSS
- 🔒 **Secure**: Built with viem for secure smart contract interactions

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Wallet**: RainbowKit + wagmi v2
- **Styling**: Tailwind CSS
- **Blockchain**: BlockX Network
- **Smart Contracts**: viem
- **Language**: TypeScript

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory:

```env
# BlockX Network Configuration
NEXT_PUBLIC_BLOCKX_RPC_URL=https://web3.blockxnet.com
NEXT_PUBLIC_BLOCKX_CHAIN_ID=19191
NEXT_PUBLIC_BLOCKX_EXPLORER_URL=https://explorer.blockxnet.com

# Contract Addresses
NEXT_PUBLIC_ROUTER_ADDRESS=0x1fd7552F4fED1Be6a8e6d706f5B77B851a5d5F57
NEXT_PUBLIC_WBCX_ADDRESS=0xb6AB8EB821618033F5FE3763dDb7290cDEE10c24
NEXT_PUBLIC_FACTORY_ADDRESS=0x39B1F7E20A86207e03D213e27f3E05f23A662e55

# Test Token Addresses
NEXT_PUBLIC_TEST_TOKEN_ADDRESS=0x4e3e6B7862a6DEda1049A9bE69f4E4042491760f
NEXT_PUBLIC_FRESH_TOKEN_ADDRESS=0x207851F88bc4a597F79557ffb15B456D28489a74

# WalletConnect Project ID (optional)
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-project-id
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
/app
  /page.tsx              # Main swap interface
  /layout.tsx            # Root layout with providers
  /providers.tsx         # RainbowKit + wagmi providers
  /globals.css           # Global styles
/components
  /SwapCard.tsx          # Main swap interface component
  /TokenSelector.tsx     # Token selection modal
  /WalletButton.tsx      # Wallet connection button
  /SettingsModal.tsx     # Settings modal (slippage, deadline)
/lib
  /contracts.ts          # Contract addresses & ABIs
  /swap.ts              # Swap logic functions
  /utils.ts             # Utility functions
/config
  /chains.ts            # BlockX network configuration
  /tokens.ts            # Token list configuration
```

## Key Features

### Wallet Connection
- Multi-wallet support via RainbowKit
- Display connected wallet address and balance
- Easy disconnect functionality

### Token Swapping
- Support for BCX (native), WBCX (wrapped), and test tokens
- Real-time price quotes using PancakeSwap V3 QuoterV2
- Price impact calculation
- Slippage protection
- Transaction deadline settings

### Liquidity Provision
- Add liquidity to token pairs
- Automatic price ratio calculation
- Pool existence detection
- Slippage protection for liquidity addition
- Real-time balance display

### Position Management
- View all your liquidity positions
- Remove liquidity from positions
- Track position performance
- NFT-based position management

### User Experience
- Tabbed interface for different functions
- Responsive design for mobile and desktop
- Loading states for all operations
- Error handling with user-friendly messages
- Optimistic UI updates
- Token balance display

## Smart Contract Integration

The application integrates with the following BlockX network contracts:

- **Router**: `0x1fd7552F4fED1Be6a8e6d706f5B77B851a5d5F57`
- **WBCX**: `0xb6AB8EB821618033F5FE3763dDb7290cDEE10c24`
- **Factory**: `0x39B1F7E20A86207e03D213e27f3E05f23A662e55`

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Code Quality

- TypeScript with strict mode
- ESLint configuration
- Tailwind CSS for styling
- React hooks best practices
- Proper error boundaries

## Deployment

The application can be deployed to any platform that supports Next.js:

- Vercel (recommended)
- Netlify
- AWS Amplify
- Self-hosted

## License

MIT License