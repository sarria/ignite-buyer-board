'use strict';

const { s3Enabled, presignUpload } = require('../lib/s3');

// Return a presigned PUT URL + the final public URL for a browser upload.
async function presign(req, res, next) {
  try {
    if (!s3Enabled) {
      return res.status(503).json({ error: { message: 'Uploads not configured (S3 env missing)', code: 'NO_S3' } });
    }
    const { filename, contentType } = req.body;
    const result = await presignUpload(filename, contentType);
    res.json(result);
  } catch (err) { next(err); }
}

module.exports = { presign };
