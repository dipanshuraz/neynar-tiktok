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
  other: {
    'apple-mobile-web-app-capable': 'yes',
    'apple-mobile-web-app-status-bar-style': 'black-translucent',
    'apple-mobile-web-app-title': 'Farcaster Feed',
    'mobile-web-app-capable': 'yes',
    'format-detection': 'telephone=no',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.variable} font-sans h-full overflow-hidden antialiased`}>
        {children}
      </body>
    </html>
  );
}