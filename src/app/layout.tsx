import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import * as React from "react";

import "@/app/globals.css";
import { Providers } from "@/app/providers";
import { PremiumShell } from "@/components/layout/premium-shell";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin", "cyrillic-ext"],
  variable: "--font-sans",
  display: "swap"
});

export const metadata: Metadata = {
  title: "ICECREAMMUSIC",
  description: "Премиум-экосистема для артистов: дистрибуция, продвижение, аналитика и AI-инструменты."
  ,
  icons: {
    icon: "/brand/logo.png",
    shortcut: "/brand/logo.png",
    apple: "/brand/logo.png"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning className={plusJakartaSans.variable}>
      <body className={`${plusJakartaSans.className} font-sans text-[19px] font-[550] antialiased`}>
        <Providers>
          <PremiumShell>{children}</PremiumShell>
        </Providers>
      </body>
    </html>
  );
}
