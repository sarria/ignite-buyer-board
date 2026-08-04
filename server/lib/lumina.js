'use strict';

// Lumina SEM API client (read-only, server-to-server).
// The service token is a secret — it never leaves the server; the browser talks
// only to our own /api/lumina/* routes.
//
// NOTE (2026-07-27): rewritten for Lumina's new API. Every field was renamed
// (luminaAdvertiserId → advertiserId, luminaLineitemId → lineitemId,
// luminaCampaignName → campaignName, woNumber → woOrderNumber, …) and two things
// changed the design:
//   1. Both list endpoints now support `?name=` (case-insensitive contains), so we
//      NO LONGER cache the cohort in memory — search runs upstream. That also
//      retires the "search at scale" problem we had deferred.
//   2. `GET /sem/lineitems/:id` returns the full order-form document (~75 fields:
//      budget, dates, KPI, geo, team, GTM, build details). That is the card read
//      path; the list is only for the attach dropdown.

const BASE = process.env.LUMINA_API_BASE
  // Default to PRODUCTION. It used to default to release11, whose data was frozen
  // ~2026-05-22 — every line item created after that answered {found:false}, so new
  // campaigns silently couldn't be viewed or attached. A missing env var must not
  // land you back in that state. Note release and production need DIFFERENT tokens.
  || 'https://townsquarelumina.com/lumina/orders/api/ignite/ext';
const TOKEN = process.env.LUMINA_API_TOKEN;

// Web (not API) host. Lumina hands us a relative `deepLinkPath` per line item, so
// we only supply the host — no segment logic on our side.
const WEB_BASE = process.env.LUMINA_WEB_BASE || 'https://www.townsquarelumina.com';

// Lumina asked us to page at ~100 rather than the documented max of 1000, to go
// easy on their Mongo. Sequential only — never a parallel burst.
const PAGE = 100;

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
    err.status = 502;
    err.code = 'LUMINA_UPSTREAM';
    throw err;
  }
  return res.json();
}

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

const withUrl = li => (li?.deepLinkPath ? { ...li, url: WEB_BASE + li.deepLinkPath } : li);

// ---- attach dropdown ------------------------------------------------------

// One search box, several upstream filters. `?name=` only covers campaign name +
// company name, so anything else a buyer might paste needs its own exact-match
// query; we fire every applicable one in parallel and merge.
//
// TO ADD A SEARCH FIELD: append an entry here. `param` must be a filter Lumina
// actually honours (guide §3 — unknown params are ignored silently, so a typo
// looks like "no results" rather than an error). Keep the list ordered most
// precise first: results are merged in that order, so an exact hit outranks a
// name match.
const OBJECT_ID = /^[a-f0-9]{24}$/i;

// Buyers paste the whole Lumina URL as often as the id itself.
const idFrom = term => {
  const fromUrl = term.match(/\/lineitem\/[^/]+\/([a-f0-9]{24})/i);
  if (fromUrl) return fromUrl[1];
  return OBJECT_ID.test(term) ? term : null;
};

const LINE_ITEM_SEARCHES = [
  { param: 'lineitemId', value: idFrom },
  { param: 'advertiserId', value: t => (OBJECT_ID.test(t) ? t : null) },
  // WO numbers aren't always numeric ("EGL19483", "TD MORRIS006"), so allow
  // letters and spaces — just not free text long enough to be a name.
  { param: 'woOrderNumber', value: t => (/^[A-Za-z0-9][A-Za-z0-9 _-]{1,23}$/.test(t) ? t : null) },
  { param: 'name', value: t => (t.length >= 2 ? t : null) },
];

async function searchLineItems(q, limit = 20) {
  const term = (q || '').trim();
  if (!term) {
    const page = await call('/sem/lineitems', { limit });
    return (page.items || []).map(withUrl);
  }

  const applicable = LINE_ITEM_SEARCHES
    .map(({ param, value }) => ({ param, v: value(term) }))
    .filter(({ v }) => v);

  // One failing filter must not sink the whole search.
  const pages = await Promise.all(applicable.map(({ param, v }) =>
    call('/sem/lineitems', { [param]: v, limit }).catch(() => ({ items: [] }))
  ));

  const seen = new Set();
  const merged = [];
  for (const page of pages) {
    for (const li of page.items || []) {
      if (seen.has(li.lineitemId)) continue;
      seen.add(li.lineitemId);
      merged.push(withUrl(li));
    }
  }
  return merged.slice(0, limit);
}

