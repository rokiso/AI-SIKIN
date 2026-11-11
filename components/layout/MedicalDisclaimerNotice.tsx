import { ShieldCheck } from "lucide-react";

export function MedicalDisclaimerNotice() {
  return (
    <aside aria-label="서비스 이용 안내" className="break-keep border-t border-neutral-200 bg-surface-muted px-5 py-5 text-xs leading-relaxed text-neutral-600">
      <div className="mb-2 flex items-center gap-2 font-medium text-neutral-700">
        <ShieldCheck aria-hidden="true" size={16} strokeWidth={1.75} />
        일상 스킨케어를 위한 안내
      </div>
      <p>본 서비스의 분석 및 추천 결과는 의료 진단이나 치료를 대체할 수 없으며, 일상 스킨케어 관리를 위한 가이드입니다.</p>
    </aside>
  );
}
