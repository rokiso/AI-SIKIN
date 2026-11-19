import type { ProcedureSafetyView } from "@/lib/catalog/procedure-safety-types";
import { formatDefenseQuestions } from "@/lib/catalog/procedure-safety-types";
import { ChecklistClipboardButton } from "./ChecklistClipboardButton";
export function DefenseQuestionList({ data }: { data: ProcedureSafetyView }) {
  return (
    <section
      aria-label="상담 전 과잉 진료 방어 질문지"
      className="space-y-4 rounded-2xl border border-primary-200 bg-primary-50 p-4"
    >
      <div>
        <p className="text-xs font-semibold text-primary-800">상담 준비</p>
        <h2 className="mt-2 text-lg font-semibold text-primary-900">
          상담 전 과잉 진료 방어 질문지
        </h2>
      </div>
      <p className="text-sm leading-relaxed text-neutral-700">
        단독 시술과 대안, 이상 반응 시 대응, 정품·수량·총비용을 확인하고 결정하세요. 특정 시술이나
        병원 선택을 권하는 질문지가 아닙니다.
      </p>
      <ol className="space-y-4">
        {data.defenseQuestions.map((question, index) => (
          <li
            key={question.id}
            className="space-y-2 rounded-xl bg-surface p-4 text-sm leading-relaxed"
          >
            <h3 className="font-semibold text-primary-900">
              {index + 1}. {question.category}
            </h3>
            <p className="text-neutral-900">{question.question}</p>
            <p className="text-xs text-neutral-600">확인 이유: {question.reason}</p>
          </li>
        ))}
      </ol>
      <ChecklistClipboardButton
        variant="defense"
        questions={data.defenseQuestions.map((q) => q.question)}
        copyText={formatDefenseQuestions(data.procedureName, data.defenseQuestions)}
      />
    </section>
  );
}