// Exact WO-order-number lookup. Unlike searchLineItems this fires ONE filter and
// lets upstream errors throw: batch callers (migration/lumina-match.js) must be
// able to tell "Lumina is unhappy" from "this WO doesn't exist", because they
// record the answer instead of letting a human retry. Also skips the `?name=`
// filter, so a bare numeric WO can't pull in an unrelated campaign by name.
async function lineItemsByWo(wo, limit = 25) {
  const term = String(wo || '').trim();
  if (!term) return [];
  const page = await call('/sem/lineitems', { woOrderNumber: term, limit });
  return (page.items || [])
    .filter(li => String(li.woOrderNumber || '').toUpperCase() === term.toUpperCase())
    .map(withUrl);
}

async function searchAdvertisers(q, limit = 20) {
  const page = await call('/sem/advertisers', { name: (q || '').trim() || undefined, limit });
  return page.items || [];
}

// ---- card read path -------------------------------------------------------

// The full order-form document for one line item. Lumina answers 200 with
// { found: false } for an unknown id OR one outside the SEM cohort — that is not
// an error, it's "this link no longer resolves", so we surface it as null.
async function lineItemSnapshot(id) {
  const res = await call(`/sem/lineitems/${encodeURIComponent(id)}`);
  if (!res.found || !res.lineitem) return null;
  return { lineItem: withUrl(res.lineitem), fetchedAt: new Date().toISOString() };
}

// Legacy: cards linked before we moved to line items hold only an advertiserId.
async function advertiserSnapshot(id) {
  const [advPage, lineItems] = await Promise.all([
    call('/sem/advertisers', { advertiserId: id, limit: 1 }),
    fetchAll('/sem/lineitems', { advertiserId: id }),
  ]);
  const advertiser = (advPage.items || [])[0] || null;
  if (!advertiser && !lineItems.length) return null;
  return {
    advertiser,
    lineItems: lineItems.map(withUrl),
    fetchedAt: new Date().toISOString(),
  };
}

// ---- field catalog (for the admin picker) ---------------------------------

// The detail payload is a DOCUMENT, not a fixed schema — its field set varies by
// product. So the catalog is discovered: sample one line item per product and
// union their keys. Cached for an hour; falls back to the list-endpoint keys if
// Lumina is unreachable, so the picker still renders.
const PRODUCTS = ['SEM', 'SEM/Spark', 'Spark'];
const FALLBACK_CATALOG = [
  'campaignName', 'campaignInitiative', 'product', 'subProduct', 'displayName',
  'status', 'market', 'companyName', 'startDate', 'endDate', 'totalBudget',
  'woOrderNumber', 'woLineItemNumbers', 'lineitemId', 'orderId', 'advertiserId',
];
// Optional fields that only appear on records using them, so sampling misses
// them (geo targeting in particular varies per line item). Cards still show any
// field Lumina returns — the setting is a hide-list — but these need to be in the
// catalog to be *selectable* in the admin picker.
const KNOWN_OPTIONAL = [
  'states', 'cities', 'zipcodes', 'counties', 'countries', 'dmas',
  'geoRadius', 'exclusionDetails', 'monthlyBudget', 'makeGoodBudget',
  'partnerRetailBudget', 'budgetFlightingDetails', 'goalType', 'objective',
  'buildReport', 'additionalDetails', 'creativeInstructions',
];
const CATALOG_TTL_MS = 60 * 60 * 1000;
let catalogCache = { at: 0, keys: null, promise: null };

// Sample several line items per product, not one: optional fields (states,
// zipcodes, creativeInstructions, exclusionDetails…) only appear on records that
// use them, and a one-record sample silently omits them from the picker.
const SAMPLES_PER_PRODUCT = 5;

async function sampleCatalog() {
  const keys = new Set();
  for (const product of PRODUCTS) {
    try {
      const page = await call('/sem/lineitems', { product, limit: SAMPLES_PER_PRODUCT });
      for (const row of page.items || []) {
        try {
          const detail = await call(`/sem/lineitems/${row.lineitemId}`);
          if (detail.found) Object.keys(detail.lineitem).forEach(k => keys.add(k));
        } catch { /* skip this record */ }
      }
    } catch { /* one product failing shouldn't empty the catalog */ }
  }
  return [...keys].sort();
}

async function fieldCatalog() {
  if (catalogCache.keys && Date.now() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.keys;
  if (catalogCache.promise) return catalogCache.promise;

  catalogCache.promise = (async () => {
    const keys = await sampleCatalog();
    const result = keys.length
      ? [...new Set([...keys, ...KNOWN_OPTIONAL])].sort()
      : FALLBACK_CATALOG;
    catalogCache = { at: Date.now(), keys: result, promise: null };
    return result;
  })();
  try {
    return await catalogCache.promise;
  } catch {
    catalogCache.promise = null;
    return FALLBACK_CATALOG;
  }
}

module.exports = {
  configured, searchLineItems, lineItemsByWo, searchAdvertisers,
  lineItemSnapshot, advertiserSnapshot, fieldCatalog, FALLBACK_CATALOG,
};
