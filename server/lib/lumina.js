'use strict';

// Lumina SEM API client (read-only, server-to-server).
// The service token is a secret — it never leaves the server; the browser talks
// only to our own /api/lumina/* routes.
//
// The advertiser cohort is small (~1500 rows) and changes slowly, so we pull the
// whole list once and cache it in module memory for TTL_MS. That makes typeahead
// search instant and costs Lumina 2 requests per warm server (a serverless cold
// start re-pulls). Line items are always fetched live — they're per-advertiser
// and cheap.

const BASE = process.env.LUMINA_API_BASE
  || 'https://release11.townsquarelumina.com/lumina/orders/api/ignite/ext';
const TOKEN = process.env.LUMINA_API_TOKEN;

const TTL_MS = 10 * 60 * 1000;
// Stephen Alba (Lumina, 2026-07-24): the guide says limit=1000, but "try to do about
// 100 at a time so it's not too hard on mongo". So we page at 100, sequentially —
// never a parallel burst. Cost lands almost entirely on the one-time full-list warm
// (~16 requests); the per-card snapshot is filtered and fits in a page or two.
const PAGE = 100;

// Web (not API) host, for deep-linking a line item back into Lumina's own UI.
const WEB_BASE = process.env.LUMINA_WEB_BASE || 'https://townsquarelumina.com';

let cache = { at: 0, advertisers: null, promise: null };
let liCache = { at: 0, items: null, promise: null };

function configured() {
  return Boolean(TOKEN);
}

async function call(path, params = {}) {
  if (!TOKEN) {
    const err = new Error('Lumina is not configured (LUMINA_API_TOKEN missing)');
    err.status = 503;
    err.code = 'LUMINA_NOT_CONFIGURED';
    throw err;
  }
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) {
    const err = new Error(`Lumina ${res.status} on ${path}`);
    err.status = res.status === 401 || res.status === 403 ? 502 : 502;
    err.code = 'LUMINA_UPSTREAM';
    throw err;
  }
  return res.json();
}

// Page through a list endpoint until every record is collected.
async function fetchAll(path, params = {}) {
  const out = [];
  let skip = 0;
  for (;;) {
    const page = await call(path, { ...params, limit: PAGE, skip });
    out.push(...(page.items || []));
    skip += page.limit || PAGE;
    if (!page.total || skip >= page.total || !page.items?.length) return out;
  }
}

// One row per platform account, so a Lumina advertiser can repeat. Collapse to
// one entry per luminaAdvertiserId, keeping every platform account under it.
function dedupeAdvertisers(rows) {
  const byId = new Map();
  for (const r of rows) {
    const id = r.luminaAdvertiserId;
    if (!id) continue;
    let adv = byId.get(id);
    if (!adv) {
      adv = {
        luminaAdvertiserId: id,
        luminaAdvertiserName: r.luminaAdvertiserName,
        luminaAdvertiserSlug: r.luminaAdvertiserSlug,
        advertiserType: r.advertiserType,
        pacingStatus: r.pacingStatus,
        accounts: [],
      };
      byId.set(id, adv);
    }
    adv.accounts.push({
      platformAdvertiserId: r.platformAdvertiserId,
      platformAdvertiserName: r.platformAdvertiserName,
      platformParentId: r.platformParentId,
      advertiserType: r.advertiserType,
      pacingStatus: r.pacingStatus,
    });
  }
  return [...byId.values()].sort((a, b) =>
    (a.luminaAdvertiserName || '').localeCompare(b.luminaAdvertiserName || '')
  );
}

async function allAdvertisers({ force = false } = {}) {
  const fresh = cache.advertisers && Date.now() - cache.at < TTL_MS;
  if (fresh && !force) return cache.advertisers;
  // Collapse concurrent cold-start callers onto one upstream pull.
  if (cache.promise && !force) return cache.promise;

  cache.promise = (async () => {
    const rows = await fetchAll('/sem/advertisers');
    cache = { at: Date.now(), advertisers: dedupeAdvertisers(rows), promise: null };
    return cache.advertisers;
  })();
  try {
    return await cache.promise;
  } catch (e) {
    cache.promise = null;
    throw e;
  }
}

async function searchAdvertisers(q, limit = 20) {
  const list = await allAdvertisers();
  const term = (q || '').trim().toLowerCase();
  if (!term) return list.slice(0, limit);
  const scored = [];
  for (const a of list) {
    const name = (a.luminaAdvertiserName || '').toLowerCase();
    const acctHit = a.accounts.some(
      ac => (ac.platformAdvertiserName || '').toLowerCase().includes(term)
        || String(ac.platformAdvertiserId || '').includes(term)
    );
    const at = name.indexOf(term);
    if (at === 0) scored.push([0, a]);
    else if (at > 0) scored.push([1, a]);
    else if (acctHit || a.luminaAdvertiserId === term) scored.push([2, a]);
    if (scored.length > 400) break;
  }
  return scored.sort((x, y) => x[0] - y[0]).slice(0, limit).map(s => s[1]);
}

