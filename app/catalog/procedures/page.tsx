import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { PageHeading } from "@/components/ui/PageHeading";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import { ProcedureGuide, ProcedureSkeletons } from "@/components/catalog/ProcedureGuide";
import { getProcedures } from "@/lib/catalog/procedureService";
import { procedureDisclaimer, type ProcedureView } from "@/lib/catalog/procedures";

export const dynamic = "force-dynamic";
async function Catalog() {
  let rows: ProcedureView[] | null;
  try {
    rows = (await getProcedures()).procedures;
  } catch (error) {
    unstable_rethrow(error);
    console.error(
      "[procedures] Page catalog read failed; check database and price observation integrity",
    );
    rows = null;
  }
  return <ProcedureGuide initialData={rows} />;
}
export default function ProceduresPage() {
  return (
    <div className="break-keep">
      <PageHeading
        eyebrow="시술 가이드"
        title="충분히 알아보고 결정해요"
        description="시술의 작용 원리와 주의사항을 알아보고, 상담에서 확인할 질문을 준비해요."
      />
      <MedicalDisclaimerNotice compact />
      <p className="mt-3 text-xs leading-relaxed text-neutral-600">{procedureDisclaimer}</p>
      <Suspense fallback={<ProcedureSkeletons />}>
        <Catalog />
      </Suspense>
    </div>
  );
}
