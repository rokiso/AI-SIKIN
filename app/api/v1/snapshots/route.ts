import { NextResponse } from "next/server";
import { privateHeaders, requireSameOrigin } from "@/lib/auth/response";
import { snapshotFailure, requireSnapshotMember, snapshotInput } from "@/lib/snapshot/http";
import { recordSnapshotSchema } from "@/lib/snapshot/types";
import { recordSnapshot, snapshotView } from "@/lib/snapshot/service";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const userId = await requireSnapshotMember();
    const input = await snapshotInput(request, recordSnapshotSchema);
    const result = await recordSnapshot(userId, input);
    const view = await snapshotView(result.row);
    return NextResponse.json(
      { success: true, data: { ...view, userId, s3Key: result.row.s3Key } },
      { status: result.created ? 201 : 200, headers: privateHeaders },
    );
  } catch (error) {
    return snapshotFailure(error);
  }
}
