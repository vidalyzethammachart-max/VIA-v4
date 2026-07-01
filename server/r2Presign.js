import crypto from "node:crypto";
import { getExtension, isAllowedVideo, MAX_FILE_SIZE_BYTES, sanitizeFileName } from "./videoUploadCore.js";

const DEFAULT_PUT_EXPIRES_SECONDS = 60 * 15;
const DEFAULT_GET_EXPIRES_SECONDS = 60 * 60 * 24;
const MAX_PRESIGN_EXPIRES_SECONDS = 60 * 60 * 24 * 7;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function encodePathSegment(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodeQueryValue(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function clampExpires(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(Math.round(parsed), MAX_PRESIGN_EXPIRES_SECONDS);
}

function getR2Config() {
  const accountId = requiredEnv("R2_ACCOUNT_ID");
  return {
    accountId,
    accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
    secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    bucket: requiredEnv("R2_BUCKET_NAME"),
    host: `${accountId}.r2.cloudflarestorage.com`,
    putExpiresSeconds: clampExpires(process.env.R2_UPLOAD_URL_TTL_SECONDS, DEFAULT_PUT_EXPIRES_SECONDS),
    getExpiresSeconds: clampExpires(process.env.R2_DOWNLOAD_URL_TTL_SECONDS, DEFAULT_GET_EXPIRES_SECONDS),
  };
}

function formatAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function signR2Url({ method, objectKey, expiresSeconds }) {
  const config = getR2Config();
  const now = new Date();
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const canonicalUri = `/${config.bucket}/${objectKey.split("/").map(encodePathSegment).join("/")}`;

  const queryParams = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${config.accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };

  const canonicalQuery = Object.entries(queryParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeQueryValue(key)}=${encodeQueryValue(value)}`)
    .join("&");

  const canonicalHeaders = `host:${config.host}\n`;
  const signedHeaders = "host";
  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const dateKey = hmac(`AWS4${config.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, "auto");
  const serviceKey = hmac(regionKey, "s3");
  const signingKey = hmac(serviceKey, "aws4_request");
  const signature = hmac(signingKey, stringToSign, "hex");

  return `https://${config.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function buildVideoObjectKey({ fileName, userId, evaluationId }) {
  const safeFileName = sanitizeFileName(fileName);
  const extension = getExtension(safeFileName) || ".mp4";
  const baseName = safeFileName.replace(/\.[^/.]+$/, "") || "video";
  const owner = sanitizeFileName(userId || "anonymous").replace(/\.[^/.]+$/, "");
  const idPart = evaluationId ? `evaluation-${evaluationId}` : `pending-${Date.now()}`;
  const randomPart = crypto.randomBytes(8).toString("hex");
  return `video-submissions/${owner}/${idPart}/${Date.now()}-${randomPart}-${baseName}${extension}`;
}

export function createR2VideoPresign({ fileName, mimeType, fileSize, userId, evaluationId }) {
  const size = Number(fileSize);

  if (!fileName || typeof fileName !== "string") {
    throw new Error("fileName is required.");
  }

  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("fileSize must be a positive number.");
  }

  if (size > MAX_FILE_SIZE_BYTES) {
    throw new Error("Video file must be 1GB or smaller.");
  }

  if (!isAllowedVideo(fileName, mimeType)) {
    throw new Error("Only .mp4, .mov, .webm, and .m4v video files are allowed.");
  }

  const config = getR2Config();
  const objectKey = buildVideoObjectKey({ fileName, userId, evaluationId });
  const uploadUrl = signR2Url({
    method: "PUT",
    objectKey,
    expiresSeconds: config.putExpiresSeconds,
  });
  const downloadUrl = signR2Url({
    method: "GET",
    objectKey,
    expiresSeconds: config.getExpiresSeconds,
  });

  return {
    provider: "cloudflare-r2",
    bucket: config.bucket,
    objectKey,
    uploadUrl,
    downloadUrl,
    uploadExpiresIn: config.putExpiresSeconds,
    downloadExpiresIn: config.getExpiresSeconds,
  };
}
