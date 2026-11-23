"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";
import { procedureSafetyRoutes } from "@/lib/catalog/procedure-safety-types";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import {
  procedureDetailResponseSchema,
  procedureDisclaimer,
  type ProcedureView,
} from "@/lib/catalog/procedures";
import { ChecklistClipboardButton } from "./ChecklistClipboardButton";
import { ProcedurePrice } from "./ProcedurePrice";
export function ProcedureDetailModal({ id, close }: { id: string; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<ProcedureView | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const origin = document.activeElement;
    const node = dialog.current;
    node?.showModal();
    return () => {
      node?.close();
      if (origin instanceof HTMLElement && origin.isConnected) origin.focus();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/catalog/procedures/${encodeURIComponent(id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Procedure unavailable");
        return procedureDetailResponseSchema.parse(await response.json()).data.procedure;
      })
      .then((procedure) => {
        if (!controller.signal.aborted) setData(procedure);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [id, revision]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="procedure-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-[430px] space-y-5 overflow-y-auto break-keep rounded-2xl bg-surface p-4 text-neutral-900 backdrop:bg-neutral-900/40"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 id="procedure-detail-title" className="pt-2 text-lg font-semibold">
          {data?.nameKo ?? "시술 상세 안내"}
        </h2>
        <button
          type="button"
          className="icon-button shrink-0"
          aria-label="시술 상세 닫기"
          onClick={close}
        >
          <X aria-hidden="true" size={22} strokeWidth={1.75} />
        </button>
      </div>
      <MedicalDisclaimerNotice compact />
      <p className="text-xs leading-relaxed text-neutral-600">{procedureDisclaimer}</p>
      {failed ? (
        <div role="alert" className="space-y-3">
          <p>시술 상세 정보를 불러오지 못했습니다. 다시 시도해 주세요.</p>
          <button
            className="button-secondary"
            type="button"
            onClick={() => {
              setFailed(false);
              setRevision((n) => n + 1);
            }}
          >
            다시 시도
          </button>
        </div>
      ) : !data ? (
        <p role="status" className="py-6 text-sm text-neutral-600">
          시술 정보를 불러오는 중입니다.
        </p>
      ) : (
        <>
          <p className="text-sm font-medium text-primary-800">{data.concernLabelKo}</p>
          <ProcedurePrice procedure={data} detail />
          {data.safetyDetailAvailable &&
            procedureSafetyRoutes.find((route) => route.code === data.code) && (
              <Link
                href={`/catalog/procedures/${procedureSafetyRoutes.find((route) => route.code === data.code)?.slug}`}
                prefetch={false}
                className="button-secondary w-full"
              >
                부작용·사후 관리와 상담 질문
              </Link>
            )}
          {[
            ["작용 원리", data.principleDescription],
            ["권장 간격", data.recommendedInterval],
            ["부작용·주의사항", data.sideEffectsWarning],
            ["회복 과정", data.recoveryPeriod],
          ].map(([title, text]) => (
            <section key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-700">{text}</p>
            </section>
          ))}
          <section
            aria-labelledby="consultation-questions-heading"
            className="space-y-4 border-t border-neutral-200 pt-5"
          >
            <h3 id="consultation-questions-heading" className="font-semibold">
              상담에서 확인할 3가지
            </h3>
            <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed text-neutral-700">
              {data.checklistQuestions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ol>
            <ChecklistClipboardButton questions={data.checklistQuestions} />
          </section>
        </>
      )}
    </dialog>
  );
}
