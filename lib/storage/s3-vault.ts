import "server-only";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
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
