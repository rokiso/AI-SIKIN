import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SessionProvider } from "@/components/session/SessionProvider";
import { getAppUserSession } from "@/lib/session/server";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import "@fontsource-variable/noto-sans-kr";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "미루비아 MIRUVIA | 내 피부를 비추고 나만의 관리 방향을 찾다", template: "%s | MIRUVIA" },
  description: "내 피부를 비추고 나만의 관리 방향을 찾다. MIRUVIA — Reflect your skin. Find your way.",
  applicationName: "MIRUVIA",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "미루비아", statusBarStyle: "default" },
  // Next.js 16 emits the standard mobile tag; keep the legacy iOS tag too.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [{ url: "/icons/skin-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/skin-192.png", sizes: "192x192", type: "image/png" }],
  },
};

// Keep pinch zoom available. Disabling zoom conflicts with WCAG accessibility.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#047857" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await getAppUserSession();
  return (
    <html lang="ko">
      <body>
        <SessionProvider session={session}><AppShell><ServiceWorkerRegistration />{children}</AppShell></SessionProvider>
      </body>
    </html>
  );
}
