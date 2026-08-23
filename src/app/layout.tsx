import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./ui-polish.css";
import "./mobile-polish.css";
import "./mobile-core-workspaces.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PwaLifecycle } from "@/components/pwa/pwa-lifecycle";
import { ClientPerformanceReporter } from "@/components/performance/client-performance-reporter";

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
  themeColor: "#f5f5f7",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const appVersion = process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
  return (
    <html lang="zh-CN">
      <body>
        <TooltipProvider>
          {children}
          <PwaLifecycle currentVersion={appVersion} />
          <ClientPerformanceReporter />
        </TooltipProvider>
      </body>
    </html>
  );
}
