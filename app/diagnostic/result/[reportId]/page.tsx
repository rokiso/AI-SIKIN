import Link from "next/link";
import { AuthError } from "@/lib/auth/response";
import { requireReportIdentity } from "@/lib/diagnostic/report-http";
import { getDiagnosticReport } from "@/lib/diagnostic/report-store";
import type { DiagnosticReportView } from "@/lib/diagnostic/report-types";
import { DiagnosticReportCard } from "@/components/diagnostic/DiagnosticReportCard";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
export const dynamic = "force-dynamic";
export const metadata = { title: "나의 피부 리포트", robots: { index: false, follow: false } };
export default async function ResultPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  let state: { report: DiagnosticReportView; isMember: boolean } | { error: string };
  try {
    const owner = await requireReportIdentity();
    state = {
      report: await getDiagnosticReport(owner, reportId),
      isMember: owner.kind === "member",
    };
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
    state = { error: error.message };
  }
  if ("error" in state)
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">리포트를 확인할 수 없어요</h1>
        <p role="alert" className="text-sm leading-relaxed text-neutral-700">
          {state.error}
        </p>
        <Link href="/mypage" className="button-secondary w-full">
          보관함으로
        </Link>
        <Link href="/diagnostic" className="button-primary w-full">
          문진 시작하기
        </Link>
        <MedicalDisclaimerNotice compact />
      </div>
    );
  return (
    <div className="space-y-7">
      <DiagnosticReportCard report={state.report} isMember={state.isMember} />
      <MedicalDisclaimerNotice compact />
    </div>
  );
}
