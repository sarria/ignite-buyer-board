'use strict';

const { s3Enabled, presignRead } = require('../lib/s3');

// GET /api/files/<key> — the only way to read an S3 object now that the bucket is
// private. Sits behind the same requireAuth as every other /api route (mounted in
// app.js), so a signed-out browser can no longer view a buyer's attachments just by
// having the URL. Redirects to a fresh short-lived presigned GET rather than
// streaming the bytes itself — cheaper, and Vercel's function isn't in the hot path
// for every image load.
async function getFile(req, res, next) {
  try {
    if (!s3Enabled) return res.status(503).end();
    const key = Array.isArray(req.params.key) ? req.params.key.join('/') : req.params.key;
    if (!key) return res.status(400).end();
    const url = await presignRead(key);
    res.redirect(302, url);
  } catch (err) { next(err); }
}

module.exports = { getFile };
