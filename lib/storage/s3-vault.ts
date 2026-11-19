import "server-only";
import {
  GetObjectCommand,
  DeleteObjectsCommand,
  GetBucketVersioningCommand,
  ListObjectVersionsCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import type { ObjectIdentifier } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getVaultConfiguration } from "@/lib/server-env";
import { uploadEtagSchema, type UploadFile } from "@/lib/diagnostic/upload-validation";

function vault() {
  const config = getVaultConfiguration();
  return {
    bucket: config.bucket,
    client: new S3Client({
      region: config.region,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      requestHandler: { connectionTimeout: 2_000, requestTimeout: 5_000 },
      maxAttempts: 2,
      requestChecksumCalculation: "WHEN_REQUIRED",
    }),
  };
}

export async function signImageUpload(
  s3Key: string,
  file: UploadFile,
  expiresIn = 900,
): Promise<string> {
  const { client, bucket } = vault();
  try {
    return await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        ContentType: file.mimeType,
        ContentLength: file.fileSizeBytes,
        ServerSideEncryption: "AES256",
      }),
      {
        expiresIn,
        signableHeaders: new Set(["content-type", "content-length"]),
        unhoistableHeaders: new Set(["x-amz-server-side-encryption"]),
      },
    );
  } finally {
    client.destroy();
  }
}

export async function readImageMetadata(s3Key: string, signal?: AbortSignal) {
  const { client, bucket } = vault();
  try {
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: s3Key }), {
      abortSignal: signal,
    });
    return {
      etag: uploadEtagSchema.safeParse(object.ETag).data,
      size: object.ContentLength,
      mimeType: object.ContentType,
      encryption: object.ServerSideEncryption,
    };
  } catch (error) {
    if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 404) return null;
    throw error;
  } finally {
    client.destroy();
  }
}

export async function signImageView(s3Key: string): Promise<string> {
  const { client, bucket } = vault();
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
        ResponseCacheControl: "private, no-store",
      }),
      { expiresIn: 300 },
    );
  } finally {
    client.destroy();
  }
}

// Internal only. Keys must come from rows owned by the authenticated user.
// S3 batches are not atomic: a partial failure must leave DB ownership intact
// so a retry can finish deleting the same keys, including previously missing ones.
export async function deleteImageObjects(keys: string[], signal: AbortSignal): Promise<number> {
  const unique = [...new Set(keys)];
  if (!unique.length) return 0;
  if (
    unique.some(
      (key) => !/^(raw-faces|daily-snapshots)\/[A-Za-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(key),
    )
  )
    throw new Error("Unexpected image object namespace");
  const { client, bucket } = vault();
  const options = { abortSignal: signal };
  async function versions(key: string) {
    const objects: ObjectIdentifier[] = [];
    let keyMarker: string | undefined;
    let versionMarker: string | undefined;
    for (;;) {
      const page = await client.send(
        new ListObjectVersionsCommand({
          Bucket: bucket,
          Prefix: key,
          KeyMarker: keyMarker,
          VersionIdMarker: versionMarker,
        }),
        options,
      );
      for (const entry of [...(page.Versions ?? []), ...(page.DeleteMarkers ?? [])]) {
        if (entry.Key !== key) continue;
        if (!entry.VersionId) throw new Error("Missing object version identifier");
        objects.push({ Key: key, VersionId: entry.VersionId });
      }
      if (!page.IsTruncated) return objects;
      if (
        !page.NextKeyMarker ||
        (page.NextKeyMarker === keyMarker && page.NextVersionIdMarker === versionMarker)
      )
        throw new Error("Invalid object version pagination");
      keyMarker = page.NextKeyMarker;
      versionMarker = page.NextVersionIdMarker;
    }
  }
  try {
    const config = await client.send(new GetBucketVersioningCommand({ Bucket: bucket }), options);
    if (config.Status !== undefined && config.Status !== "Enabled" && config.Status !== "Suspended")
      throw new Error("Unrecognized bucket versioning state");
    const versioned = config.Status === "Enabled" || config.Status === "Suspended";
    const objects: ObjectIdentifier[] = [];
    for (const key of unique) objects.push(...(versioned ? await versions(key) : [{ Key: key }]));
    for (let offset = 0; offset < objects.length; offset += 1000) {
      const batch = objects.slice(offset, offset + 1000);
      const result = await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch, Quiet: false },
        }),
        options,
      );
      if (result.Errors?.length) throw new Error("Image deletion partially failed");
      if (
        batch.some(
          (object) =>
            !result.Deleted?.some(
              (deleted) => deleted.Key === object.Key && deleted.VersionId === object.VersionId,
            ),
        )
      )
        throw new Error("Image deletion acknowledgement incomplete");
    }
    for (const key of unique) {
      if (versioned) {
        if ((await versions(key)).length) throw new Error("Object versions remain after deletion");
      } else {
        // A HEAD for a missing object can return 403 without unrestricted
        // ListBucket. Prefix-scoped listing verifies absence with narrow IAM.
        let continuation: string | undefined;
        for (;;) {
          const page = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: key,
              ContinuationToken: continuation,
            }),
            options,
          );
          if (page.Contents?.some((object) => object.Key === key))
            throw new Error("Image remains after deletion");
          if (!page.IsTruncated) break;
          if (!page.NextContinuationToken || page.NextContinuationToken === continuation)
            throw new Error("Invalid object pagination");
          continuation = page.NextContinuationToken;
        }
      }
    }
    return unique.length;
  } finally {
    client.destroy();
  }
}
