import "server-only";
import type { VerifiedIdentity } from "@/lib/session/identity-types";
export class UploadError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type UploadOwner = Exclude<VerifiedIdentity, { kind: "anonymous" }>;
