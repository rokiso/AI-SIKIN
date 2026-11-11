import { handleUpload } from "@/lib/diagnostic/upload-handler";
import { uploadCompleteSchema } from "@/lib/diagnostic/upload-validation";
import { completeUpload } from "@/lib/diagnostic/upload-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handleUpload(
    request,
    uploadCompleteSchema,
    "INVALID_UPLOAD_CONFIRMATION",
    200,
    (owner, data) => completeUpload(owner, data.uploadSessionId, data.etag),
  );
}
