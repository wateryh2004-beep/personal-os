import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const wordmark = Cormorant_Garamond({ variable: "--font-wordmark", subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], display: "swap" });
export const metadata: Metadata = {
  title: "Personal OS",
  description: "A private personal operating system",
  robots: { index: false, follow: false, nocache: true },
  icons: {
    icon: [{ url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f7f5ef",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" className={`${geist.variable} ${mono.variable} ${wordmark.variable}`}><body><TooltipProvider>{children}</TooltipProvider></body></html>;
}
