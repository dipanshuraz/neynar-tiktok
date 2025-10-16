import Icons from 'unplugin-icons/webpack';

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.plugins.push(
      Icons({
        compiler: 'jsx',
        jsx: 'react',
      })
    );
    return config;
  },
  // Optimize for responsiveness
  reactStrictMode: true,
  
  // Compiler optimizations
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Performance optimizations
  optimizeFonts: true,
  swcMinify: true,

  // Experimental features for better performance
  experimental: {
    // optimizeCss requires 'critters' package - disabled for now
    // optimizeCss: true,
    optimizePackageImports: ['lucide-react'], // Optimize icon imports
  },

  // Image optimization
  images: {
    domains: ['stream.farcaster.xyz'],
    formats: ['image/webp', 'image/avif'],
  },

  // Headers for better caching and security
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
        ],
      },
    ];
  },
};

export default nextConfig;

