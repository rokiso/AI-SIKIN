import { Suspense } from "react";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { DashboardFailure } from "@/components/dashboard/DashboardFailure";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { getDashboardSummary } from "@/lib/dashboard/summary";
import type { DashboardSummary } from "@/lib/dashboard/types";
import { readSessionCookies } from "@/lib/session/identity";

export const dynamic = "force-dynamic";

async function DashboardContent() {
  let summary: DashboardSummary;
  try {
    summary = await getDashboardSummary(readSessionCookies(await cookies()));
  } catch (error) {
    unstable_rethrow(error);
    console.error("[dashboard] Summary rendering failed");
    return <DashboardFailure />;
  }
  return <DashboardView summary={summary} />;
}

export default function HomePage() {
  return <Suspense fallback={<DashboardSkeleton />}><DashboardContent /></Suspense>;
}
