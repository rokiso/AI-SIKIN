import { NextResponse } from "next/server";
import { privateHeaders } from "@/lib/auth/response";
import { requireSnapshotMember, snapshotFailure } from "@/lib/snapshot/http";
import { getSnapshotMilestone, milestoneQuery } from "@/lib/snapshot/milestone-service";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ milestoneId: string }> }) {
  try {
    const userId = await requireSnapshotMember();
    milestoneQuery(request);
    return NextResponse.json(
      {
        success: true,
        data: await getSnapshotMilestone(userId, (await context.params).milestoneId),
      },
      { headers: privateHeaders },
    );
  } catch (error) {
    return snapshotFailure(error);
  }
}
