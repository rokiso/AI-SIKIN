import { DiagnosticPhotoStep } from "@/components/diagnostic/DiagnosticPhotoStep";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import { Camera, Check } from "lucide-react";
import { PageHeading } from "@/components/ui/PageHeading";

const preparations = [
  "얼굴 전체가 고르게 보이는 밝은 곳을 찾아주세요.",
  "필터 없이 카메라를 정면으로 바라봐 주세요.",
  "평소의 피부 상태를 떠올리며 문진에 답해주세요.",
];

export default function DiagnosticPage() {
  return (
    <div className="break-keep">
      <PageHeading eyebrow="피부 진단" title="시작하기 전에 살펴봐요" description="정면 사진을 등록하고 피부 관리 가이드를 준비해 보세요. 12문항 문진은 다음 단계로 연결될 예정이에요." />
      <div className="mb-6"><MedicalDisclaimerNotice compact /></div>
      <section aria-labelledby="preparation-heading" className="rounded-2xl bg-surface-muted p-5">
        <Camera aria-hidden="true" strokeWidth={1.75} className="mb-4 h-7 w-7 text-primary-700" />
        <h2 id="preparation-heading" className="text-lg font-semibold text-neutral-900">편안하게 촬영을 준비해요</h2>
        <ul className="mt-4 space-y-4">{preparations.map((preparation) => (
          <li key={preparation} className="flex gap-3 text-sm leading-relaxed text-neutral-700"><Check aria-hidden="true" strokeWidth={1.75} className="mt-1 h-4 w-4 shrink-0 text-primary-700" /><span>{preparation}</span></li>
        ))}</ul>
      </section>
      <p id="camera-availability" className="mt-6 text-sm leading-relaxed text-neutral-600">카메라 촬영 기능은 준비 중이에요. 지금은 앨범의 사진을 선택할 수 있어요.</p>
      <button type="button" disabled aria-describedby="camera-availability" className="button-secondary mt-3 w-full">카메라로 촬영하기</button>
      <DiagnosticPhotoStep />
    </div>
  );
}
