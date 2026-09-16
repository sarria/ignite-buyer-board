import { getToken } from '../api/client';

// Our own private-S3 read proxy (GET /api/files/<key>, see server/controllers/files.js)
// sits behind requireAuth, which normally reads the Authorization header our axios
// client attaches. A plain <img src> / <a href> is fetched natively by the browser
// with no custom header, so those need the session token appended as a query param
// instead. Only rewrite OUR OWN proxy paths — anything else (an external link) is
// left untouched.
export function withFileAuth(url) {
  if (!url || !url.startsWith('/api/files/')) return url;
  const token = getToken();
  if (!token) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
}

// The inverse — strips a `?token=` (or `&token=`) query param added by `withFileAuth`
// from any `/api/files/` URL inside a blob of HTML. The rich editor renders images
// live with an authed src so they display as you type, but that src must NEVER be
// what gets persisted: the token expires and embedding it in stored HTML would leak
// a session credential into the database. Called right before a save.
export function stripFileAuth(html) {
  if (!html) return html;
  return html.replace(/(\/api\/files\/[^"'\s?]+)\?token=[^"'\s&]+&?/g, '$1');
}
