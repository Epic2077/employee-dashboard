import type { Metadata } from "next";
import { Geist, Geist_Mono, Vazirmatn } from "next/font/google";
import { Toaster } from "sonner";

import "./globals.css";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic"],
  display: "swap",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "همراه | پورتال کارکنان",
  description: "سامانه خدمات و امکانات کارکنان",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`
        ${vazirmatn.variable}
        ${geistSans.variable}
        ${geistMono.variable}
        h-full antialiased
      `}
    >
      <body className="min-h-full flex flex-col font-sans overflow-x-hidden">
        {children}
        <Toaster dir="rtl" position="top-center" richColors />
      </body>
    </html>
  );
}
