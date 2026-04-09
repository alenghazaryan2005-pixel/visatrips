/** @type {import('next').NextConfig} */
const nextConfig = {
  // Output standalone for better Vercel compatibility
  output: 'standalone',
  // Allow uploaded images
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
};

module.exports = nextConfig;
