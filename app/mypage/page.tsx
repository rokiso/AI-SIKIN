import Link from "next/link";
import { ArrowRight, UserRound } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeading } from "@/components/ui/PageHeading";
import { getAppUserSession } from "@/lib/session/server";

export default async function MyPage() {
  const session = await getAppUserSession();
  return (
    <div className="space-y-6 break-keep">
      <PageHeading eyebrow="마이페이지" title="나의 피부 관리 모아보기" description="피부 분석 결과와 매일의 기록을 한곳에서 돌아보는 공간이에요." />
      <section className="rounded-2xl bg-surface-muted p-5">
        <UserRound aria-hidden="true" strokeWidth={1.75} className="mb-3 h-6 w-6 text-primary-700" />
        <h2 className="text-lg font-semibold text-neutral-900">{session.isAuthenticated ? `${session.nickname ?? "회원"}님, 반가워요` : "게스트로 둘러보고 있어요"}</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">{session.isAuthenticated ? "저장한 피부 분석 결과와 일상 관리 기록을 확인해 보세요." : "로그인하면 분석 결과와 일상 관리 기록을 보관할 수 있어요. 소셜 로그인 기능은 준비 중이에요."}</p>
      </section>
      <EmptyState />
      <Link href="/snapshot" className="button-secondary flex justify-between">데일리 기록 안내<ArrowRight aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 shrink-0" /></Link>
    </div>
  );
}
