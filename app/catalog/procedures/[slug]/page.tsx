import Link from "next/link";
import { headers } from "next/headers";
import { notFound, unstable_rethrow } from "next/navigation";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import { ProcedurePrice } from "@/components/catalog/ProcedurePrice";
import { ProcedureSafetyCard } from "@/components/catalog/ProcedureSafetyCard";
import { DefenseQuestionList } from "@/components/catalog/DefenseQuestionList";
import { ProcedureSafetyUnavailable } from "@/components/catalog/ProcedureSafetyUnavailable";
import { getProcedureSafetyGuide } from "@/lib/catalog/procedure-safety-service";
import { isProcedureSafetyEnabled } from "@/lib/server-env";
import {
  enforceSafetyRateLimit,
  SafetyRateLimitError,
} from "@/lib/catalog/procedure-safety-rate-limit";
import {
  procedureSafetyRoutes,
  type ProcedureSafetyView,
} from "@/lib/catalog/procedure-safety-types";
export const dynamic = "force-dynamic";
export const metadata = { title: "시술 위험과 상담 준비" };
export default async function ProcedureSafetyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!procedureSafetyRoutes.some((route) => route.slug === slug)) notFound();
  if (!isProcedureSafetyEnabled())
    return (
      <div className="space-y-6 break-keep">
        <ProcedureSafetyUnavailable message="시술 상세 안내를 준비하고 있습니다. 시술 목록의 기본 안내를 이용해 주세요." />
        <MedicalDisclaimerNotice compact />
      </div>
    );
  let data: ProcedureSafetyView | null = null;
  let message: string | undefined;
  try {
    await enforceSafetyRateLimit(await headers());
    data = await getProcedureSafetyGuide(slug);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof SafetyRateLimitError) message = error.message;
    else console.error("[procedure-safety] Detail unavailable");
  }
  if (!data)
    return (
      <div className="space-y-6 break-keep">
        <ProcedureSafetyUnavailable message={message} />
        <MedicalDisclaimerNotice compact />
      </div>
    );
  if (data.readiness === "PREPARING")
    return (
      <div className="space-y-6 break-keep">
        <ProcedureSafetyUnavailable empty />
        <MedicalDisclaimerNotice compact />
      </div>
    );
  return (
    <div className="space-y-6 break-keep [overflow-wrap:break-word]">
      <Link href="/catalog/procedures" className="button-secondary">
        시술 목록으로 돌아가기
      </Link>
      <header className="space-y-3">
        <p className="text-sm font-medium text-primary-800">{data.concernLabelKo} · 일반 정보</p>
        <h1 className="text-2xl font-bold text-neutral-900">{data.procedureName}</h1>
        <p className="text-sm leading-relaxed text-neutral-600">
          위험과 관리 방법을 확인하고, 필요한 질문을 준비해요.
        </p>
      </header>
      <div className="rounded-2xl bg-surface-muted p-4">
        <ProcedurePrice
          detail
          procedure={{
            priceMinKrw: data.marketPriceBand.minPrice,
            priceMaxKrw: data.marketPriceBand.maxPrice,
            priceSummary: data.priceSummary,
          }}
        />
      </div>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">작용 원리와 적용 범위</h2>
        <p className="text-sm leading-relaxed text-neutral-700">{data.scientificPrinciple}</p>
        <p className="text-sm leading-relaxed text-neutral-600">
          피부 고민 태그는 개인의 적응증 판정이 아닙니다. 내 상태에 필요한 시술인지는 진료에서
          확인해 주세요.
        </p>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">다음 시술과 회복 시점</h2>
        <p className="text-sm leading-relaxed text-neutral-700">{data.recommendedInterval}</p>
        <p className="text-sm leading-relaxed text-neutral-700">{data.recoveryPeriod}</p>
      </section>
      <ProcedureSafetyCard data={data} />
      <DefenseQuestionList data={data} />
      <p className="text-xs leading-relaxed text-neutral-600">{data.disclaimerText}</p>
      <MedicalDisclaimerNotice compact />
    </div>
  );
}
