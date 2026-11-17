// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { buildS3PolicyPlan } from "@/lib/storage/s3-policy-plan";

const input = { bucket: "test-private-vault", origins: ["https://miruvia.vercel.app"] };
const policySchema = z.object({
  Statement: z.array(
    z.object({
      Effect: z.string(),
      Action: z.union([z.string(), z.array(z.string())]),
      Resource: z.array(z.string()),
    }),
  ),
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("offline least-privilege S3 policy plan", () => {
  it("renders one exact bucket and both existing image prefixes without management, delete or fake HEAD actions", async () => {
    const files = await buildS3PolicyPlan(input);
    expect(files).toHaveLength(6);
    const iam = policySchema.parse(files.find((file) => file.name === "iam-policy.json")?.contents);
    expect(iam.Statement).toEqual([
      {
        Effect: "Allow",
        Action: ["s3:PutObject", "s3:GetObject"],
        Resource: [
          "arn:aws:s3:::test-private-vault/raw-faces/*",
          "arn:aws:s3:::test-private-vault/daily-snapshots/*",
        ],
        // Sid is deliberately irrelevant to authorization.
      },
    ]);
    const serialized = JSON.stringify(files);
    for (const unsafe of [
      "__BUCKET_NAME__",
      "__APP_ORIGINS__",
      "s3:DeleteObject",
      "s3:HeadObject",
      "s3:ListBucket",
      "kbeauty-skin-vault-*",
    ])
      expect(serialized).not.toContain(unsafe);
  });
  it("requires TLS and explicit AES256 for both prefixes, blocks public access and does not enable a KMS bucket key", async () => {
    const files = await buildS3PolicyPlan(input);
    const get = (name: string) => files.find((file) => file.name === name)?.contents;
    expect(get("s3-public-access-block.json")).toEqual({
      BlockPublicAcls: true,
      IgnorePublicAcls: true,
      BlockPublicPolicy: true,
      RestrictPublicBuckets: true,
    });
    expect(get("s3-encryption.json")).toEqual({
      Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: "AES256" } }],
    });
    expect(get("s3-ownership-controls.json")).toEqual({
      Rules: [{ ObjectOwnership: "BucketOwnerEnforced" }],
    });
    expect(get("s3-bucket-policy.json")).toMatchObject({
      Statement: [
        { Effect: "Deny", Condition: { Bool: { "aws:SecureTransport": "false" } } },
        {
          Effect: "Deny",
          Action: "s3:PutObject",
          Condition: { StringNotEquals: { "s3:x-amz-server-side-encryption": "AES256" } },
        },
      ],
    });
  });
  it("normalizes exact origins, exposes ETag and allows HTTP loopback only with explicit development opt-in", async () => {
    const files = await buildS3PolicyPlan({
      ...input,
      origins: [
        "https://miruvia.vercel.app/",
        "https://miruvia.vercel.app",
        "http://127.0.0.1:3000",
      ],
      allowLocalhost: true,
    });
    expect(files.find((file) => file.name === "s3-cors.json")?.contents).toEqual({
      CORSRules: [
        {
          AllowedOrigins: ["https://miruvia.vercel.app", "http://127.0.0.1:3000"],
          AllowedMethods: ["GET", "PUT", "HEAD"],
          AllowedHeaders: ["Content-Type", "Content-Length", "x-amz-server-side-encryption"],
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3000,
        },
      ],
    });
  });
  it.each([
    "https://*.vercel.app",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com?query=x",
    "https://example.com/#fragment",
    "http://example.com",
    "http://localhost:3000",
  ])("rejects a broad or ambiguous origin %s", async (origin) => {
    await expect(buildS3PolicyPlan({ ...input, origins: [origin] })).rejects.toThrow();
  });
  it.each(["*", "UPPERCASE", "127.0.0.1", "test..bucket", 'bucket"injection', "ab"])(
    "rejects an unsafe bucket name %s",
    async (bucket) => {
      await expect(buildS3PolicyPlan({ ...input, bucket })).rejects.toThrow();
    },
  );
  it("needs no AWS keys and does not make network calls", async () => {
    vi.stubEnv("AWS_ACCESS_KEY_ID", "");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(await buildS3PolicyPlan(input)).toHaveLength(6);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("generates reviewable JSON through the CLI and preserves an existing output directory", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "sikin-s3-plan-test-"));
    const output = join(temporary, "plan");
    const args = [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/s3-policy-plan.ts",
      "--bucket",
      input.bucket,
      "--origin",
      input.origins[0],
      "--out",
      output,
    ];
    try {
      const message = execFileSync(process.execPath, args, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      expect(message).toContain("AWS was not contacted");
      expect(await readdir(output)).toHaveLength(6);
      const before = await readFile(join(output, "iam-policy.json"), "utf8");
      expect(() => execFileSync(process.execPath, args, { stdio: "pipe" })).toThrow();
      expect(await readFile(join(output, "iam-policy.json"), "utf8")).toBe(before);
      const marker = join(temporary, "keep.txt");
      await writeFile(marker, "preserve");
      expect(() =>
        execFileSync(process.execPath, [...args, "--apply"], { stdio: "pipe" }),
      ).toThrow();
      expect(await readFile(marker, "utf8")).toBe("preserve");
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
