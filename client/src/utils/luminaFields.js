// Labels + value formatting for Lumina's line-item document, shared by the card
// panel and the admin field-picker so the two can never drift.
// Field names follow Lumina's 2026-07-27 API (everything was renamed then).

export const LUMINA_LABELS = {
  // identity
  lineitemId: 'Line Item ID', orderId: 'Order ID', advertiserId: 'Advertiser ID',
  tapLineitemId: 'TAP Line Item ID',
  woOrderNumber: 'WO Number', woLineItemNumbers: 'WO Line Item Number(s)',
  // campaign
  campaignName: 'Campaign Name', campaignInitiative: 'Campaign Initiative',
  type: 'Type', campaignType: 'Campaign Type', status: 'Status',
  workflowStepName: 'Workflow Step', market: 'Market',
  sensitiveCatCampaign: 'Sensitive Category',
  // product
  product: 'Product', subProduct: 'Sub Product', displayName: 'Display Name',
  platforms: 'Platforms', kpi: 'KPI', goalType: 'Goal Type', objective: 'Objective',
  // dates
  startDate: 'Start Date', endDate: 'End Date',
  orderStartDate: 'Order Start Date', orderEndDate: 'Order End Date',
  createdDate: 'Created',
  // budget
  totalBudget: 'Total Budget', adjustedTotalBudget: 'Adjusted Total Budget',
  contractedBudget: 'Contracted Budget', monthlyBudget: 'Monthly Budget',
  includeMakeGood: 'Include Make Good / Added Value',
  includeRateException: 'Include Rate Exception',
  // targeting
  geoTargetingType: 'Geo Targeting Type', states: 'States', cities: 'Cities',
  zipcodes: 'Zip Codes', isExclusion: 'Exclusion', exclusionDetails: 'Exclusion Details',
  needRadius: 'Radius Needed',
  // google
  gtmAccount: 'GTM Email Address', gtmContainerId: 'GTM Container ID',
  gaEmail: 'GA Email', gaId: 'GA ID', googleAdsAcc: 'Google Ads Account',
  linkToGBP: 'Link to GBP', linkedGBP: 'Linked GBP', emailGBP: 'GBP Email',
  trackCallComplGBP: 'Track Call Completions (GBP)',
  // team — Lumina's own UI labels these AE / DSM / DCM / Buyer
  aeUsernameDisplay: 'AE', dslUsernameDisplay: 'DSM',
  dcmUsernameDisplay: 'DCM', buyerSearchUsernameDisplay: 'Buyer',
  // advertiser / order
  companyName: 'Advertiser', advertiserName: 'Advertiser Name',
  companySlug: 'Slug', orderName: 'Order Name', advertiserRegion: 'Region',
  markets: 'Markets', reportingStatus: 'Reporting Status',
  advertiserGroupSlugs: 'Advertiser Groups',
  buildDetails: 'Build Details', buildReport: 'Build Report',
  additionalDetails: 'Additional Details',
};

export const luminaLabel = k =>
  LUMINA_LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

// Internals and duplicates we never show: audit trails, upload blobs, and the raw
// *Username keys (we render the matching *UsernameDisplay instead).
export const LUMINA_HIDDEN = new Set([
  'deepLinkPath', 'url', 'statusHistory', 'stepHistory',
  'createdBy', 'modifiedBy', 'modifiedDate', 'firstLuminaEditDate',
  'formValidationComplete', 'budgetFlightingDetailsUpload', 'uploadRateException',
  'aeUsername', 'dslUsername', 'dcmUsername', 'buyerSearchUsername',
]);

const isDateKey = k => /date$/i.test(k);
const isMoneyKey = k => /budget$/i.test(k);

const money = n => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const day = v => {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString();
};

// Lumina returns people as { username, fullName, accountName } — show the name.
const personName = v =>
  (v && typeof v === 'object' && (v.fullName || v.accountName || v.username)) || null;

// Returns a string for scalars, or null when the value needs custom rendering
// (nested objects like buildDetails, which the panel expands into sub-rows).
export function formatLuminaValue(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) {
    if (!v.length) return '—';
    const parts = v.map(x => personName(x) || (typeof x === 'object' ? null : String(x)));
    return parts.every(Boolean) ? parts.join(', ') : null;
  }
  if (typeof v === 'object') return personName(v);   // null → caller expands it
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (isMoneyKey(key) && typeof v === 'number') return money(v);
  if (isDateKey(key)) return day(v);
  return String(v);
}

// Sparse fields, flagged in the picker so admins know a row may look blank.
export const LUMINA_SPARSE = {
  subProduct: 'not set on some line items',
  monthlyBudget: 'only on flighted budgets',
};

// null/undefined selection means "not configured → show everything".
export const luminaFieldFilter = selection =>
  (selection == null ? null : new Set(selection));
