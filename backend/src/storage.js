// Cloudflare R2 (S3-compatible) image storage. Enabled only when the R2_* variables are set.
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const env = () => process.env;
export const r2Enabled = () => Boolean(env().R2_ACCOUNT_ID && env().R2_ACCESS_KEY_ID && env().R2_SECRET_ACCESS_KEY && env().R2_BUCKET);

let client;
const s3 = () => (client ??= new S3Client({
  region: 'auto',
  endpoint: env().R2_ENDPOINT || `https://${env().R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: { accessKeyId: env().R2_ACCESS_KEY_ID, secretAccessKey: env().R2_SECRET_ACCESS_KEY },
  // R2 rejects the SDK's newer default checksum headers
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED'
}));

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export async function putImage(buf, type, kind) {
  const key = `${kind}/${crypto.randomUUID()}.${EXT[type]}`;
  await s3().send(new PutObjectCommand({
    Bucket: env().R2_BUCKET, Key: key, Body: buf, ContentType: type,
    CacheControl: 'public, max-age=31536000, immutable'
  }));
  return key;
}

export async function getImage(key) {
  const r = await s3().send(new GetObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));
  return r.Body; // Node readable stream
}

export const deleteImage = (key) => s3().send(new DeleteObjectCommand({ Bucket: env().R2_BUCKET, Key: key }));

// If the bucket has a public domain, the browser loads photos straight from Cloudflare.
export const publicUrl = (key) => (env().R2_PUBLIC_URL ? `${env().R2_PUBLIC_URL.replace(/\/$/, '')}/${key}` : null);
