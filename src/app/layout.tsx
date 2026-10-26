import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@fontsource-variable/noto-sans-bengali";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/deutschflow/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DeutschFlow — German Listening Practice",
  description:
    "শোনো, উচ্চারণ শেখো, জার্মান বলো। Type English or Bangla, hear natural German instantly with Bengali-script pronunciation — built for A1 beginners.",
  keywords: [
    "German listening",
    "German pronunciation",
    "Bangla German",
    "Deutsch lernen",
    "A1 German",
    "bengali transliteration",
  ],
  authors: [{ name: "DeutschFlow" }],
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "DeutschFlow",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f2ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1626" },
  ],
};

/**
 * Runs before any paint and before next-themes reads storage:
 *   - migrates the old "glass" Liquid-Glass preference to the new "blue" id,
 *   - drops invalid/outdated values so next-themes falls back to the default,
 *   - never throws in private mode.
 */
const THEME_MIGRATION = `(function(){try{var t=localStorage.getItem("theme");if(t==="glass"){localStorage.setItem("theme","blue");}else if(t&&t!=="light"&&t!=="dark"&&t!=="blue"&&t!=="system"){localStorage.removeItem("theme");}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="bn" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_MIGRATION }} />
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
