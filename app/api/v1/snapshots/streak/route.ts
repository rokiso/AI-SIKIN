import { NextResponse } from "next/server";
import { privateHeaders } from "@/lib/auth/response";
import { requireSnapshotMember, snapshotFailure } from "@/lib/snapshot/http";
import { getSnapshotStreak, milestoneQuery } from "@/lib/snapshot/milestone-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const userId = await requireSnapshotMember();
    milestoneQuery(request);
    return NextResponse.json(
      { success: true, data: await getSnapshotStreak(userId) },
      { headers: privateHeaders },
    );
  } catch (error) {
    return snapshotFailure(error);
  }
}
