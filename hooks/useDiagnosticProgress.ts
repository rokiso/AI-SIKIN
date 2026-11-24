"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { analyzeResponseSchema } from "@/lib/diagnostic/report-types";
import {
  completeSchema,
  fallbackSchema,
  progressSchema,
  progressErrorSchema,
  type DiagnosticProgress,
} from "@/lib/diagnostic/progress-types";
import { consumeAnalysisIntent } from "@/lib/api/diagnosticProgressIntent";

export function useDiagnosticProgress(sessionId: string) {
  const router = useRouter();
  const [step, setStep] = useState<DiagnosticProgress | null>(null);
  const [phase, setPhase] = useState<
    "CONNECTING" | "RUNNING" | "COMPLETE" | "ERROR" | "RESTART_REQUIRED"
  >("CONNECTING");
  const [photoSkipped, setPhotoSkipped] = useState(false);
  const intent = useRef<{ sessionId: string; allowed: boolean } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const recover = useRef<() => void>(() => {});
  useEffect(() => {
    let disposed = false;
    let completed = false;
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let navigate: ReturnType<typeof setTimeout> | undefined;
    let requestTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    let highestStep = 0;
    let inFlight = false;
    let initialRequestStarted = false;
    let controller: AbortController | undefined;
    if (intent.current?.sessionId !== sessionId)
      intent.current = { sessionId, allowed: consumeAnalysisIntent(sessionId) };
    const shouldStart = intent.current.allowed;
    function stopStream() {
      source?.close();
      clearTimeout(retry);
      clearTimeout(watchdog);
    }
    function fail(message = "분석 진행 상태를 실시간으로 불러오지 못했습니다.") {
      if (disposed || completed) return;
      stopStream();
      setPhase("ERROR");
      setError(message);
    }
    function finish(reportId: string, isFallback: boolean, message?: string) {
      if (disposed || completed) return;
      completed = true;
      stopStream();
      setPhase("COMPLETE");
      setError("");
      if (isFallback)
        setNotice(message ?? "사진 AI를 적용하지 않은 문진 기반 참고 리포트가 준비됐어요.");
      navigate = setTimeout(
        () => {
          if (!disposed) {
            router.replace(`/diagnostic/result/${reportId}`);
            router.refresh();
          }
        },
        isFallback ? 200 : 0,
      );
    }
    async function requestAnalysis() {
      if (disposed || completed || inFlight) return;
      inFlight = true;
      initialRequestStarted = true;
      setBusy(true);
      setError("");
      setPhase("RUNNING");
      controller = new AbortController();
      requestTimer = setTimeout(() => controller?.abort(), 15000);
      try {
        const response = await fetch("/api/v1/diagnostics/analyze", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
          signal: controller.signal,
        });
        const raw: unknown = await response.json();
        if (disposed || completed) return;
        const result = analyzeResponseSchema.safeParse(raw);
        if (!response.ok || !result.success) {
          if (response.status === 400 && raw && typeof raw === "object" && "error" in raw) {
            const details = raw.error;
            if (
              details &&
              typeof details === "object" &&
              "code" in details &&
              details.code === "INCOMPLETE_SURVEY_DATA"
            ) {
              stopStream();
              setNotice("");
              setPhase("RESTART_REQUIRED");
              setError("피부 문진 응답을 확인할 수 없습니다. 문진을 다시 진행해 주세요.");
              return;
            }
          }
          fail(
            response.status === 429
              ? "리포트는 1시간에 3회까지 만들 수 있습니다. 잠시 후 다시 시도해 주세요."
              : [401, 403, 404].includes(response.status)
                ? "문진 세션을 확인할 수 없습니다. 본인의 문진인지 확인하고 다시 시작해 주세요."
                : "피부 분석을 완료하지 못했습니다. 문진 정보는 보관되어 있으니 다시 확인해 주세요.",
          );
          return;
        }
        if (result.data.data.status === "COMPLETED")
          finish(result.data.data.reportId, result.data.data.isFallback);
        else if (!source || source.readyState === EventSource.CLOSED) connect();
      } catch {
        if (!disposed && !completed)
          fail(
            "피부 분석을 완료하지 못했습니다. 연결을 확인하고 리포트 생성 상태를 다시 확인해 주세요.",
          );
      } finally {
        clearTimeout(requestTimer);
        inFlight = false;
        if (!disposed) setBusy(false);
      }
    }
    function receive(event: Event, kind: "progress" | "complete" | "fallback" | "error") {
      if (disposed || completed || !(event instanceof MessageEvent)) return;
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        fail();
        return;
      }
      if (kind === "progress") {
        const value = progressSchema.safeParse(raw);
        if (!value.success) {
          fail();
          return;
        }
        if (value.data.stepNumber < highestStep) return;
        highestStep = value.data.stepNumber;
        setPhase("RUNNING");
        if (value.data.stepNumber === 1) setPhotoSkipped(value.data.skipped);
        setStep(value.data);
      } else if (kind === "complete") {
        const value = completeSchema.safeParse(raw);
        if (!value.success) {
          fail();
          return;
        }
        finish(value.data.reportId, value.data.isFallback);
      } else if (kind === "fallback") {
        const value = fallbackSchema.safeParse(raw);
        if (!value.success) {
          fail();
          return;
        }
        finish(value.data.reportId, true, value.data.message);
      } else {
        const value = progressErrorSchema.safeParse(raw);
        fail(
          value.success && value.data.code === "ANALYSIS_STILL_PENDING"
            ? "리포트 준비가 끝나지 않았습니다. 잠시 후 생성 상태를 다시 확인해 주세요."
            : undefined,
        );
      }
    }
    function connect() {
      if (disposed || completed) return;
      source?.close();
      clearTimeout(watchdog);
      if (typeof EventSource === "undefined") {
        fail();
        if (shouldStart && !initialRequestStarted) void requestAnalysis();
        return;
      }
      source = new EventSource(`/api/v1/diagnostics/progress/${sessionId}`);
      source.onopen = () => {
        if (disposed || completed) return;
        setPhase("RUNNING");
        if (shouldStart && !initialRequestStarted) void requestAnalysis();
      };
      source.addEventListener("progress", (event) => receive(event, "progress"));
      source.addEventListener("complete", (event) => receive(event, "complete"));
      source.addEventListener("fallback", (event) => receive(event, "fallback"));
      source.onerror = (event) => {
        if (event instanceof MessageEvent) {
          receive(event, "error");
          return;
        }
        source?.close();
        if (disposed || completed) return;
        setNotice("실시간 연결이 끊겨 상태를 다시 확인하고 있어요.");
        if (shouldStart && !initialRequestStarted) void requestAnalysis();
        if (attempts++ < 2) retry = setTimeout(connect, 1000);
        else fail();
      };
      watchdog = setTimeout(() => fail(), 14000);
    }
    recover.current = () => {
      if (inFlight || disposed || completed) return;
      attempts = 0;
      setNotice("");
      connect();
      void requestAnalysis();
    };
    connect();
    return () => {
      disposed = true;
      stopStream();
      clearTimeout(navigate);
      clearTimeout(requestTimer);
      controller?.abort();
      recover.current = () => {};
    };
  }, [router, sessionId]);
  const checkStatus = useCallback(() => recover.current(), []);
  return { step, phase, notice, error, busy, photoSkipped, checkStatus };
}
