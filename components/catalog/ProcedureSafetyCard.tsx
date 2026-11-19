import type { ProcedureSafetyView } from "@/lib/catalog/procedure-safety-types";
export function ProcedureSafetyCard({ data }: { data: ProcedureSafetyView }) {
  const sections = [
    { title: "나타날 수 있는 반응", rows: data.safetyInfo.commonSideEffects },
    { title: "추가로 확인할 위험", rows: data.safetyInfo.rareRisks },
    { title: "시술 전 의료진에게 알릴 사항", rows: data.safetyInfo.contraindications },
    { title: "시술 후 관리에서 확인할 사항", rows: data.safetyInfo.postCareInstructions },
  ];
  return (
    <section aria-label="시술 위험과 사후 관리" className="space-y-4">
      <h2 className="text-lg font-semibold">부작용 위험과 사후 관리</h2>
      <p className="text-sm leading-relaxed text-neutral-600">
        아래 분류는 발생 빈도나 개인의 안전성을 판정한 결과가 아닙니다. 장비·제품·시술 방법에 따라
        반응이 달라집니다.
      </p>
      {sections.map((section) => (
        <div key={section.title} className="space-y-3 rounded-2xl border border-neutral-200 p-4">
          <h3 className="text-base font-semibold text-neutral-900">{section.title}</h3>
          <ul className="list-outside list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-700">
            {section.rows.map((row) => (
              <li key={row}>{row}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
