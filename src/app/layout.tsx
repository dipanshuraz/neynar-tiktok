// src/app/layout.tsx

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Farcaster Video Feed | TikTok-style Vertical Videos',
  description: 'Discover and watch videos from the Farcaster decentralized social network in a beautiful TikTok-style vertical feed.',
  keywords: 'Farcaster, decentralized social, video feed, TikTok, vertical videos, Neynar, Web3',
  authors: [{ name: 'Farcaster Video Feed' }],
  viewport: 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no',
  themeColor: '#000000',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Farcaster Video Feed',
    description: 'TikTok-style vertical video feed for Farcaster content',
    type: 'website',
    images: ['/og-image.jpg'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Farcaster Video Feed',
    description: 'TikTok-style vertical video feed for Farcaster content',
    images: ['/og-image.jpg'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
        <meta name="theme-color" content="#000000" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Farcaster Feed" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="format-detection" content="telephone=no" />
        
        {/* Preconnect to external domains */}
        <link rel="preconnect" href="https://api.neynar.com" />
        <link rel="preconnect" href="https://imagedelivery.net" />
        <link rel="preconnect" href="https://www.youtube.com" />
        <link rel="preconnect" href="https://player.vimeo.com" />
      </head>
      <body className={`${inter.variable} font-sans h-full overflow-hidden antialiased`}>
        {children}
      </body>
    </html>
  );
}