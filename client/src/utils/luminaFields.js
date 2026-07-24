// Human labels for Lumina's API keys, shared by the card panel and the admin
// field-picker so the two can never drift.

export const LUMINA_LABELS = {
  luminaAdvertiserId: 'Advertiser ID',
  luminaAdvertiserName: 'Advertiser Name',
  luminaAdvertiserSlug: 'Slug',
  luminaLineitemId: 'Line Item ID',
  luminaCampaignName: 'Campaign Name',
  advertiserType: 'Advertiser Type',
  pacingStatus: 'Pacing Status',
  product: 'Product',
  subProduct: 'Sub Product',
  woNumber: 'WO Number',
  market: 'Market',
  platform: 'Platform',
  platformAdvertiserId: 'Platform Account ID',
  platformAdvertiserName: 'Platform Account Name',
  platformParentId: 'Parent Account ID(s)',
};

export const luminaLabel = k =>
  LUMINA_LABELS[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());

// Fields Lumina often leaves empty — surfaced in the picker so admins know a
// column may look blank. Measured across the full release11 cohort (2026-07-24).
export const LUMINA_SPARSE = {
  subProduct: 'empty on ~24% of line items',
  platformParentId: 'empty on ~21% of advertisers',
};

// null/undefined selection means "not configured → show everything".
export const luminaFieldFilter = selection =>
  (selection == null ? null : new Set(selection));
