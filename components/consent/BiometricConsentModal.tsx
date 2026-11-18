"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { z } from "zod";
import {
  consentStatusSchema,
  consentTermsSchema,
  type ConsentTerms,
  type ConsentStatus,
} from "@/lib/consent/types";

export function useBiometricConsent() {
  const dialog = useRef<HTMLDialogElement>(null);
  const resolver = useRef<((allowed: boolean) => void) | null>(null);
  const request = useRef<AbortController | null>(null);
  const active = useRef(true);
  const origin = useRef<Element | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [terms, setTerms] = useState<ConsentTerms | null>(null);
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const finish = useCallback((allowed: boolean) => {
    resolver.current?.(allowed);
    resolver.current = null;
    if (!active.current) return;
    setOpen(false);
    setChecking(false);
    setSubmitting(false);
    setChecked(false);
    dialog.current?.close();
    if (origin.current instanceof HTMLElement && origin.current.isConnected) origin.current.focus();
  }, []);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      request.current?.abort();
      resolver.current?.(false);
      resolver.current = null;
    };
  }, []);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
  }, [open]);
  const load = useCallback(async () => {
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(), 10000);
    if (active.current) {
      setChecking(true);
      setError("");
      setChecked(false);
      setTerms(null);
    }
    try {
      const response = await fetch("/api/v1/consents/status", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const body: unknown = await response.json();
      const parsed = z
        .object({ success: z.literal(true), data: consentStatusSchema })
        .safeParse(body);
      if (!active.current) return;
      if (response.ok && parsed.success) {
        if (parsed.data.data.hasValidConsent) {
          finish(true);
          return;
        }
        setStatus(parsed.data.data);
      } else if (response.status !== 404) throw new Error("Consent status unavailable");
      const termsResponse = await fetch("/api/v1/consents/terms/latest", {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const current = z
        .object({ success: z.literal(true), data: consentTermsSchema })
        .safeParse(await termsResponse.json());
      if (!active.current) return;
      setOpen(true);
      if (termsResponse.status === 404) {
        setError("사진 서비스의 동의 약관을 준비하고 있습니다. 지금은 문진만 이용해 주세요.");
        return;
      }
      if (!termsResponse.ok || !current.success) throw new Error("Consent terms unavailable");
      setTerms(current.data.data);
    } catch {
      if (active.current) {
        setOpen(true);
        setError("동의 상태를 확인하지 못했습니다. 다시 확인하거나 문진만 이용해 주세요.");
      }
    } finally {
      clearTimeout(timer);
      if (active.current) setChecking(false);
    }
  }, [finish]);
  const requestConsent = useCallback((): Promise<boolean> => {
    if (resolver.current) return Promise.resolve(false);
    origin.current = document.activeElement;
    return new Promise((resolve) => {
      resolver.current = resolve;
      void load();
    });
  }, [load]);
  async function submit() {
    if (!terms || !checked || submitting) return;
    setSubmitting(true);
    setError("");
    const controller = new AbortController();
    request.current = controller;
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch("/api/v1/consents", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          consentType: "BIOMETRIC_FACE_DATA",
          termsVersion: terms.version,
          isAgreed: true,
        }),
      });
      const raw: unknown = await response.json();
      if (!active.current) return;
      if (response.status === 409) {
        await load();
        if (active.current)
          setError("약관이 갱신되었습니다. 바뀐 내용을 확인하고 다시 동의해 주세요.");
        return;
      }
      const result = z
        .object({
          success: z.literal(true),
          data: z.object({ consentId: z.uuid(), version: z.string(), isAgreed: z.literal(true) }),
        })
        .safeParse(raw);
      if (!response.ok || !result.success || result.data.data.version !== terms.version)
        throw new Error("Consent write unavailable");
      finish(true);
    } catch {
      if (active.current) setError("동의 처리 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      clearTimeout(timer);
      if (active.current) setSubmitting(false);
    }
  }
  const modal = (
    <dialog
      ref={dialog}
      aria-labelledby="biometric-consent-title"
      aria-describedby="biometric-consent-purpose"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) finish(false);
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-[430px] space-y-4 overflow-y-auto rounded-2xl bg-surface p-5 text-neutral-900 backdrop:bg-neutral-900/40 break-keep [overflow-wrap:anywhere]"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="biometric-consent-title" className="text-lg font-semibold leading-relaxed">
          민감정보(안면 사진) 수집·이용 동의
        </h2>
        <button
          type="button"
          aria-label="동의 창 닫기"
          className="icon-button shrink-0"
          disabled={submitting}
          onClick={() => finish(false)}
        >
          <X size={22} aria-hidden="true" />
        </button>
      </div>
      <p id="biometric-consent-purpose" className="text-sm leading-relaxed text-neutral-600">
        사진 기능을 쓰기 전에 수집 목적과 보관·삭제 안내를 확인해 주세요. 거부해도 문진만 이용할 수
        있습니다.
      </p>
      {checking && (
        <p role="status" className="text-sm text-neutral-600">
          최신 약관과 동의 상태를 확인하고 있어요.
        </p>
      )}
      {status?.requiresReconsent && terms && (
        <p className="rounded-xl bg-primary-50 p-3 text-sm leading-relaxed text-primary-800">
          약관이 개정({status.consentedVersion} → {terms.version})되어 재동의가 필요합니다.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-status-danger-surface p-3 text-sm leading-relaxed text-status-danger"
        >
          {error}
        </p>
      )}
      {terms && (
        <>
          <p className="text-xs text-neutral-600">
            {terms.version} ·{" "}
            {new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(
              new Date(terms.enactedAt),
            )}{" "}
            시행
          </p>
          <div
            tabIndex={0}
            role="region"
            aria-label="수집·이용 약관 전문"
            className="max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl border border-neutral-200 p-4 text-sm leading-relaxed"
          >
            {terms.contentMarkdown}
          </div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-3 text-sm leading-relaxed">
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => setChecked(event.target.checked)}
              disabled={submitting}
              className="mt-1 h-5 w-5 shrink-0 accent-primary-700"
            />
            <span>[필수] 만 14세 이상이며, 위 민감정보 수집·이용 내용에 동의합니다.</span>
          </label>
          <button
            type="button"
            className="button-primary w-full"
            disabled={!checked || checking || submitting}
            onClick={() => void submit()}
          >
            {submitting && (
              <LoaderCircle
                size={18}
                aria-hidden="true"
                className="mr-2 motion-safe:animate-spin"
              />
            )}
            {submitting ? "동의 저장 중…" : "동의하고 계속하기"}
          </button>
        </>
      )}
      {error && (
        <button
          type="button"
          className="button-secondary w-full"
          disabled={checking || submitting}
          onClick={() => void load()}
        >
          최신 약관 다시 확인
        </button>
      )}
      <button
        type="button"
        className="button-secondary w-full"
        disabled={submitting}
        onClick={() => finish(false)}
      >
        취소하고 문진만 이용하기
      </button>
    </dialog>
  );
  return { requestConsent, checking, modal };
}
