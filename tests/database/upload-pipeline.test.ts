// @vitest-environment node
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { value: jar.get(name)! } : undefined),
  }),
}));
import { POST as issue } from "../../app/api/v1/diagnostics/upload-url/route";
import { POST as complete } from "../../app/api/v1/diagnostics/upload-complete/route";
import { getPrisma } from "../../lib/prisma";
import { getDatabaseUrl } from "../../lib/server-env";
import { assertLocalDevelopmentDatabase } from "../../lib/database-development";
import { createGuestSession, GUEST_PROOF_COOKIE_NAME } from "../../lib/session/guest-proof";
import { GUEST_COOKIE_NAME } from "../../lib/session/guest";

interface StoredObject {
  bytes: Buffer;
  mimeType: string;
  encryption: string;
  etag: string;
}
const objects = new Map<string, StoredObject>();
const db = getPrisma();
const users = new Set<string>();
const guests = new Set<string>();
let endpoint = "";
let headCount = 0;
const image = Buffer.alloc(10_240, 127);
Buffer.from([0xff, 0xd8, 0xff]).copy(image);

// Minimal HTTP storage fixture, not an AWS signature verifier or real bucket-policy test.
async function storage(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (!/^\/test-private-vault\/raw-faces\/[a-f0-9-]+\.jpeg$/.test(url.pathname)) {
    response.writeHead(404).end();
    return;
  }
  if (request.method === "PUT") {
    const signed = url.searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
    if (
      url.searchParams.get("X-Amz-Expires") !== "900" ||
      !/^[a-f0-9]{64}$/.test(url.searchParams.get("X-Amz-Signature") ?? "") ||
      !["content-type", "content-length", "x-amz-server-side-encryption"].every((header) =>
        signed.includes(header),
      ) ||
      request.headers["x-amz-server-side-encryption"] !== "AES256"
    ) {
      response.writeHead(403).end();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const value of request) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      size += chunk.length;
      if (size > 10_485_760) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    const etag = `"${createHash("md5").update(bytes).digest("hex")}"`;
    objects.set(url.pathname, {
      bytes,
      etag,
      mimeType: String(request.headers["content-type"]),
      encryption: "AES256",
    });
    response.writeHead(200, { ETag: etag }).end();
    return;
  }
  if (request.method === "HEAD" && request.headers.authorization?.startsWith("AWS4-HMAC-SHA256 ")) {
    headCount++;
    const object = objects.get(url.pathname);
    if (!object) {
      response.writeHead(404).end();
      return;
    }
    response
      .writeHead(200, {
        ETag: object.etag,
        "content-length": object.bytes.length,
        "content-type": object.mimeType,
        "x-amz-server-side-encryption": object.encryption,
      })
      .end();
    return;
  }
  response.writeHead(403).end();
}
const server = createServer((request, response) => {
  void storage(request, response).catch(() => {
    response.writeHead(500).end();
  });
});
const issuedSchema = z.object({
  success: z.literal(true),
  data: z.object({
    uploadSessionId: z.uuidv4(),
    uploadUrl: z.url(),
    s3Key: z.string(),
    expiresInSeconds: z.literal(900),
  }),
});
const confirmationSchema = z.object({
  success: z.literal(true),
  data: z.object({
    uploadSessionId: z.uuid(),
    status: z.literal("UPLOADED"),
    s3Key: z.string(),
    confirmedAt: z.iso.datetime(),
  }),
});
function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/v1/diagnostics/${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
function guest() {
  const session = createGuestSession();
  guests.add(session.guestDeviceId);
  jar.clear();
  jar.set(GUEST_COOKIE_NAME, session.guestDeviceId);
  jar.set(GUEST_PROOF_COOKIE_NAME, session.proof);
  return session;
}
async function member() {
  const user = await db.user.create({ data: { nickname: "로컬 업로드 계약 검증" } });
  users.add(user.id);
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({
    data: { userId: user.id, sessionToken: token, expiresAt: new Date(Date.now() + 60_000) },
  });
  jar.clear();
  jar.set("app_session_token", token);
  return user;
}
async function issueAndPut() {
  const issued = await issue(
    request("upload-url", { mimeType: "image/jpeg", fileSizeBytes: image.length }),
  );
  expect(issued.status).toBe(201);
  expect(issued.headers.get("cache-control")).toBe("private, no-store");
  const { data } = issuedSchema.parse(await issued.json());
  expect(data.s3Key).toBe(`raw-faces/${data.uploadSessionId}.jpeg`);
  const put = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": "image/jpeg",
      "content-length": String(image.length),
      "x-amz-server-side-encryption": "AES256",
    },
    body: image,
  });
  expect(put.status).toBe(200);
  const etag = z
    .string()
    .regex(/^"[a-f0-9]{32}"$/)
    .parse(put.headers.get("etag"));
  expect(objects.get(new URL(data.uploadUrl).pathname)?.bytes.equals(image)).toBe(true);
  return { ...data, etag };
}
beforeAll(async () => {
  assertLocalDevelopmentDatabase(getDatabaseUrl());
  await db.$queryRaw`SELECT 1`;
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Local storage did not bind");
  endpoint = `http://127.0.0.1:${address.port}`;
});
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("S3_ENDPOINT", endpoint);
  vi.stubEnv("S3_VAULT_BUCKET", "test-private-vault");
  vi.stubEnv("S3_VAULT_REGION", "ap-northeast-2");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "pipeline-test-only");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "pipeline-test-only-not-a-real-secret");
  vi.stubEnv("AUTH_COOKIE_SECRET", "pipeline-test-only-guest-signing-secret");
  objects.clear();
  jar.clear();
  headCount = 0;
});
afterEach(async () => {
  await db.imageUploadSession.deleteMany({
    where: { OR: [{ userId: { in: [...users] } }, { guestDeviceId: { in: [...guests] } }] },
  });
  await db.user.deleteMany({ where: { id: { in: [...users] } } });
  users.clear();
  guests.clear();
  jar.clear();
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
  await db.$disconnect();
});

