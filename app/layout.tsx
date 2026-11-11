import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { SessionProvider } from "@/components/session/SessionProvider";
import { getAppUserSession } from "@/lib/session/server";
import { ServiceWorkerRegistration } from "@/components/pwa/ServiceWorkerRegistration";
import "@fontsource-variable/noto-sans-kr";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "SIKIN | 내 피부의 기준", template: "%s | SIKIN" },
  description: "내 피부를 이해하고, 나에게 맞는 일상 스킨케어를 알아보세요.",
  applicationName: "SIKIN",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "AI피부맞춤", statusBarStyle: "default" },
  // Next.js 16 emits the standard mobile tag; keep the legacy iOS tag too.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [{ url: "/icons/sikin-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/sikin-192.png", sizes: "192x192", type: "image/png" }],
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
