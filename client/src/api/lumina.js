import api from './client';

export const luminaStatus = () => api.get('/lumina/status').then(r => r.data);

// Ask the server to pre-load its advertiser-search cache. Returns immediately —
// the pull happens server-side in the background. Safe to call repeatedly.
export const warmLumina = () => api.get('/lumina/status', { params: { warm: 1 } });

export const searchLuminaAdvertisers = (q, limit = 20) =>
  api.get('/lumina/advertisers', { params: { q, limit } }).then(r => r.data.items);

// Live snapshot: { advertiser, lineItems, fetchedAt }
export const getLuminaAdvertiser = (id) =>
  api.get(`/lumina/advertisers/${id}`).then(r => r.data);

// Line items — what a card actually links to.
export const searchLuminaLineItems = (q, limit = 20) =>
  api.get('/lumina/lineitems', { params: { q, limit } }).then(r => r.data.items);

// Live snapshot: { lineItem, advertiser, url, fetchedAt }
export const getLuminaLineItem = (id) =>
  api.get(`/lumina/lineitems/${id}`).then(r => r.data);
