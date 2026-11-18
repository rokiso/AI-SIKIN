import Link from "next/link";
import { ingredientNotes } from "@/lib/diagnostic/baumannMapping";
import { SocialAuthModal } from "@/components/auth/SocialAuthModal";
import type { DiagnosticReportView } from "@/lib/diagnostic/report-types";
import { SkinRadarChart } from "./SkinRadarChart";
export function DiagnosticReportCard({
  report,
  isMember,
}: {
  report: DiagnosticReportView;
  isMember: boolean;
}) {
  return (
    <article className="space-y-6 break-keep [overflow-wrap:anywhere]">
      <header className="space-y-3">
        <p className="text-sm font-medium text-primary-700">나의 피부 리포트</p>
        <h1 className="text-2xl font-bold leading-snug">{report.baumannNameKo}</h1>
        <p className="text-xs text-neutral-600">
          {new Intl.DateTimeFormat("ko-KR", { dateStyle: "long", timeZone: "Asia/Seoul" }).format(
            new Date(report.createdAt),
          )}
        </p>
        <div className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm leading-relaxed text-primary-800">
          <p className="font-semibold">
            {report.source === "QUESTIONNAIRE"
              ? "문진 기반 참고 리포트"
              : report.source === "AI_ASSISTED"
                ? "문진 + 사진 AI 참고 리포트"
                : "이전에 저장한 리포트"}
          </p>
          <p className="mt-2">
            {report.source === "QUESTIONNAIRE"
              ? "사진 AI 분석을 적용하지 않았습니다. 저장된 12문항 응답만으로 계산했어요. 사진 분석이 필요하다면 이용 가능 여부를 확인한 뒤 새 문진을 시작해 주세요."
              : report.source === "AI_ASSISTED"
                ? "문진을 최소 60% 반영하고 사진의 외관 정보를 보조적으로 사용했어요. 실제 피부 상태의 측정값이나 의료 진단은 아닙니다."
                : "분석 방법이 기록되지 않은 기존 결과입니다. 현재 피부 상태와 다를 수 있어요."}
          </p>
        </div>
      </header>
      <section aria-labelledby="report-axes" className="space-y-3">
        <h2 id="report-axes" className="text-lg font-semibold">
          피부 특성 네 가지
        </h2>
        <SkinRadarChart scores={report.axisScores} />
      </section>
      <section aria-labelledby="report-summary" className="space-y-3">
        <h2 id="report-summary" className="text-lg font-semibold">
          관리 방향
        </h2>
        <p className="text-sm leading-relaxed text-neutral-700">{report.summary}</p>
      </section>
      <section aria-labelledby="report-ingredients" className="space-y-4">
        <h2 id="report-ingredients" className="text-lg font-semibold">
          성분을 고를 때
        </h2>
        <div className="rounded-2xl border border-neutral-200 p-4">
          <h3 className="font-semibold text-primary-800">살펴볼 성분</h3>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600">
            보습과 일상 관리에 참고하세요. 농도와 제형에 따라 반응은 달라질 수 있어요.
          </p>
          <ul className="mt-3 space-y-3">
            {report.recommendedIngredients.map((name) => (
              <li
                key={name}
                className="rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-800"
              >
                <span className="font-semibold">{name}</span>
                <p className="mt-1 text-xs leading-relaxed">
                  {ingredientNotes[name] ??
                    "배합 농도와 제형에 따라 반응이 달라질 수 있으니 제품 표시를 확인해 주세요."}
                </p>
              </li>
            ))}
          </ul>
          {!report.recommendedIngredients.length && (
            <p className="mt-3 text-sm">
              별도로 제안된 성분이 없습니다. 보습과 자외선 차단부터 살펴보세요.
            </p>
          )}
        </div>
        <div className="rounded-2xl border border-neutral-200 p-4">
          <h3 className="font-semibold">주의해서 살펴볼 성분</h3>
          <p className="mt-2 text-xs leading-relaxed text-neutral-600">
            모두에게 해로운 성분이라는 뜻은 아닙니다. 자극 경험이 있다면 성분표를 확인하고 좁은
            부위에 먼저 사용해 보세요.
          </p>
          <ul className="mt-3 space-y-2 text-sm text-neutral-700">
            {report.cautionIngredients.map((name) => (
              <li key={name}>
                <span className="font-semibold">{name}</span>
                <p className="mt-1 text-xs leading-relaxed">
                  {ingredientNotes[name] ??
                    "자극 경험이 있다면 성분표를 확인하고 사용 전 좁은 부위에서 먼저 확인해 주세요."}
                </p>
              </li>
            ))}
          </ul>
          {!report.cautionIngredients.length && (
            <p className="mt-3 text-sm text-neutral-700">
              별도로 표시된 주의 성분은 없습니다. 개인의 알레르기와 사용 경험을 우선해 주세요.
            </p>
          )}
        </div>
      </section>
      <div className="space-y-3">
        <Link className="button-primary w-full" href="/catalog/products">
          맞춤 화장품 추천 보러가기
        </Link>
        {isMember ? (
          <Link className="button-secondary w-full" href="/mypage">
            보관함에서 확인하기
          </Link>
        ) : (
          <div className="rounded-xl bg-surface-muted p-4 text-sm leading-relaxed">
            <p>이 기기에서 리포트를 다시 볼 수 있어요. 계정에 보관하려면 로그인해 주세요.</p>
            <SocialAuthModal />
          </div>
        )}
        <Link className="button-secondary w-full" href="/diagnostic">
          새 문진 시작하기
        </Link>
      </div>
    </article>
  );
}
