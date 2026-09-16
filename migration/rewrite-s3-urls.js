'use strict';

/**
 * rewrite-s3-urls.js
 *
 * One-time rewrite of every stored S3 URL from the raw public bucket host
 * (https://<bucket>.s3.<region>.amazonaws.com/<key>) to our own read-through proxy
 * path (/api/files/<key> — server/controllers/files.js). Needed because the bucket
 * is going private: a raw bucket URL baked into a card's attachments[] or into
 * descriptionHtml/notesHtml/bodyHtml would 403 the instant public access is
 * removed, since nothing re-signs it. The proxy path resolves through requireAuth
 * and a fresh presigned GET on every request, so this is a one-time string rewrite,
 * not a re-upload — the underlying S3 objects and keys never move.
 *
 * Run this AFTER deploying the code that adds the /api/files proxy (so the new URLs
 * actually resolve) and BEFORE flipping the bucket's Block Public Access on. Safe to
 * re-run — it only touches URLs that still start with the raw bucket host.
 *
 * Usage:
 *   node migration/rewrite-s3-urls.js              # dry run (default), all boards
 *   node migration/rewrite-s3-urls.js --apply      # write the rewrite
 *   node migration/rewrite-s3-urls.js --board=<id> # one board only (testing)
 */

require('dotenv').config();

if (process.env.DNS_SERVERS) {
  require('dns').setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()).filter(Boolean));
}

const { MongoClient, ObjectId } = require('mongodb');
const { RAW_BASE, PROXY_BASE } = require('../server/lib/s3');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const BOARD_ARG = args.find(a => a.startsWith('--board='));
const BOARD_ID = BOARD_ARG ? BOARD_ARG.split('=')[1] : null;

function rewriteUrl(url) {
  return typeof url === 'string' && url.startsWith(RAW_BASE)
    ? PROXY_BASE + url.slice(RAW_BASE.length)
    : url;
}

function rewriteHtml(html) {
  if (!html || typeof html !== 'string' || !html.includes(RAW_BASE)) return html;
  return html.split(RAW_BASE).join(PROXY_BASE);
}

function rewriteAttachments(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return { changed: false, attachments };
  let changed = false;
  const next = attachments.map(a => {
    const url = rewriteUrl(a.url);
    if (url !== a.url) changed = true;
    return url === a.url ? a : { ...a, url };
  });
  return { changed, attachments: next };
}

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI, {
    tls: process.env.MONGODB_URI.startsWith('mongodb+srv://'),
  });
  await client.connect();
  const db = client.db();

  const boardFilter = BOARD_ID ? { boardId: new ObjectId(BOARD_ID) } : {};
  const counts = { cards: 0, cardHtml: 0, subtasks: 0, subtaskHtml: 0, comments: 0 };

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}${BOARD_ID ? ` (board ${BOARD_ID})` : ' (all boards)'}`);

  // Cards: attachments[] + descriptionHtml
  const cards = await db.collection('cards').find(boardFilter).toArray();
  for (const card of cards) {
    const $set = {};
    const { changed, attachments } = rewriteAttachments(card.attachments);
    if (changed) { $set.attachments = attachments; counts.cards += 1; }
    const html = rewriteHtml(card.descriptionHtml);
    if (html !== card.descriptionHtml) { $set.descriptionHtml = html; counts.cardHtml += 1; }
    if (Object.keys($set).length && APPLY) {
      await db.collection('cards').updateOne({ _id: card._id }, { $set });
    }
  }

  // Subtasks: attachments[] + notesHtml (cardId, not boardId — resolve via card ids)
  const cardIds = cards.map(c => c._id);
  const subtaskFilter = BOARD_ID ? { cardId: { $in: cardIds } } : {};
  const subtasks = await db.collection('subtasks').find(subtaskFilter).toArray();
  for (const subtask of subtasks) {
    const $set = {};
    const { changed, attachments } = rewriteAttachments(subtask.attachments);
    if (changed) { $set.attachments = attachments; counts.subtasks += 1; }
    const html = rewriteHtml(subtask.notesHtml);
    if (html !== subtask.notesHtml) { $set.notesHtml = html; counts.subtaskHtml += 1; }
    if (Object.keys($set).length && APPLY) {
      await db.collection('subtasks').updateOne({ _id: subtask._id }, { $set });
    }
  }

  // Comments: bodyHtml (carries cardId whether it's a card or subtask thread)
  const commentFilter = BOARD_ID ? { cardId: { $in: cardIds } } : {};
  const comments = await db.collection('comments').find(commentFilter).toArray();
  for (const comment of comments) {
    const html = rewriteHtml(comment.bodyHtml);
    if (html !== comment.bodyHtml) {
      counts.comments += 1;
      if (APPLY) await db.collection('comments').updateOne({ _id: comment._id }, { $set: { bodyHtml: html } });
    }
  }

  console.log('\nCards with rewritten attachments:   ', counts.cards);
  console.log('Cards with rewritten description:   ', counts.cardHtml);
  console.log('Subtasks with rewritten attachments:', counts.subtasks);
  console.log('Subtasks with rewritten notes:       ', counts.subtaskHtml);
  console.log('Comments with rewritten body:        ', counts.comments);
  if (!APPLY) console.log('\nDry run only — re-run with --apply to write these changes.');

  await client.close();
}

run().catch(err => { console.error(err); process.exit(1); });
