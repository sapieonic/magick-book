import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Thin S3 wrapper for invoice documents. The bucket is provisioned by
 * serverless.yaml; point the app at it with INVOICES_BUCKET. Credentials come
 * from the standard AWS provider chain (env vars or an attached IAM role).
 *
 * When INVOICES_BUCKET is unset the app degrades gracefully — invoice PDFs are
 * generated on demand instead of stored (so local dev needs no AWS setup).
 */

const BUCKET = process.env.INVOICES_BUCKET;
const REGION = process.env.AWS_REGION || process.env.S3_REGION || "ap-south-1";

let client: S3Client | null = null;

export function isS3Configured(): boolean {
  return Boolean(BUCKET);
}

function getClient(): S3Client {
  if (!BUCKET) throw new Error("INVOICES_BUCKET is not configured.");
  if (!client) client = new S3Client({ region: REGION });
  return client;
}

/** Upload an object. Returns the key. */
export async function putObject(key: string, body: Uint8Array | Buffer, contentType: string): Promise<string> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

/** Time-limited URL to GET an object (default 5 min). */
export async function presignGetUrl(key: string, expiresInSeconds = 300, downloadName?: string): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ...(downloadName ? { ResponseContentDisposition: `inline; filename="${downloadName}"` } : {}),
  });
  return getSignedUrl(getClient(), cmd, { expiresIn: expiresInSeconds });
}

/** Stable key for an invoice document within a workspace (extension-agnostic). */
export function invoiceKey(workspaceId: string, invoiceId: string): string {
  return `workspaces/${workspaceId}/invoices/${invoiceId}`;
}

/** Stable key for an account document (proposal/agreement) within a workspace. */
export function documentKey(workspaceId: string, documentId: string): string {
  return `workspaces/${workspaceId}/documents/${documentId}`;
}
