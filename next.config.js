/** @type {import('next').NextConfig} */
const nextConfig = {
 
  // Use webpack for development and production to avoid turbopack conflicts
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    }
    return config
  },
  // Disable turbopack to use webpack consistently
  experimental: {
    turbo: false,
  },
}

module.exports = nextConfig
