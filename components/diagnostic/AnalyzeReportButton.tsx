"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markAnalysisIntent } from "@/lib/api/diagnosticProgressIntent";
export function AnalyzeReportButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="button-primary w-full"
      disabled={pending}
      onClick={() =>
        startTransition(() => {
          markAnalysisIntent(sessionId);
          router.push(`/diagnostic/progress?sessionId=${encodeURIComponent(sessionId)}`);
        })
      }
    >
      피부 리포트 보기
    </button>
  );
}
