'use strict';

const crypto = require('crypto');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const REGION = process.env.AWS_REGION;
const BUCKET = process.env.S3_BUCKET;
const PREFIX = process.env.S3_PREFIX || 'buyer-board/';

const s3Enabled = Boolean(REGION && BUCKET);
const s3 = s3Enabled ? new S3Client({ region: REGION }) : null;

function publicUrl(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
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

// Delete an object given its public URL (only ours; ignores anything else).
async function deleteByUrl(url) {
  const base = `https://${BUCKET}.s3.${REGION}.amazonaws.com/`;
  if (!url || !url.startsWith(base)) return false;
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: url.slice(base.length) }));
  return true;
}

// Find every one of OUR S3 URLs inside a blob of text/HTML (e.g. inline <img src>
// in a comment/description). Used so deleting content also removes its files.
function s3UrlsInHtml(html) {
  if (!html) return [];
  const base = `https://${BUCKET}.s3.${REGION}.amazonaws.com/`;
  const matches = String(html).match(/https?:\/\/[^\s"'<>()]+/g) || [];
  return matches.filter(u => u.startsWith(base));
}

// Best-effort bulk delete: dedupes, never throws (S3 cleanup must not block a DB
// delete — a leaked object is far better than a failed/partial delete).
async function deleteUrls(urls) {
  const unique = [...new Set((urls || []).filter(Boolean))];
  await Promise.all(unique.map(u => deleteByUrl(u).catch(() => {})));
}

module.exports = { s3Enabled, presignUpload, deleteByUrl, s3UrlsInHtml, deleteUrls, publicUrl };
