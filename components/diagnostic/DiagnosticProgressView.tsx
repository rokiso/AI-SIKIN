"use client";
import Link from "next/link";
import { Check, LoaderCircle } from "lucide-react";
import { useDiagnosticProgress } from "@/hooks/useDiagnosticProgress";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
const steps = ["사진 참고 정보 확인", "문진 응답 정리·결합", "리포트와 성분 안내 저장"];
export function DiagnosticProgressView({ sessionId }: { sessionId: string }) {
  const { step, phase, notice, error, busy, photoSkipped, checkStatus } =
    useDiagnosticProgress(sessionId);
  const number = phase === "COMPLETE" ? 4 : (step?.stepNumber ?? 0);
  return (
    <div className="space-y-6 break-keep [overflow-wrap:anywhere]">
      <header className="space-y-3">
        <p className="text-sm font-medium text-primary-700">나의 피부 리포트</p>
        <h1 className="text-2xl font-bold leading-snug">피부 리포트를 준비하고 있어요</h1>
        <p className="text-sm leading-relaxed text-neutral-600">
          서버에서 확인한 처리 단계를 안내합니다. 사진 AI를 이용할 수 없으면 문진 기반 결과로
          전환해요.
        </p>
      </header>
      <ol aria-label="리포트 준비 단계" className="space-y-3">
        {steps.map((title, index) => (
          <li
            key={title}
            aria-current={number === index + 1 ? "step" : undefined}
            className={`flex items-start gap-3 rounded-xl border p-4 ${number === index + 1 ? "border-primary-700 bg-primary-50" : "border-neutral-200 bg-surface"}`}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold text-primary-800"
              aria-hidden="true"
            >
              {number > index + 1 ? (
                <Check size={18} />
              ) : number === index + 1 && phase !== "ERROR" ? (
                <LoaderCircle size={18} className="motion-safe:animate-spin" />
              ) : (
                index + 1
              )}
            </span>
            <div>
              <p className="text-sm font-semibold text-neutral-900">{title}</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-600">
                {index === 0 && photoSkipped
                  ? "사진 AI 미적용 · 문진만 사용"
                  : number > index + 1
                    ? "처리 확인"
                    : number === index + 1
                      ? "처리 중"
                      : "대기 중"}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <div>
        <progress
          value={phase === "COMPLETE" ? 100 : (step?.progressPercent ?? 0)}
          max={100}
          aria-label="리포트 준비 단계 진행률"
          className="h-2 w-full accent-primary-700"
        />
        <p className="mt-2 text-xs leading-relaxed text-neutral-600">
          진행률은 처리 단계를 뜻하며, 남은 시간이나 분석 정확도를 뜻하지 않습니다.
        </p>
      </div>
      <p role="status" aria-live="polite" className="text-sm leading-relaxed text-neutral-700">
        {phase === "COMPLETE"
          ? "저장된 리포트로 이동합니다."
          : phase === "CONNECTING"
            ? "서버의 처리 상태에 연결하고 있어요."
            : (step?.message ??
              (busy
                ? "문진을 정리하고 리포트 생성 상태를 확인하고 있어요."
                : "서버의 저장 상태를 확인하고 있어요. 아직 분석을 시작하지 않았다면 아래 버튼을 눌러 주세요."))}
      </p>
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm leading-relaxed text-primary-800"
        >
          {notice}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="space-y-3 rounded-xl bg-status-danger-surface p-4 text-sm leading-relaxed text-status-danger"
        >
          <p>{error}</p>
          <p>
            리포트는 서버에서 계속 준비될 수 있어요. 같은 문진으로 다시 확인하면 이미 저장된 결과를
            보여드립니다.
          </p>
        </div>
      )}
      {phase !== "COMPLETE" && (
        <button
          type="button"
          className="button-primary w-full"
          onClick={checkStatus}
          disabled={busy}
        >
          {busy ? "리포트 준비 중…" : "리포트 생성 상태 확인하기"}
        </button>
      )}
      {phase !== "COMPLETE" && (
        <p className="text-xs leading-relaxed text-neutral-600">
          저장된 결과가 있으면 다시 보여드리고, 없으면 이 문진으로 리포트를 준비합니다.
        </p>
      )}
      <Link href="/diagnostic" className="button-secondary w-full">
        문진 화면으로
      </Link>
      <MedicalDisclaimerNotice compact />
    </div>
  );
}
