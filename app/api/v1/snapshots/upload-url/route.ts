import { NextResponse } from "next/server";
import { privateHeaders, requireSameOrigin } from "@/lib/auth/response";
import { snapshotFailure, requireSnapshotMember, snapshotInput } from "@/lib/snapshot/http";
import { uploadFileSchema } from "@/lib/snapshot/types";
import { issueSnapshotUpload } from "@/lib/snapshot/service";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const user = await requireSnapshotMember();
    const input = await snapshotInput(request, uploadFileSchema);
    return NextResponse.json(
      { success: true, data: await issueSnapshotUpload(user, input) },
      { status: 201, headers: privateHeaders },
    );
  } catch (error) {
    return snapshotFailure(error);
  }
}
