import api from './client';

export const presignUpload = (filename, contentType) =>
  api.post('/uploads/presign', { filename, contentType }).then(r => r.data);

// Get a presigned URL, PUT the file straight to S3, return the public URL.
export async function uploadFile(file) {
  const { uploadUrl, publicUrl } = await presignUpload(file.name, file.type);
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
  return publicUrl;
}
