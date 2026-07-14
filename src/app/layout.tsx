import type { Metadata, Viewport } from "next";
import * as React from "react";

import "@/app/globals.css";
import { Providers } from "@/app/providers";
import { PremiumShell } from "@/components/layout/premium-shell";

export const metadata: Metadata = {
  applicationName: "ICECREAMMUSIC",
  title: "ICECREAMMUSIC",
  description: "Премиум-экосистема для артистов: дистрибуция, продвижение, аналитика и AI-инструменты.",
  manifest: "/manifest.webmanifest",
  formatDetection: {
    telephone: false
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ICM"
  },
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    shortcut: ["/favicon-32x32.png", "/favicon.ico"],
    apple: "/apple-touch-icon.png"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b0f1a",
  colorScheme: "dark"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <meta name="application-name" content="ICECREAMMUSIC" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ICM" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#0b0f1a" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="font-sans text-[19px] font-[550] antialiased">
        <Providers>
          <PremiumShell>{children}</PremiumShell>
        </Providers>
      </body>
    </html>
  );
}
