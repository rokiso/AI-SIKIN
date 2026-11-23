"use client";
import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { procedureSafetyRoutes } from "@/lib/catalog/procedure-safety-types";
import {
  concernLabels,
  concernSchema,
  procedureFailureMessage,
  procedureListResponseSchema,
  type ProcedureConcern,
  type ProcedureView,
} from "@/lib/catalog/procedures";
import { ProcedurePrice } from "./ProcedurePrice";
import { ProcedureDetailModal } from "./ProcedureDetailModal";
export function ProcedureSkeletons() {
  return (
    <div role="status" className="space-y-3">
      <span className="sr-only">시술 가이드를 불러오는 중입니다.</span>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-40 animate-pulse rounded-2xl bg-surface-muted motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
export function ProcedureGuide({ initialData }: { initialData: ProcedureView[] | null }) {
  const query = useSearchParams();
  const selected = concernSchema.safeParse(query.get("concern"));
  const concern = selected.success ? selected.data : null;
  const invalid =
    query.has("concern") && (!selected.success || query.getAll("concern").length !== 1);
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [id, setId] = useState<string | null>(null);
  function filter(value: ProcedureConcern | null) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("concern", value);
    else url.searchParams.delete("concern");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }
  async function retry() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const response = await fetch("/api/v1/catalog/procedures", { cache: "no-store" });
      if (!response.ok) throw new Error("Catalog unavailable");
      setData(procedureListResponseSchema.parse(await response.json()).data.procedures);
    } catch {
      setData(null);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const active = invalid ? null : concern;
  const rows = data?.filter((row) => !active || row.concernType === active);
  const filters: { value: ProcedureConcern | null; label: string }[] = [
    { value: null, label: "전체" },
    ...concernSchema.options.map((value) => ({ value, label: concernLabels[value] })),
  ];
  return (
    <section aria-labelledby="procedure-list-heading" className="mt-6 space-y-5">
      <h2 id="procedure-list-heading" className="text-base font-semibold">
        피부 고민별 시술 가이드
      </h2>
      <div role="group" aria-label="피부 고민 필터" className="flex flex-wrap gap-2">
        {filters.map(({ value, label }) => (
          <button
            key={value ?? "ALL"}
            type="button"
            aria-pressed={active === value}
            onClick={() => filter(value)}
            className={`min-h-11 rounded-full border px-4 py-2 text-sm font-medium ${active === value ? "border-primary-700 bg-primary-700 text-surface" : "border-neutral-300 bg-surface text-neutral-700"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {invalid && (
        <p role="status" className="text-sm text-neutral-700">
          알 수 없는 피부 고민 필터입니다. 전체 시술을 표시합니다.
        </p>
      )}
      {busy ? (
        <ProcedureSkeletons />
      ) : !rows ? (
        <div role="alert" className="space-y-4 rounded-2xl bg-surface-muted p-5">
          <p className="text-sm leading-relaxed">{procedureFailureMessage}</p>
          <button type="button" className="button-secondary" onClick={retry}>
            다시 시도
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="space-y-4 rounded-2xl bg-surface-muted p-5">
          <p className="text-sm leading-relaxed">
            선택한 피부 고민에 해당하는 표준 시술 정보가 없습니다.
          </p>
          <button type="button" className="button-secondary" onClick={() => filter(null)}>
            전체 시술 보기
          </button>
        </div>
      ) : (
        <>
          <p role="status" className="text-sm text-neutral-600">
            {rows.length}종의 시술 · 일반 정보 안내
          </p>
          <ul className="space-y-3">
            {rows.map((procedure) => (
              <li
                key={procedure.id}
                className="relative space-y-4 rounded-2xl border border-neutral-200 bg-surface p-5"
              >
                <div>
                  <p className="text-xs font-medium text-primary-800">{procedure.concernLabelKo}</p>
                  <h3 className="mt-2 text-base font-semibold text-neutral-900">
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center justify-between gap-3 text-left after:absolute after:inset-0 after:rounded-2xl focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-4 focus-visible:after:outline-primary-700"
                      onClick={() => setId(procedure.id)}
                      aria-label={`${procedure.nameKo} 상세 보기`}
                    >
                      <span>{procedure.nameKo}</span>
                      <ArrowUpRight
                        aria-hidden="true"
                        size={20}
                        strokeWidth={1.75}
                        className="shrink-0 text-neutral-600"
                      />
                    </button>
                  </h3>
                </div>
                <ProcedurePrice procedure={procedure} />
                <p className="border-t border-neutral-200 pt-3 text-xs leading-relaxed text-neutral-600">
                  간격은 피부 회복 상태에 따라 상담이 필요해요.
                </p>
                {procedure.safetyDetailAvailable &&
                  procedureSafetyRoutes.find((route) => route.code === procedure.code) && (
                    <Link
                      href={`/catalog/procedures/${procedureSafetyRoutes.find((route) => route.code === procedure.code)?.slug}`}
                      prefetch={false}
                      className="button-secondary relative z-10 w-full"
                    >
                      부작용·사후 관리와 상담 질문
                    </Link>
                  )}
              </li>
            ))}
          </ul>
        </>
      )}
      {id && <ProcedureDetailModal key={id} id={id} close={() => setId(null)} />}
    </section>
  );
}
