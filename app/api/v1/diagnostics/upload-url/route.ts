import { handleUpload } from "@/lib/diagnostic/upload-handler";
import { uploadFileSchema } from "@/lib/diagnostic/upload-validation";
import { createUpload } from "@/lib/diagnostic/upload-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return handleUpload(request, uploadFileSchema, "INVALID_FILE_SPEC", 201, createUpload);
}
