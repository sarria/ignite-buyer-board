'use strict';

/**
 * lumina-match.js
 *
 * Links already-seeded cards to their Lumina line item using identifiers the
 * buyers already paste into the card description / title. Read-only against
 * Lumina; writes ONLY the `lumina` link subdoc on the card (never Lumina data —
 * see CLAUDE.md "we store the LINK, not the DATA").
 *
 * Idempotent and board-agnostic: safe to re-run, and it is the path for every
 * board we import from here on (deliberately NOT baked into asana-seed.js, so
 * the Asana import doesn't depend on Lumina being up, and so already-seeded
 * cards can be matched without a re-seed).
 *
 * Usage:
 *   node migration/lumina-match.js                 # dry run, all boards
 *   node migration/lumina-match.js --apply         # write the links
 *   node migration/lumina-match.js --board=<id>    # one board only
 *   node migration/lumina-match.js --relink        # also reconsider linked cards
 *   node migration/lumina-match.js --limit=50      # cap cards examined (testing)
 *   node migration/lumina-match.js --pace=250      # ms between cards (429s → raise it)
 *   node migration/lumina-match.js --revert=<report.json>   # undo one --apply run
 *
 * Match tiers, most precise first. A card takes the first tier that resolves:
 *   1. pasted /lumina/view/lineitem/{seg}/{id} URL  → that exact line item
 *   2. "WO#(GPID): 6113181" in the description      → WO lookup
 *   3. leading WO in the title ("6693359_MT_...")   → WO lookup
 *
 * A WO is an ORDER number, so it can return several line items (one advertiser,
 * several campaigns). We break the tie only on the product tag the title already
 * carries ([SEM] / [PMAX] / SEM-SEARCH ...). If that doesn't single one out we
 * SKIP the card and report it — a wrong link is worse than no link, because the
 * drawer presents it as fact.
 */

require('dotenv').config();

// Optional DNS override for flaky local resolvers (set DNS_SERVERS in .env).
if (process.env.DNS_SERVERS) {
  require('dns').setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()).filter(Boolean));
}

const fs = require('fs');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const lumina = require('../server/lib/lumina');

// Dry runs share one file (always the latest preview). An --apply run gets its own
// timestamped file, because that report is the ONLY record of what to undo — a
// later dry run must not be able to clobber it.
const reportFile = applied => path.join(
  __dirname,
  applied ? `lumina-match-applied-${new Date().toISOString().replace(/[:.]/g, '-')}.json` : 'lumina-match-report.json',
);

// ─── Identifier extraction ──────────────────────────────────────────────────

// Lumina's own deep-link shape. The segment varies (sem, sem-spark, spark, …) —
// we only want the trailing id.
const LINEITEM_URL = /lumina\/view\/lineitem\/[a-z-]+\/([a-f0-9]{24})/i;

// "WO#(GPID):6113181", "WO # 4662446MD", "WO#(GPID): TD MORRIS006". WO numbers
// aren't always numeric, so letters and single spaces are allowed — but the run
// is kept short so a sentence can't masquerade as a WO.
const DESC_WO = /WO\s*#?\s*(?:\(GPID\))?\s*[:\-]\s*([A-Za-z0-9][A-Za-z0-9 _/-]{2,24}?)\s*(?:<|\n|\r|,|;|\||$)/i;

// Buyers also paste Lumina's campaignName as the card title, which starts with
// the WO: "6693359_MT_Great Falls_Great Falls Clinic_Specialty Clinic_SEM-SEARCH".
const TITLE_WO = /^\s*([0-9]{4,9})[_ -]/;

