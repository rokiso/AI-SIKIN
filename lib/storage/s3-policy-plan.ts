import "server-only";
import { readFile } from "node:fs/promises";
import { z } from "zod";

const inputSchema = z
  .object({
    bucket: z
      .string()
      .min(3)
      .max(63)
      .regex(/^[a-z0-9][a-z0-9.-]+[a-z0-9]$/)
      .refine((name) => !name.includes("..") && !/^\d+\.\d+\.\d+\.\d+$/.test(name)),
    origins: z.array(z.string().min(1).max(2048)).min(1).max(10),
    allowLocalhost: z.boolean().default(false),
  })
  .strict();

const policyFiles = [
  "s3-public-access-block.json",
  "s3-encryption.json",
  "s3-ownership-controls.json",
  "s3-bucket-policy.json",
  "s3-cors.json",
  "iam-policy.json",
] as const;

export async function buildS3PolicyPlan(input: z.input<typeof inputSchema>) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid bucket or origin configuration");
  const { bucket, allowLocalhost } = parsed.data;
  const origins = [
    ...new Set(
      parsed.data.origins.map((value) => {
        const parsedUrl = z.url().safeParse(value);
        if (!parsedUrl.success) throw new Error("Invalid application origin");
        const url = new URL(parsedUrl.data);
        const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if (
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          url.pathname !== "/" ||
          url.hostname.includes("*") ||
          (local && !allowLocalhost) ||
          !(url.protocol === "https:" || (url.protocol === "http:" && local && allowLocalhost))
        )
          throw new Error("An exact HTTPS application origin is required");
        return url.origin;
      }),
    ),
  ];
  return Promise.all(
    policyFiles.map(async (name) => {
      const template: unknown = JSON.parse(
        await readFile(new URL(`../../docs/infra/${name}`, import.meta.url), "utf8"),
      );
      const rendered = JSON.stringify(template)
        .replaceAll("__BUCKET_NAME__", bucket)
        .replaceAll('["__APP_ORIGINS__"]', JSON.stringify(origins));
      if (/__[A-Z_]+__/.test(rendered)) throw new Error("Unresolved policy placeholder");
      const contents: unknown = JSON.parse(rendered);
      return { name, contents };
    }),
  );
}
