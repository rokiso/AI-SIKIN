"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { z } from "zod";

const summarySchema = z.object({
  success: z.literal(true),
  data: z.object({
    diagnostics: z.number().int().nonnegative(),
    snapshots: z.number().int().nonnegative(),
  }),
});
const resultSchema = z.object({
  success: z.literal(true),
  data: z.object({
    deleted: z.literal(true),
    deletedAt: z.iso.datetime(),
    deletedImagesCount: z.number().int().nonnegative(),
  }),
});
const errorSchema = z.object({ success: z.literal(false), error: z.object({ code: z.string() }) });
const deletionErrors: Record<string, string> = {
  ACCOUNT_DELETION_UNAVAILABLE:
    "현재 회원 탈퇴 기능을 사용할 수 없습니다. 잠시 후 다시 확인해 주세요.",
  UPLOAD_LINK_STILL_VALID:
    "최근 사진 업로드 링크가 아직 유효합니다. 업로드 후 최대 16분이 지난 뒤 다시 탈퇴해 주세요.",
  STORAGE_DELETION_FAILED:
    "사진 삭제를 완료하지 못해 계정은 유지되었습니다. 일부 사진은 이미 삭제되었을 수 있습니다. 다시 시도해 주세요.",
  DELETION_OWNERSHIP_CONFLICT:
    "기록의 소유권을 확인해야 합니다. 삭제를 진행하지 않았습니다. 고객 지원에 문의해 주세요.",
  UNAUTHORIZED: "로그인이 만료되었습니다. 다시 로그인한 뒤 탈퇴해 주세요.",
};
function DeletionDialog({ close }: { close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [summary, setSummary] = useState<z.infer<typeof summarySchema>["data"] | null>(null);
  const [summaryError, setSummaryError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [phrase, setPhrase] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [pending, setPending] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
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
    async function load() {
      setSummaryError(false);
      try {
        const response = await fetch("/api/v1/users/me", {
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
        });
        const parsed = summarySchema.safeParse(await response.json());
        if (!response.ok || !parsed.success) throw new Error("Summary unavailable");
        if (!controller.signal.aborted) setSummary(parsed.data.data);
      } catch {
        if (!controller.signal.aborted) setSummaryError(true);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (!deleted) return;
    // Reload the app shell to discard all previous member/session context.
    const timer = setTimeout(() => window.location.replace("/"), 1000);
    return () => clearTimeout(timer);
  }, [deleted]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!summary || phrase !== "탈퇴합니다" || !agreed || lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    let completed = false;
    try {
      const response = await fetch("/api/v1/users/me", {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationPhrase: phrase, agreedToDataLoss: agreed }),
        signal: AbortSignal.timeout(60000),
      });
      const body: unknown = await response.json();
      const parsed = resultSchema.safeParse(body);
      if (response.ok && parsed.success) {
        completed = true;
        setDeleted(true);
        return;
      }
      const failure = errorSchema.safeParse(body);
      setError(
        failure.success && deletionErrors[failure.data.error.code]
          ? deletionErrors[failure.data.error.code]
          : "회원 탈퇴 완료 여부를 확인하지 못했습니다. 일부 사진은 이미 삭제되었을 수 있습니다. 잠시 후 다시 시도해 주세요.",
      );
    } catch {
      setError(
        "회원 탈퇴 완료 여부를 확인하지 못했습니다. 일부 사진은 이미 삭제되었을 수 있습니다. 연결을 확인하고 다시 시도해 주세요.",
      );
    } finally {
      if (!completed) {
        setPending(false);
        lock.current = false;
      }
    }
  }
  const busy = pending || deleted;
  return (
    <dialog
      ref={dialog}
      aria-labelledby="account-deletion-title"
      aria-describedby="account-deletion-warning"
      onCancel={(event) => {
        event.preventDefault();
        if (!lock.current && !deleted) close();
      }}
      className="m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-[430px] space-y-4 overflow-y-auto break-keep rounded-2xl bg-surface p-4 text-neutral-900 backdrop:bg-neutral-900/40"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="account-deletion-title" className="text-lg font-semibold">
          회원 탈퇴
        </h2>
        <button
          type="button"
          className="icon-button shrink-0"
          aria-label="회원 탈퇴 안내 닫기"
          disabled={busy}
          onClick={close}
        >
          <X size={22} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div id="account-deletion-warning" className="space-y-2 text-sm leading-relaxed">
        <p className="font-semibold text-status-danger">탈퇴하면 기록을 복구할 수 없습니다.</p>
        <p>
          계정, 동의 이력, 진단 결과, 데일리 기록과 연결된 원본 사진을 영구 삭제합니다. 사진 삭제가
          확인되어야 탈퇴가 완료됩니다.
        </p>
        <p>
          처리 중 오류가 발생하면 계정은 유지될 수 있지만, 이미 삭제된 사진은 복구되지 않습니다.
        </p>
      </div>
      {summary ? (
        <p className="rounded-xl bg-surface-muted p-3 text-sm">
          삭제 대상: 진단 이력 {summary.diagnostics}건 · 데일리 기록 {summary.snapshots}건
        </p>
      ) : summaryError ? (
        <div role="alert" className="text-sm text-status-danger">
          <p>삭제할 기록 수를 확인하지 못했습니다.</p>
          <button
            type="button"
            className="button-secondary mt-2"
            onClick={() => setRevision((r) => r + 1)}
          >
            기록 수 다시 확인
          </button>
        </div>
      ) : (
        <p role="status" className="text-sm">
          삭제할 기록을 확인하는 중입니다...
        </p>
      )}
      <form className="space-y-4" onSubmit={(event) => void submit(event)}>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0 accent-primary-700"
            checked={agreed}
            disabled={busy}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>[필수] 안내 사항을 모두 확인하였으며, 데이터 영구 삭제에 동의합니다</span>
        </label>
        <label className="block space-y-2 text-sm">
          <span>확인을 위해 ‘탈퇴합니다’를 입력해 주세요.</span>
          <input
            className="min-h-11 w-full rounded-xl border border-neutral-300 bg-surface px-3 py-2"
            autoComplete="off"
            value={phrase}
            disabled={busy}
            onChange={(e) => setPhrase(e.target.value)}
          />
        </label>
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-status-danger-surface p-3 text-sm leading-relaxed text-status-danger"
          >
            {error}
          </p>
        )}
        {busy && (
          <p role="status" className="text-sm leading-relaxed">
            {deleted
              ? "회원 탈퇴가 완료되었습니다. 그동안 서비스를 이용해 주셔서 감사합니다."
              : "개인정보 및 안면 이미지를 영구 삭제하는 중입니다..."}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="button-secondary flex-1" disabled={busy} onClick={close}>
            취소
          </button>
          <button
            type="submit"
            disabled={busy || !summary || !agreed || phrase !== "탈퇴합니다"}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-status-danger px-4 py-3 text-sm font-semibold text-surface disabled:opacity-50"
          >
            {pending && (
              <LoaderCircle
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
                className="motion-safe:animate-spin"
              />
            )}
            {error ? "다시 시도" : "탈퇴 완료"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function AccountDeletionModal() {
  const [open, setOpen] = useState(false);
  return (
    <section className="border-t border-neutral-200 pt-4">
      <button
        type="button"
        className="min-h-11 px-3 py-2 text-sm font-semibold text-status-danger underline underline-offset-4"
        onClick={() => setOpen(true)}
      >
        회원 탈퇴
      </button>
      {open && <DeletionDialog close={() => setOpen(false)} />}
    </section>
  );
}