// Everything Lumina knows about one advertiser: the advertiser record plus all of
// its line items. This is what a card re-pulls each time it opens, so BOTH halves
// are fetched live in parallel — the cached list above is only for search, where
// a slightly stale name is harmless. (Lumina has no single-advertiser endpoint;
// you get one by filtering the list endpoint.)
async function advertiserSnapshot(id) {
  const [advRows, lineItems] = await Promise.all([
    fetchAll('/sem/advertisers', { luminaAdvertiserId: id }),
    fetchAll('/sem/lineitems', { luminaAdvertiserId: id }),
  ]);
  const advertiser = dedupeAdvertisers(advRows)[0] || null;
  return { advertiser, lineItems, fetchedAt: new Date().toISOString() };
}

// ---- line items -----------------------------------------------------------

// Deep link into Lumina's own UI for a line item. Pattern taken from the links
// buyers pasted into Asana: /lumina/view/lineitem/{sem|spark}/{luminaLineitemId}.
// TODO(lumina): confirm the canonical pattern with Stephen — a third segment
// ("beta") also appears in migrated links, and `product` can be "SEM/Spark".
function luminaUrl(lineItem) {
  if (!lineItem?.luminaLineitemId) return null;
  const seg = String(lineItem.product || '').toLowerCase() === 'spark' ? 'spark' : 'sem';
  return `${WEB_BASE}/lumina/view/lineitem/${seg}/${lineItem.luminaLineitemId}`;
}

// Same deal as the advertiser list: no name search upstream, so cache the cohort
// and filter locally. Used ONLY by the attach dropdown.
async function allLineItems({ force = false } = {}) {
  const fresh = liCache.items && Date.now() - liCache.at < TTL_MS;
  if (fresh && !force) return liCache.items;
  if (liCache.promise && !force) return liCache.promise;

  liCache.promise = (async () => {
    const items = await fetchAll('/sem/lineitems');
    liCache = { at: Date.now(), items, promise: null };
    return items;
  })();
  try {
    return await liCache.promise;
  } catch (e) {
    liCache.promise = null;
    throw e;
  }
}

// Buyers search by campaign name, but also by advertiser and WO number — a WO is
// often the only thing they have to hand.
async function searchLineItems(q, limit = 20) {
  const list = await allLineItems();
  const term = (q || '').trim().toLowerCase();
  if (!term) return list.slice(0, limit);
  const scored = [];
  for (const li of list) {
    const campaign = (li.luminaCampaignName || '').toLowerCase();
    const adv = (li.luminaAdvertiserName || '').toLowerCase();
    const wo = String(li.woNumber || '');
    if (campaign.startsWith(term) || adv.startsWith(term) || wo.startsWith(term)) scored.push([0, li]);
    else if (campaign.includes(term) || adv.includes(term) || wo.includes(term)) scored.push([1, li]);
    else if ((li.platformAdvertiserName || '').toLowerCase().includes(term)) scored.push([2, li]);
    if (scored.length > 600) break;
  }
  return scored.sort((a, b) => a[0] - b[0]).slice(0, limit).map(s => s[1]);
}

// What a card re-pulls on open once it's linked to a line item: the line item
// itself plus its parent advertiser, both live and in parallel.
async function lineItemSnapshot(id) {
  const rows = await fetchAll('/sem/lineitems', { luminaLineitemId: id });
  const lineItem = rows[0] || null;
  let advertiser = null;
  if (lineItem?.luminaAdvertiserId) {
    const advRows = await fetchAll('/sem/advertisers', { luminaAdvertiserId: lineItem.luminaAdvertiserId });
    advertiser = dedupeAdvertisers(advRows)[0] || null;
  }
  return { lineItem, advertiser, url: luminaUrl(lineItem), fetchedAt: new Date().toISOString() };
}

// The full set of keys the API returns. Verified 2026-07-24 by scanning the whole
// release11 cohort (1503 advertisers / 3343 line items): the schema is UNIFORM —
// every record carries exactly these keys, so this can safely be a fixed list.
// (What varies is whether a key is *filled*: subProduct is empty on ~24% of line
// items, advertiser platformParentId on ~21%.) If Lumina adds fields, add them
// here so they become selectable.
const FIELD_CATALOG = {
  advertiser: [
    'luminaAdvertiserName', 'luminaAdvertiserSlug', 'advertiserType', 'pacingStatus',
    'luminaAdvertiserId', 'platformAdvertiserName', 'platformAdvertiserId', 'platformParentId',
  ],
  lineItem: [
    'product', 'subProduct', 'luminaCampaignName', 'woNumber', 'market',
    'platformAdvertiserName', 'platformAdvertiserId', 'platformParentId', 'platform',
    'luminaLineitemId', 'luminaAdvertiserId', 'luminaAdvertiserName', 'advertiserType',
  ],
};

module.exports = {
  configured, searchAdvertisers, advertiserSnapshot, allAdvertisers,
  searchLineItems, lineItemSnapshot, allLineItems, luminaUrl, FIELD_CATALOG,
};
