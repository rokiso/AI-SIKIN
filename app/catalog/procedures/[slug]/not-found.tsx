import Link from "next/link";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import { safetyFailureMessage } from "@/lib/catalog/procedure-safety-types";
export default function NotFound() {
  return (
    <div className="space-y-5 break-keep">
      <h1 className="text-xl font-semibold">시술 정보를 찾을 수 없어요</h1>
      <p role="alert" className="text-sm leading-relaxed">
        {safetyFailureMessage}
      </p>
      <Link href="/catalog/procedures" className="button-primary w-full">
        시술 목록으로 돌아가기
      </Link>
      <MedicalDisclaimerNotice compact />
    </div>
  );
}
