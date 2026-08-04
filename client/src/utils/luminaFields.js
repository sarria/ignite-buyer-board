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
  sensitiveCatCampaign: 'This campaign falls into a sensitive category',
  // product
  product: 'Product', subProduct: 'Sub Product', displayName: 'Line Item Display Name',
  platforms: 'Platform Name', kpi: 'KPI', goalType: 'Goal Type', objective: 'Objective',
  // Lumina's Product section shows this free-text row right under KPI when the KPI
  // is "Other" (e.g. "Site Traffic / Landing Page Views").
  other: 'Other (KPI detail)',
  // Lumina's "Tactic" row is tacticTypeSpecial; `tactics` holds the per-tactic
  // campaign names it lists under Traffic > Campaign Names.
  tacticTypeSpecial: 'Tactic', tactics: 'Campaign Names',
  // dates
  startDate: 'Start Date', endDate: 'End Date',
  orderStartDate: 'Order Start Date', orderEndDate: 'Order End Date',
  createdDate: 'Created',
  // budget
  totalBudget: 'Total Budget', adjustedTotalBudget: 'Adjusted Total Budget',
  contractedBudget: 'Contracted Budget', monthlyBudget: 'Monthly Budget',
  includeMakeGood: 'Include Make Good or Added Value Budget',
  includeRateException: 'Include Rate Exception?',
  makeGoodBudget: 'Make Good Budget', partnerRetailBudget: 'Partner Retail Budget',
  budgetFlightingDetails: 'Budget Flighting',
  // targeting
  geoTargetingType: 'Type', states: 'States', cities: 'Cities',
  zipcodes: 'Zip Codes', isExclusion: 'Exclude any geos?',
  exclusionDetails: 'Exclusion Details',
  needRadius: 'Do you need to add a radius?', geoRadius: 'Radius',
  // google
  gtmAccount: 'GTM Email Address', gtmContainerId: 'GTM Container ID',
  gaEmail: 'GA Email', gaId: 'GA ID', googleAdsAcc: 'Use their Google Ads account?',
  linkToGBP: 'Link to their GBP?', linkedGBP: 'Linked GBP', emailGBP: 'GBP Email',
  trackCallComplGBP: 'Track Call Completions (GBP)',
  // team — Lumina's own UI labels these AE / DSM / DCM / Buyer
  aeUsernameDisplay: 'AE', dslUsernameDisplay: 'DSM',
  dcmUsernameDisplay: 'DCM', buyerSearchUsernameDisplay: 'Buyer',
  buyerProgrammaticUsernameDisplay: 'Buyer (Programmatic)',
  buyerSocialUsernameDisplay: 'Buyer (Social)',
  creativeDirectorUsernameDisplay: 'Creative Director', designerUsernameDisplay: 'Designer',
  contentProducerUsernameDisplay: 'Content Producer',
  contestProducerUsernameDisplay: 'Contest Producer',
  // advertiser / order
  companyName: 'Advertiser', advertiserName: 'Advertiser Name',
  companySlug: 'Slug', orderName: 'Order Name', advertiserRegion: 'Region',
  markets: 'Markets', reportingStatus: 'Reporting Status',
  advertiserGroupSlugs: 'Advertiser Groups',
  buildDetails: 'Build Details', buildReport: 'Build Report',
  uploadBuildReport: 'Build Report Upload',
  housingEmplCredit: 'Housing / Employment / Credit',
  recruitmentCampaign: 'Recruitment Campaign',
  additionalDetails: 'Additional Details',
  isCreative: 'Is there a Creative Request for this Line Item?',
  creativeInstructions: 'Creative Instructions',
  // buildDetails sub-fields - Lumina spells these out as questions on the form
  advertiserUrl: 'Advertiser URL', advertiserNumber: 'Advertiser phone number',
  semEstimateServices: 'Services the client offers and intends to advertise',
  servicesNotToAdvertise: 'Services they do NOT want to advertise?',
  semEstimateCustomKeywords: 'Custom Keywords to Include',
  semEstimateBranded: 'Include Branded keywords?',
  existingEstimate: 'Do you have an existing estimate?',
  allowSparkDetermineLandingPages: 'Allow Spark to determine landing pages?',
  fixedLandingPage: 'Fixed Landing Page', doYouHaveLogo: 'Do you have a logo to upload?',
};

export const luminaLabel = k =>
  LUMINA_LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

// Internals and duplicates we never show: audit trails, upload blobs, and the raw
// *Username keys (we render the matching *UsernameDisplay instead).
export const LUMINA_HIDDEN = new Set([
  'deepLinkPath', 'url', 'statusHistory', 'stepHistory',
  'createdBy', 'modifiedBy', 'modifiedDate', 'firstLuminaEditDate',
  'formValidationComplete', 'uploadRateException',
  'aeUsername', 'dslUsername', 'dcmUsername', 'buyerSearchUsername',
  // Uploads come back as bare ObjectIds with no download URL, so there is nothing
  // useful to render. Lumina's own page shows "(Uploaded: <date>)" plus a link -
  // matching that needs a file URL from them.
  'uploadBuildReport', 'budgetFlightingDetailsUpload', 'uploadCreative',
  // Exact duplicates of a field we already show, on every record checked:
  'campaignType',        // == type
  'workflowStepName',    // == status
  'advertiserName',      // == companyName
  'tacticDetails',       // == tactics
]);

const isDateKey = k => /date$/i.test(k);
const isMoneyKey = k => /budget$/i.test(k);

