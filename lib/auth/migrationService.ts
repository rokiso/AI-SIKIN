import "server-only";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

const inputSchema = z
  .object({ guestDeviceId: z.uuidv4(), targetUserId: z.string().min(1) })
  .strict();

// Internal only: the caller must verify the signed guest capability and OAuth
// identity, and pass the transaction that provisions the member session.
export async function migrateGuestDataToUser(
  tx: Prisma.TransactionClient,
  params: { guestDeviceId: string; targetUserId: string },
): Promise<{ migratedDiagnosticSessions: number; migratedImageSessions: number }> {
  const { guestDeviceId, targetUserId } = inputSchema.parse(params);
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`guest:${guestDeviceId}`}, 0))::text`;
  const diagnostics = await tx.diagnosticSession.updateMany({
    where: { guestDeviceId, userId: null },
    data: { userId: targetUserId },
  });
  const images = await tx.imageUploadSession.updateMany({
    where: { guestDeviceId, userId: null },
    data: { userId: targetUserId },
  });
  return { migratedDiagnosticSessions: diagnostics.count, migratedImageSessions: images.count };
}