// Product hints that appear in card titles, mapped to the words Lumina uses.
const PRODUCT_HINTS = [
  { token: 'PMAX', matches: ['PMAX', 'PERFORMANCE MAX'] },
  { token: 'SPARK', matches: ['SPARK'] },
  { token: 'SEARCH', matches: ['SEARCH'] },
  { token: 'BING', matches: ['BING'] },
  { token: 'DISPLAY', matches: ['DISPLAY'] },
  { token: 'YOUTUBE', matches: ['YOUTUBE'] },
  { token: 'META', matches: ['META', 'FACEBOOK'] },
  { token: 'SEM', matches: ['SEM'] },
];

function candidates(card) {
  const desc = [card.description, card.descriptionHtml].filter(Boolean).join('\n');
  const title = card.title || '';

  const url = LINEITEM_URL.exec(desc);
  if (url) return { tier: 'url', lineitemId: url[1] };

  const descWo = DESC_WO.exec(desc);
  if (descWo) return { tier: 'desc-wo', wo: descWo[1].trim() };

  const titleWo = TITLE_WO.exec(title);
  if (titleWo) return { tier: 'title-wo', wo: titleWo[1] };

  return null;
}

// ─── Disambiguation ─────────────────────────────────────────────────────────

function productText(li) {
  return [li.displayName, li.product, li.campaignName, ...(li.subProduct || [])]
    .filter(Boolean).join(' ').toUpperCase();
}

// Score a line item by how many of the title's product hints it carries. Returns
// the single best candidate, or null when nothing separates them.
function disambiguate(title, items) {
  if (items.length === 1) return { pick: items[0], how: 'single' };

  const hay = (title || '').toUpperCase();
  const wanted = PRODUCT_HINTS.filter(h => hay.includes(h.token));
  if (!wanted.length) return { pick: null, how: 'ambiguous-no-hint' };

  const scored = items.map(li => {
    const text = productText(li);
    return { li, score: wanted.filter(h => h.matches.some(m => text.includes(m))).length };
  });
  const best = Math.max(...scored.map(s => s.score));
  if (best === 0) return { pick: null, how: 'ambiguous-no-hint-match' };

  const winners = scored.filter(s => s.score === best);
  if (winners.length > 1) return { pick: null, how: 'ambiguous-tied' };
  return { pick: winners[0].li, how: 'product-tiebreak' };
}

// ─── Lumina lookups (cached; sequential — never burst) ──────────────────────

const woCache = new Map();

const sleep = ms => new Promise(r => setTimeout(r, ms));

// A batch run RECORDS its answer instead of letting a human retry, so a transient
// 5xx must never be written down as "no match". Retry with backoff, and if it
// still fails, say so — `lookup-failed` is a re-runnable state, `not-found` isn't.
// A 429 means "you're going too fast", so it needs a materially longer wait than
// a transient 5xx — a sub-second retry just burns another request. Lumina asked us
// to go easy on their Mongo (see lumina.js), so we back off in seconds, not ms.
async function withRetry(fn, attempts = 5) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === attempts - 1) break;
      const throttled = /\b429\b/.test(err.message || '');
      await sleep(throttled ? 3000 * 2 ** i : 500 * 2 ** i);
    }
  }
  throw lastErr;
}

// Steady pace between cards. Cheap insurance: the run is minutes either way, and
// a 429 storm costs far more than the delay.
const PACE_MS = Number(arg('pace')) || 150;

async function lookupWo(wo) {
  const key = wo.toUpperCase();
  if (woCache.has(key)) return woCache.get(key);
  let out;
  try {
    // One exact filter, errors surfaced. Sequential across CARDS so we never
    // burst Lumina's Mongo.
    out = { items: await withRetry(() => lumina.lineItemsByWo(wo, 25)) };
  } catch (err) {
    out = { error: err.message, items: [] };
  }
  woCache.set(key, out);
  return out;
}

