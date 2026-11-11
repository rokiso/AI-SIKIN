"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BottomTabBar } from "./BottomTabBar";
import { ConnectivityNotice } from "./ConnectivityNotice";
import { GlobalHeader } from "./GlobalHeader";
import { MedicalDisclaimerNotice } from "./MedicalDisclaimerNotice";
import { SystemReadiness } from "@/components/system/SystemReadiness";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const fullscreen = pathname.startsWith("/diagnostic/");
  return (
    <div id="app-shell" data-testid="app-shell" className={`mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col bg-surface shadow-shell ${fullscreen ? "" : "pb-[calc(4.5rem+env(safe-area-inset-bottom))]"}`}>
      <a href="#main-content" className="skip-link">본문으로 바로가기</a>
      <GlobalHeader />
      <ConnectivityNotice />
      <main id="main-content" tabIndex={-1} className="flex-1 break-keep px-4 pb-8 pt-7 focus-visible:outline-none"><SystemReadiness />{children}</main>
      <MedicalDisclaimerNotice />
      {!fullscreen && <BottomTabBar />}
    </div>
  );
}
