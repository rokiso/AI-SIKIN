"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { z } from "zod";

const readyResponse = z.object({
  success: z.literal(true),
  data: z.object({ status: z.literal("pass"), database: z.literal("connected") }),
});

export function SystemReadiness() {
  const [state, setState] = useState<"checking" | "ready" | "failed">("checking");

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/v1/health", {
          cache: "no-store",
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (active)
          setState(response.ok && readyResponse.safeParse(body).success ? "ready" : "failed");
      } catch {
        if (active) setState("failed");
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  if (state === "ready") return null;
  if (state === "checking")
    return (
      <div
        role="status"
        aria-live="polite"
        className="mb-6 flex items-center gap-2 text-sm text-neutral-600"
      >
        <LoaderCircle
          aria-hidden="true"
          size={18}
          strokeWidth={1.75}
          className="motion-safe:animate-spin"
        />
        서비스 연결을 확인하고 있어요.
      </div>
    );
  return (
    <section
      role="alert"
      className="mb-6 rounded-xl border border-neutral-200 bg-status-warning-surface p-4 text-sm leading-relaxed text-status-warning"
    >
      <p className="font-semibold">
        서비스 초기화 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.
      </p>
      <p className="mt-2">연결 상태를 확인한 뒤 페이지를 새로고침해 주세요.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="button-secondary mt-3"
      >
        새로고침
      </button>
    </section>
  );
}
