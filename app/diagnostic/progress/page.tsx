"use client";
import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { DiagnosticProgressView } from "@/components/diagnostic/DiagnosticProgressView";
function ProgressPage() {
  const params = useSearchParams();
  const router = useRouter();
  const parsed = z
    .uuid()
    .safeParse(params.getAll("sessionId").length === 1 ? params.get("sessionId") : null);
  const valid = parsed.success;
  useEffect(() => {
    if (!valid) router.replace("/diagnostic");
  }, [valid, router]);
  if (!parsed.success) return <p role="status">문진 화면으로 이동합니다.</p>;
  return <DiagnosticProgressView sessionId={parsed.data} />;
}
export default function Page() {
  return (
    <Suspense fallback={<p role="status">분석 진행 화면을 불러오고 있어요.</p>}>
      <ProgressPage />
    </Suspense>
  );
}
