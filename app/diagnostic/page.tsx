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
      <PageHeading eyebrow="피부 진단" title="시작하기 전에 살펴봐요" description="사진 한 장과 12문항의 문진을 함께 살펴보는 피부 관리 가이드를 준비하고 있어요." />
      <section aria-labelledby="preparation-heading" className="rounded-2xl bg-surface-muted p-5">
        <Camera aria-hidden="true" strokeWidth={1.75} className="mb-4 h-7 w-7 text-primary-700" />
        <h2 id="preparation-heading" className="text-lg font-semibold text-neutral-900">편안하게 촬영을 준비해요</h2>
        <ul className="mt-4 space-y-4">{preparations.map((preparation) => (
          <li key={preparation} className="flex gap-3 text-sm leading-relaxed text-neutral-700"><Check aria-hidden="true" strokeWidth={1.75} className="mt-1 h-4 w-4 shrink-0 text-primary-700" /><span>{preparation}</span></li>
        ))}</ul>
      </section>
      <div className="mt-6">
        <p id="diagnostic-availability" className="text-sm leading-relaxed text-neutral-600">사진 촬영과 문진 기능은 아직 준비 중이에요. 카메라 권한은 실제 촬영을 시작할 때 요청해요.</p>
        <button type="button" disabled aria-describedby="diagnostic-availability" className="button-primary mt-4 w-full">문진 시작</button>
      </div>
    </div>
  );
}
