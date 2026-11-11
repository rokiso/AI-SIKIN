"use client";

import ErrorBoundary from "./error";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import "@fontsource-variable/noto-sans-kr";
import "./globals.css";

export default function GlobalError() {
  return (
    <html lang="ko"><body>
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[430px] flex-col bg-surface">
        <main className="flex-1 px-4 py-6"><ErrorBoundary /></main>
        <MedicalDisclaimerNotice />
      </div>
    </body></html>
  );
}
