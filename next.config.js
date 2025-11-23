/** @type {import('next').NextConfig} */
const nextConfig = {
  // Serverless-friendly configuration
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

module.exports = nextConfig

