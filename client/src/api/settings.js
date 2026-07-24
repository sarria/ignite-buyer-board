import api from './client';

// The Lumina field selection is read on every card open, so cache it for the tab
// (same idea as boardCache). Saving/resetting refreshes the cache in place, so an
// admin sees their change immediately without a reload.
let cached = null;

export const getLuminaFieldSettings = () => {
  if (!cached) {
    cached = api.get('/settings/lumina-fields')
      .then(r => r.data)
      .catch(err => { cached = null; throw err; }); // don't cache a failure
  }
  return cached;
};

export const saveLuminaFieldSettings = (advertiserFields, lineItemFields) =>
  api.put('/settings/lumina-fields', { advertiserFields, lineItemFields })
    .then(r => { cached = Promise.resolve(r.data); return r.data; });

export const resetLuminaFieldSettings = () =>
  api.delete('/settings/lumina-fields')
    .then(r => { cached = Promise.resolve(r.data); return r.data; });
