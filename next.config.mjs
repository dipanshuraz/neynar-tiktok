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
    optimizePackageImports: ['lucide-react', '@iconify/react'], // Optimize icon imports
    // Parallel route segment compilation for faster builds
    webpackBuildWorker: true,
  },
  
  // Production source maps for better debugging (disable for faster builds)
  productionBrowserSourceMaps: false,

  // Image optimization
  images: {
    domains: ['stream.farcaster.xyz'],
    formats: ['image/webp', 'image/avif'],
  },

  // Headers for better caching, compression, and security
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
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
        ],
      },
      // Cache static assets aggressively
      {
        source: '/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Cache images with stale-while-revalidate
      {
        source: '/:all*(svg|jpg|jpeg|png|gif|ico|webp|avif)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
    ];
  },
  
  // Compress responses
  compress: true,
};

export default nextConfig;

