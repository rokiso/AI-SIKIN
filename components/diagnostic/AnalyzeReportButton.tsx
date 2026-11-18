"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { analyzeResponseSchema } from "@/lib/diagnostic/report-types";
const failureSchema = z.object({ error: z.object({ code: z.string() }) });
export function AnalyzeReportButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function analyze() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const abort = new AbortController();
    controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 15_000);
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        const response = await fetch("/api/v1/diagnostics/analyze", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
          signal: abort.signal,
        });
        const body: unknown = await response.json();
        const result = analyzeResponseSchema.safeParse(body);
        if (!response.ok || !result.success) {
          const failure = failureSchema.safeParse(body);
          if (response.status === 429)
            setError("리포트는 1시간에 3회까지 만들 수 있습니다. 잠시 후 다시 시도해 주세요.");
          else if (
            response.status === 401 ||
            response.status === 403 ||
            (failure.success && failure.data.error.code === "SESSION_NOT_FOUND")
          )
            setError(
              "문진 세션을 확인할 수 없습니다. 이 기기에서 저장한 문진인지 확인하고 다시 시작해 주세요.",
            );
          else
            setError(
              "피부 분석을 완료하지 못했습니다. 입력하신 문진 정보는 보관되어 있으니 다시 분석하기를 눌러 주세요.",
            );
          return;
        }
        if (result.data.data.status === "COMPLETED") {
          router.push(`/diagnostic/result/${result.data.data.reportId}`);
          router.refresh();
          return;
        }
        await new Promise<void>((resolve, reject) => {
          const cancel = () => {
            clearTimeout(timer);
            reject(new Error("Analysis cancelled"));
          };
          const timer = setTimeout(() => {
            abort.signal.removeEventListener("abort", cancel);
            resolve();
          }, 1_000);
          abort.signal.addEventListener("abort", cancel, { once: true });
          if (abort.signal.aborted) cancel();
        });
      }
      setError(
        "리포트를 준비하고 있습니다. 잠시 후 다시 분석하기를 누르면 같은 결과를 확인할 수 있어요.",
      );
    } catch {
      setError(
        "피부 분석을 완료하지 못했습니다. 문진 정보는 보관되어 있으니 연결을 확인한 뒤 다시 분석해 주세요.",
      );
    } finally {
      clearTimeout(timeout);
      controller.current = null;
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => void analyze()}
        disabled={busy}
        className="button-primary w-full"
      >
        {busy ? "리포트 준비 중…" : error ? "다시 분석하기" : "피부 리포트 보기"}
      </button>
      {busy && (
        <p role="status" className="text-sm leading-relaxed text-neutral-600">
          문진을 정리하고 리포트를 만들고 있어요. 사진 AI를 이용할 수 없으면 문진 기반 결과로
          안내합니다.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm leading-relaxed text-status-danger">
          {error}
        </p>
      )}
      {error && (
        <Link className="button-secondary w-full" href="/diagnostic">
          처음으로
        </Link>
      )}
    </div>
  );
}
