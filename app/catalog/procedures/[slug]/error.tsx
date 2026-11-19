"use client";
import { MedicalDisclaimerNotice } from "@/components/layout/MedicalDisclaimerNotice";
import { ProcedureSafetyUnavailable } from "@/components/catalog/ProcedureSafetyUnavailable";
export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-5 break-keep">
      <ProcedureSafetyUnavailable onRetry={reset} />
      <MedicalDisclaimerNotice compact />
    </div>
  );
}
