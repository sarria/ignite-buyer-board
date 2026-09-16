'use strict';

const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.S3_BUCKET;
const PREFIX = process.env.S3_PREFIX || 'buyer-board/';

const s3Enabled = Boolean(REGION && BUCKET);
const s3 = s3Enabled ? new S3Client({ region: REGION }) : null;

// Private-bucket read proxy (server/controllers/files.js, GET /api/files/<key>),
// now the default `publicUrl()`. The proxy sits behind `requireAuth`, which reads
// either the `Authorization: Bearer` header (axios calls) or a `?token=` query
// param (plain <img src>/<a href>, appended client-side by
// client/src/utils/fileUrl.js) — an earlier attempt (2026-09-15) flipped this
// without the query-param fallback and broke every image within minutes. Do not
// remove that fallback.
const RAW_BASE = `https://${BUCKET}.s3.${REGION}.amazonaws.com/`;
const PROXY_BASE = '/api/files/';

function publicUrl(key) {
  return `${PROXY_BASE}${key}`;
}

// The literal S3 key from either URL form we've ever stored. Null for anything else
// (an external link, e.g.) so callers can filter safely.
function keyFromUrl(url) {
  if (!url) return null;
  if (url.startsWith(RAW_BASE)) return url.slice(RAW_BASE.length);
  if (url.startsWith(PROXY_BASE)) return url.slice(PROXY_BASE.length);
  return null;
}

// Presigned PUT so the browser can upload directly to S3 (avoids Vercel's
// serverless body-size limit). The client must PUT with the same Content-Type.
async function presignUpload(filename, contentType) {
  const safe = String(filename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const key = `${PREFIX}uploads/${crypto.randomUUID()}-${safe}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType || 'application/octet-stream' }),
    { expiresIn: 300 }
  );
  return { uploadUrl, publicUrl: publicUrl(key), key };
}

// Presigned GET for the read-through proxy (server/controllers/files.js). Short TTL —
// it's fetched fresh on every page load, never stored, so there's nothing to rotate.
async function presignRead(key, expiresIn = 300) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
}

// Delete an object given either URL form we've stored (only ours; ignores anything else).
async function deleteByUrl(url) {
  const key = keyFromUrl(url);
  if (!key) return false;
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  return true;
}

// Find every one of OUR S3 URLs inside a blob of text/HTML (e.g. inline <img src>
// in a comment/description). Used so deleting content also removes its files.
// Matches both the pre-rewrite raw host and the current proxy path.
function s3UrlsInHtml(html) {
  if (!html) return [];
  const matches = String(html).match(/(?:https?:\/\/[^\s"'<>()]+|\/api\/files\/[^\s"'<>()]+)/g) || [];
  return matches.filter(u => keyFromUrl(u) !== null);
}

// Best-effort bulk delete: dedupes, never throws (S3 cleanup must not block a DB
// delete — a leaked object is far better than a failed/partial delete).
async function deleteUrls(urls) {
  const unique = [...new Set((urls || []).filter(Boolean))];
  await Promise.all(unique.map(u => deleteByUrl(u).catch(() => {})));
}

module.exports = {
  s3Enabled, presignUpload, presignRead, deleteByUrl, s3UrlsInHtml, deleteUrls,
  publicUrl, keyFromUrl, RAW_BASE, PROXY_BASE,
};
