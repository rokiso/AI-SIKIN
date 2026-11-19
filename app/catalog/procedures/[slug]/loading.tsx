import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
export default function Loading() {
  return (
    <div className="space-y-5 break-keep">
      <div role="status" aria-busy="true" className="space-y-4">
        <p className="text-sm">시술 상세 가이드를 불러오는 중입니다.</p>
        <div
          aria-hidden="true"
          className="h-8 w-2/3 rounded-xl bg-surface-muted motion-safe:animate-pulse"
        />
        {[0, 1, 2].map((i) => (
          <div
            aria-hidden="true"
            key={i}
            className="h-24 rounded-2xl bg-surface-muted motion-safe:animate-pulse"
          />
        ))}
        <button disabled className="button-primary w-full">
          상담 질문지 복사하기
        </button>
      </div>
      <MedicalDisclaimerNotice compact />
    </div>
  );
}
