"use client";

import { useEffect, useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";

type RegistrationState = "pending" | "registered" | "failed" | "retrying";

export function ServiceWorkerRegistration() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<RegistrationState>("pending");

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" ||
      !window.isSecureContext ||
      !("serviceWorker" in navigator)
    )
      return;

    let active = true;
    void (async () => {
      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
        if (active) setState("registered");
      } catch {
        // Registration is an optional installation enhancement. A visible
        // retry state keeps this failure separate from the working web app.
        if (active) setState("failed");
      }
    })();
    return () => {
      active = false;
    };
  }, [attempt]);

  if (state === "retrying") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-6 flex items-center gap-3 rounded-xl bg-surface-muted p-4 text-sm leading-relaxed text-neutral-700"
      >
        <LoaderCircle
          aria-hidden="true"
          size={20}
          strokeWidth={1.75}
          className="shrink-0 motion-safe:animate-spin"
        />
        홈 화면 설치를 다시 준비하고 있어요.
      </div>
    );
  }

  if (state !== "failed") return null;

  return (
    <section
      role="alert"
      className="mb-6 rounded-xl border border-neutral-200 bg-status-warning-surface p-4 text-sm leading-relaxed text-status-warning"
    >
      <p className="flex items-start gap-2 font-semibold">
        <CircleAlert aria-hidden="true" size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        홈 화면 설치를 준비하지 못했어요.
      </p>
      <p className="mt-2">
        인터넷 연결을 확인한 후 다시 시도해 주세요. 웹 기능은 계속 이용할 수 있어요.
      </p>
      <button
        type="button"
        className="button-secondary mt-3"
        onClick={() => {
          setState("retrying");
          setAttempt((value) => value + 1);
        }}
      >
        다시 시도
      </button>
    </section>
  );
}
