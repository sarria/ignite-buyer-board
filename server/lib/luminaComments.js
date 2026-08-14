'use strict';

// Lumina Comments API client (Luminotes integration, LM-4131) — lets a card comment be
// "pushed" into the buyer-notes thread of its linked line item. Separate token/scopes
// from server/lib/lumina.js (which is read-only SEM data).
//
// Rel11 vs production is picked by LUMINA_COMMENTS_ENV, defaulting to rel11 so a missing/
// misconfigured env var can never post to production on accident. Flip it to "production"
// only when we're deliberately going live.
const ENVS = {
  rel11: {
    base: 'https://release11.townsquarelumina.com/lumina/orders/api/ignite/ext',
    token: process.env.EXT_SEMTEAM_TOKEN_REL11,
  },
  production: {
    base: 'https://townsquarelumina.com/lumina/orders/api/ignite/ext',
    token: process.env.EXT_SEMTEAM_TOKEN_PROD,
  },
};

const ENV_NAME = process.env.LUMINA_COMMENTS_ENV === 'production' ? 'production' : 'rel11';
const { base: BASE, token: TOKEN } = ENVS[ENV_NAME];
const ON_BEHALF_OF = process.env.LUMINA_COMMENTS_USER;

function configured() {
  return Boolean(TOKEN && ON_BEHALF_OF);
}

// Best-effort: a failed push must never fail the local comment save. Callers catch and
// record the outcome rather than letting this throw into the request handler.
async function postComment(lineitemId, content) {
  if (!configured()) {
    const err = new Error('Lumina comments push is not configured (token or on-behalf user missing)');
    err.code = 'LUMINA_COMMENTS_NOT_CONFIGURED';
    throw err;
  }
  const res = await fetch(`${BASE}/user/lineitems/${encodeURIComponent(lineitemId)}/comments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'X-On-Behalf-Of-User': ON_BEHALF_OF,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = new Error(`Lumina comments ${res.status} on POST /user/lineitems/${lineitemId}/comments`);
    err.code = 'LUMINA_COMMENTS_UPSTREAM';
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  // Same cohort gate as the read-only SEM API (server/lib/lumina.js): a line item outside
  // {SEM, SEM/Spark, Spark} (e.g. in-home/Home Services) answers 200 {found:false} on POST
  // too, not an error status. Checked here — found live, 2026-08-13, when a push against an
  // in-home line item reported "Synced to Lumina" but wrote nothing anywhere.
  if (json?.found === false || !json?.item) {
    const err = new Error(`Lumina comments: line item ${lineitemId} not found or outside the SEM cohort`);
    err.code = 'LUMINA_COMMENTS_NOT_FOUND';
    throw err;
  }
  return json;
}

// Keeps an already-pushed comment in sync when the buyer edits it locally. Same
// best-effort contract as postComment — callers catch and record the outcome.
async function patchComment(commentId, content) {
  if (!configured()) {
    const err = new Error('Lumina comments push is not configured (token or on-behalf user missing)');
    err.code = 'LUMINA_COMMENTS_NOT_CONFIGURED';
    throw err;
  }
  const res = await fetch(`${BASE}/user/comments/${encodeURIComponent(commentId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'X-On-Behalf-Of-User': ON_BEHALF_OF,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = new Error(`Lumina comments ${res.status} on PATCH /user/comments/${commentId}`);
    err.code = 'LUMINA_COMMENTS_UPSTREAM';
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  // Author-only edit: editing a note the on-behalf user didn't author, or one that's
  // been deleted, is a 404 with existence hidden per the guide — not this 200/{found:false}
  // shape, but keep the same defensive check as postComment in case that ever changes.
  if (json?.found === false || !json?.item) {
    const err = new Error(`Lumina comments: comment ${commentId} not found or not editable`);
    err.code = 'LUMINA_COMMENTS_NOT_FOUND';
    throw err;
  }
  return json;
}

module.exports = { configured, postComment, patchComment, ENV_NAME };
