import api from './client';

export const luminaStatus = () => api.get('/lumina/status').then(r => r.data);

export const searchLuminaAdvertisers = (q, limit = 20) =>
  api.get('/lumina/advertisers', { params: { q, limit } }).then(r => r.data.items);

// Live snapshot: { advertiser, lineItems, fetchedAt }
export const getLuminaAdvertiser = (id) =>
  api.get(`/lumina/advertisers/${id}`).then(r => r.data);

// Line items — what a card actually links to.
export const searchLuminaLineItems = (q, limit = 20) =>
  api.get('/lumina/lineitems', { params: { q, limit } }).then(r => r.data.items);

// Live snapshot: { lineItem, fetchedAt } — lineItem is the full order-form doc
export const getLuminaLineItem = (id) =>
  api.get(`/lumina/lineitems/${id}`).then(r => r.data);