// Distinguishes the three outcomes: a line item, a clean "no longer resolves"
// (Lumina answers 200 {found:false}), or an upstream failure.
async function lookupLineItem(id) {
  try {
    const snap = await withRetry(() => lumina.lineItemSnapshot(id));
    return { lineItem: snap && snap.lineItem ? snap.lineItem : null };
  } catch (err) {
    return { lineItem: null, error: err.message };
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

function arg(name) {
  const hit = process.argv.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
}
const APPLY = process.argv.includes('--apply');
const RELINK = process.argv.includes('--relink');
const BOARD = arg('board');
const LIMIT = Number(arg('limit')) || 0;

function progress(done, total, label) {
  const pct = total ? Math.round((done / total) * 100) : 100;
  const filled = Math.floor(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  process.stdout.write(`\r  [${bar}] ${pct}% (${done}/${total}) ${label}`.slice(0, 110).padEnd(112));
}

// Undo one --apply run, using the cardIds the report recorded. Deliberately NOT a
// blanket `$unset lumina` over the board: that would also wipe links buyers
// attached by hand in the drawer. We only touch cards this script linked, and only
// if the link still matches what we wrote (so a later manual change wins).
async function revert(reportPath) {
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  if (!report.applied) {
    console.error(`${reportPath} is a dry-run report — it never wrote anything.`);
    process.exit(1);
  }
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  let unset = 0;
  let changed = 0;
  for (const l of report.linked) {
    const res = await db.collection('cards').updateOne(
      { _id: new ObjectId(l.cardId), 'lumina.lineitemId': l.lineitemId },
      { $set: { lumina: null, updatedAt: new Date() } },
    );
    if (res.modifiedCount) unset++; else changed++;
  }
  console.log(`\nReverted ${unset} of ${report.linked.length} links.`);
  if (changed) console.log(`  ${changed} left alone (link changed since the run — not ours to undo).`);
  await client.close();
}

// --board takes either the Mongo board _id (24-hex) or the Asana project GID (digits),
// because those are easy to confuse and you're usually holding the Asana one — it's
// what you passed to asana-migrate. Anything unresolvable prints the boards that DO
// exist rather than a raw BSONError.
async function resolveBoard(db, value) {
  const boards = await db.collection('boards')
    .find({}, { projection: { name: 1, asanaProjectGid: 1 } }).toArray();

  const match = /^[a-f0-9]{24}$/i.test(value)
    ? boards.find(b => String(b._id) === value)
    : boards.find(b => String(b.asanaProjectGid) === String(value));

  if (!match) {
    console.error(`\nNo board matches --board=${value}.`);
    if (/^\d+$/.test(value)) {
      console.error('That looks like an Asana project GID; no board here was imported from it.');
      console.error('Run asana-migrate.js + asana-seed.js for that project first.');
    }
    console.error('\nBoards that exist:');
    for (const b of boards) {
      console.error(`  ${b._id}  ${b.name}${b.asanaProjectGid ? `  (asana ${b.asanaProjectGid})` : ''}`);
    }
    process.exit(1);
  }
  console.log(`Board: ${match.name} (${match._id})`);
  return match._id;
}

async function main() {
  const revertFrom = arg('revert');
  if (revertFrom) return revert(revertFrom);

  if (!lumina.configured()) {
    console.error('Lumina API is not configured (LUMINA_API_ENV/token vars) — nothing to match against.');
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db();

  const query = {};
  if (BOARD) query.boardId = await resolveBoard(db, BOARD);
  if (!RELINK) query['lumina.lineitemId'] = { $in: [null, undefined] };

  let cards = await db.collection('cards')
    .find(query, { projection: { title: 1, description: 1, descriptionHtml: 1, lumina: 1, boardId: 1 } })
    .toArray();

  // Only the cards that actually carry an identifier are worth a lookup.
  const work = [];
  let noId = 0;
  for (const card of cards) {
    const cand = candidates(card);
    if (cand) work.push({ card, cand }); else noId++;
  }
  const todo = LIMIT ? work.slice(0, LIMIT) : work;

  console.log(`\nLumina match ${APPLY ? '(APPLY — will write)' : '(dry run)'}`);
  console.log(`  cards considered : ${cards.length}${BOARD ? ` (board ${BOARD})` : ''}`);
  console.log(`  with identifier  : ${work.length}   without: ${noId}`);
  console.log(`  looking up       : ${todo.length}\n`);

  const stats = { url: 0, 'desc-wo': 0, 'title-wo': 0 };
  const linked = [];
  const skipped = [];
  let done = 0;

  for (const { card, cand } of todo) {
    progress(++done, todo.length, card.title || '');
    if (done > 1) await sleep(PACE_MS);

    let li = null;
    let how = cand.tier;

    if (cand.tier === 'url') {
      const res = await lookupLineItem(cand.lineitemId);
      if (res.error) {
        skipped.push({ ...ref(card), tier: cand.tier, id: cand.lineitemId, reason: 'lookup-failed', error: res.error });
        continue;
      }
      if (!res.lineItem) {
        // 200 {found:false} — the pasted link no longer resolves (deleted, or
        // outside the SEM cohort). Not an error, just unmatchable.
        skipped.push({ ...ref(card), tier: cand.tier, id: cand.lineitemId, reason: 'url-unresolved' });
        continue;
      }
      li = res.lineItem;
    } else {
      const res = await lookupWo(cand.wo);
      if (res.error) {
        skipped.push({ ...ref(card), tier: cand.tier, wo: cand.wo, reason: 'lookup-failed', error: res.error });
        continue;
      }
      if (!res.items.length) {
        skipped.push({ ...ref(card), tier: cand.tier, wo: cand.wo, reason: 'wo-not-found' });
        continue;
      }
      const { pick, how: reason } = disambiguate(card.title, res.items);
      if (!pick) {
        skipped.push({
          ...ref(card), tier: cand.tier, wo: cand.wo, reason,
          options: res.items.map(i => ({ lineitemId: i.lineitemId, campaignName: i.campaignName, product: i.product, status: i.status })),
        });
        continue;
      }
      li = pick;
      how = `${cand.tier}/${reason}`;
    }

    const link = {
      lineitemId: String(li.lineitemId),
      advertiserId: li.advertiserId ? String(li.advertiserId) : null,
      name: li.campaignName || li.companyName || '',
      attachedAt: new Date(),
    };

    if (APPLY) {
      await db.collection('cards').updateOne(
        { _id: card._id },
        { $set: { lumina: link, updatedAt: new Date() } },
      );
    }
    stats[cand.tier]++;
    linked.push({ ...ref(card), how, ...link });
  }

  process.stdout.write('\r'.padEnd(112) + '\r');

  const byReason = {};
  for (const s of skipped) byReason[s.reason] = (byReason[s.reason] || 0) + 1;

  console.log(`\nLinked ${linked.length} / ${todo.length}`);
  console.log(`  by pasted URL   : ${stats.url}`);
  console.log(`  by WO (desc)    : ${stats['desc-wo']}`);
  console.log(`  by WO (title)   : ${stats['title-wo']}`);
  console.log(`\nSkipped ${skipped.length}:`);
  for (const [reason, n] of Object.entries(byReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason.padEnd(24)} ${n}`);
  }

  const out = reportFile(APPLY);
  fs.writeFileSync(out, JSON.stringify({
    ranAt: new Date().toISOString(), applied: APPLY, board: BOARD || null,
    counts: { considered: cards.length, withIdentifier: work.length, linked: linked.length, skipped: skipped.length, byTier: stats, byReason },
    linked, skipped,
  }, null, 2));
  console.log(`\nReport → ${out}`);
  if (APPLY) console.log(`Undo this run:\n  node migration/lumina-match.js --revert=${out}\n`);
  else console.log('Dry run — nothing written. Re-run with --apply to link.\n');

  await client.close();
}

function ref(card) {
  return { cardId: String(card._id), title: card.title || '' };
}

main().catch(err => { console.error('\n', err); process.exit(1); });
