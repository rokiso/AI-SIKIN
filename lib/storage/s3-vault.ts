import "server-only";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getVaultConfiguration } from "@/lib/server-env";
import type { UploadFile } from "@/lib/diagnostic/upload-validation";

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

export async function signImageUpload(s3Key: string, file: UploadFile): Promise<string> {
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
        expiresIn: 900,
        signableHeaders: new Set(["content-type", "content-length"]),
        unhoistableHeaders: new Set(["x-amz-server-side-encryption"]),
      },
    );
  } finally {
    client.destroy();
  }
}

export async function readImageMetadata(s3Key: string) {
  const { client, bucket } = vault();
  try {
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: s3Key }));
    return {
      etag: object.ETag,
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