describe("upload routes through the real AWS SDK and local HTTP storage", () => {
  it("issues, uploads, HEAD-verifies and confirms a member image exactly once", async () => {
    const user = await member();
    const upload = await issueAndPut();
    expect(upload.s3Key).not.toContain(user.id);
    expect((await fetch(upload.uploadUrl)).status).toBe(403);
    const pending = await db.imageUploadSession.findUniqueOrThrow({
      where: { id: upload.uploadSessionId },
    });
    expect(pending).toMatchObject({ status: "PENDING", userId: user.id, etag: null });
    expect(pending.expiresAt.getTime() - pending.createdAt.getTime()).toBeGreaterThanOrEqual(
      899_000,
    );
    const body = { uploadSessionId: upload.uploadSessionId, etag: upload.etag };
    const responses = await Promise.all(
      Array.from({ length: 3 }, () => complete(request("upload-complete", body))),
    );
    const first = confirmationSchema.parse(await responses[0].json());
    for (const response of responses) expect(response.status).toBe(200);
    for (const response of responses.slice(1))
      expect(confirmationSchema.parse(await response.json())).toEqual(first);
    expect(headCount).toBe(1);
    expect(
      await db.imageUploadSession.findUniqueOrThrow({ where: { id: upload.uploadSessionId } }),
    ).toMatchObject({
      status: "UPLOADED",
      etag: upload.etag,
      s3Key: upload.s3Key,
      updatedAt: new Date(first.data.confirmedAt),
    });
  });
  it("requires a signed guest proof and checks ownership before contacting storage", async () => {
    const owner = guest();
    const upload = await issueAndPut();
    guest();
    const body = { uploadSessionId: upload.uploadSessionId, etag: upload.etag };
    expect((await complete(request("upload-complete", body))).status).toBe(403);
    expect(headCount).toBe(0);
    jar.clear();
    expect(
      (
        await complete(
          request("upload-complete", body, { "x-guest-session-id": owner.guestDeviceId }),
        )
      ).status,
    ).toBe(401);
    expect(headCount).toBe(0);
    jar.set(GUEST_COOKIE_NAME, owner.guestDeviceId);
    jar.set(GUEST_PROOF_COOKIE_NAME, owner.proof);
    expect((await complete(request("upload-complete", body))).status).toBe(200);
    expect(headCount).toBe(1);
  });
  it("returns 410 for expired pending uploads without a storage HEAD", async () => {
    guest();
    const upload = await issueAndPut();
    await db.imageUploadSession.update({
      where: { id: upload.uploadSessionId },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    const response = await complete(
      request("upload-complete", { uploadSessionId: upload.uploadSessionId, etag: upload.etag }),
    );
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "UPLOAD_SESSION_EXPIRED" },
    });
    expect(headCount).toBe(0);
  });
  it("rejects unsupported MIME, oversized files and forged completion IDs", async () => {
    const owner = guest();
    for (const file of [
      { mimeType: "application/pdf", fileSizeBytes: image.length },
      { mimeType: "image/jpeg", fileSizeBytes: 10_485_761 },
    ]) {
      const response = await issue(request("upload-url", file));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        success: false,
        error: { code: "INVALID_FILE_SPEC" },
      });
    }
    expect(
      await db.imageUploadSession.count({ where: { guestDeviceId: owner.guestDeviceId } }),
    ).toBe(0);
    expect(
      (
        await complete(
          request("upload-complete", {
            uploadSessionId: randomUUID(),
            etag: '"0123456789abcdef0123456789abcdef"',
          }),
        )
      ).status,
    ).toBe(404);
  });
  it("keeps a session pending when the HTTP HEAD metadata does not match AES256", async () => {
    guest();
    const upload = await issueAndPut();
    const object = objects.get(new URL(upload.uploadUrl).pathname);
    if (!object) throw new Error("Fixture upload missing");
    object.encryption = "aws:kms";
    const response = await complete(
      request("upload-complete", { uploadSessionId: upload.uploadSessionId, etag: upload.etag }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "STORAGE_OBJECT_NOT_FOUND" },
    });
    expect(
      (await db.imageUploadSession.findUniqueOrThrow({ where: { id: upload.uploadSessionId } }))
        .status,
    ).toBe("PENDING");
    object.encryption = "AES256";
    expect(
      (
        await complete(
          request("upload-complete", {
            uploadSessionId: upload.uploadSessionId,
            etag: upload.etag,
          }),
        )
      ).status,
    ).toBe(200);
  });
});