const money = n => `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
// Lumina prints MM/DD/YYYY (zero-padded) - match it so the two read the same.
//
// UTC getters, NOT local. Lumina's dates are calendar dates at UTC midnight
// (`2025-01-01T00:00:00.000Z`), so local getters print the previous day west of
// Greenwich: a campaign Lumina's own page showed starting 01/01/2025 rendered here as
// 12/31/2024. Same class of bug as card due dates - see utils/dueDate.
const day = v => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const p = n => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())}/${d.getUTCFullYear()}`;
};

// Lumina returns people as { username, fullName, accountName } — show the name.
const personName = v =>
  (v && typeof v === 'object' && (v.fullName || v.accountName || v.username)) || null;

// Returns a string for scalars, or null when the value needs custom rendering
// (nested objects like buildDetails, which the panel expands into sub-rows).
export function formatLuminaValue(key, v) {
  if (v === null || v === undefined || v === '') return '—';
  // `tactics` is keyed by tactic ({semPmax: {campaignName}, ...}); Lumina lists the
  // campaign names, so flatten to those instead of dumping the object.
  if (key === 'tactics' && typeof v === 'object' && !Array.isArray(v)) {
    const names = Object.values(v).map(t => t && t.campaignName).filter(Boolean);
    return names.length ? names.join('\n') : '—';
  }
  if (Array.isArray(v)) {
    if (!v.length) return '—';
    const parts = v.map(x => personName(x) || (typeof x === 'object' ? null : String(x)));
    return parts.every(Boolean) ? parts.join(', ') : null;
  }
  if (typeof v === 'object') return personName(v);   // null → caller expands it
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (isMoneyKey(key) && typeof v === 'number') return money(v);
  if (isDateKey(key)) return day(v);
  // Lumina's data carries stray whitespace on some values (e.g. ' GTM-…').
  return typeof v === 'string' ? v.trim() : String(v);
}

// Section order mirrors the left-hand nav on Lumina's own line-item page (Product,
// Campaign, Ignite Team, Platform, Build Report, Google, Budget, Geo Targeting,
// Build Details, Additional), with two of ours at the end for the ids and parent
// records the form doesn't show. Used by BOTH the card panel and the admin picker,
// so they always group the same way.
//
// This is a display ORDER, not a schema — the payload is a document whose field set
// varies by product. Anything not listed here lands in "Other", so fields Lumina
// adds later still appear.
export const LUMINA_SECTIONS = [
  ['Product', ['product', 'subProduct', 'tacticTypeSpecial', 'objective', 'kpi',
    'goalType', 'other', 'tactics']],
  ['Campaign', ['campaignName', 'campaignInitiative', 'type', 'campaignType', 'status',
    'workflowStepName', 'startDate', 'endDate', 'market', 'woOrderNumber',
    'woLineItemNumbers', 'sensitiveCatCampaign', 'housingEmplCredit',
    'recruitmentCampaign']],
  ['Ignite Team', ['aeUsernameDisplay', 'dslUsernameDisplay', 'dcmUsernameDisplay',
    'buyerSearchUsernameDisplay', 'buyerProgrammaticUsernameDisplay',
    'buyerSocialUsernameDisplay', 'creativeDirectorUsernameDisplay',
    'designerUsernameDisplay', 'contentProducerUsernameDisplay',
    'contestProducerUsernameDisplay']],
  ['Platform', ['platforms', 'displayName']],
  ['Build Report', ['buildReport', 'uploadBuildReport']],
  ['Google', ['gtmAccount', 'gtmContainerId', 'gaEmail', 'gaId',
    'linkToGBP', 'linkedGBP', 'emailGBP', 'trackCallComplGBP', 'googleAdsAcc']],
  ['Budget', ['contractedBudget', 'totalBudget', 'adjustedTotalBudget', 'monthlyBudget',
    'includeMakeGood', 'makeGoodBudget', 'partnerRetailBudget',
    'includeRateException', 'budgetFlightingDetails']],
  ['Geo Targeting', ['geoTargetingType', 'states', 'cities', 'zipcodes', 'needRadius',
    'geoRadius', 'isExclusion', 'exclusionDetails']],
  ['Build Details', ['buildDetails']],
  ['Creative', ['isCreative', 'creativeInstructions']],
  ['Additional', ['additionalDetails', 'revisionInstructions', 'revisionConfirmationSummary']],
  ['Advertiser & Order', ['companyName', 'advertiserName', 'companySlug', 'advertiserRegion',
    'orderName', 'orderStartDate', 'orderEndDate', 'createdDate']],
  ['Identifiers', ['lineitemId', 'orderId', 'advertiserId', 'tapLineitemId']],
];

const PLACED = new Set(LUMINA_SECTIONS.flatMap(([, keys]) => keys));

// Group an arbitrary key list into the sections above, dropping hidden keys and
// empty sections. Unplaced keys collect in "Other" so nothing is silently lost.
export function groupLuminaFields(keys) {
  const available = new Set(keys.filter(k => !LUMINA_HIDDEN.has(k)));
  const groups = LUMINA_SECTIONS
    .map(([title, sectionKeys]) => [title, sectionKeys.filter(k => available.has(k))])
    .filter(([, ks]) => ks.length);
  const other = [...available].filter(k => !PLACED.has(k)).sort();
  return other.length ? [...groups, ['Other', other]] : groups;
}

// Sparse fields, flagged in the picker so admins know a row may look blank.
export const LUMINA_SPARSE = {
  subProduct: 'not set on some line items',
  monthlyBudget: 'only on flighted budgets',
};

// Some Lumina values are rich text (Creative Instructions, Additional Details
// come back as HTML). Detect so the panel can render them instead of printing tags.
export const looksLikeHtml = v =>
  typeof v === 'string' && /<(p|br|div|ul|ol|li|a|strong|em|b|i)\b[^>]*>/i.test(v);
