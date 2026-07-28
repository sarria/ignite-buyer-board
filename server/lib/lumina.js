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
  || 'https://release11.townsquarelumina.com/lumina/orders/api/ignite/ext';
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

// Upstream `?name=` searches campaign name + company name. Buyers also search by
// WO number, which `name` does NOT cover, so we fire the exact WO filter too and
// merge — cheap (two small queries) and it means one box handles both.
async function searchLineItems(q, limit = 20) {
  const term = (q || '').trim();
  if (!term) {
    const page = await call('/sem/lineitems', { limit });
    return (page.items || []).map(withUrl);
  }

  const queries = [call('/sem/lineitems', { name: term, limit })];
  if (/^[A-Za-z0-9-]{3,}$/.test(term)) {
    queries.push(call('/sem/lineitems', { woOrderNumber: term, limit }));
  }
  const pages = await Promise.all(queries.map(p => p.catch(() => ({ items: [] }))));

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
  configured, searchLineItems, searchAdvertisers,
  lineItemSnapshot, advertiserSnapshot, fieldCatalog, FALLBACK_CATALOG,
};
