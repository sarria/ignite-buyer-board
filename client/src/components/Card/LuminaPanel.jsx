import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, Typography, Autocomplete, TextField, IconButton, Tooltip,
  CircularProgress, Alert, Collapse,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  searchLuminaLineItems, getLuminaLineItem, getLuminaAdvertiser,
} from '../../api/lumina';
import { getLuminaFieldSettings } from '../../api/settings';

import LuminaSnapshot from './LuminaSnapshot';

// A card links to a Lumina LINE ITEM — that's the unit buyers work on and what
// Lumina deep-links to. We store only its id and re-pull the full order-form
// document (~75 fields) live every time the card opens, and surface Lumina's own
// `deepLinkPath` so nobody has to go find the link. The fetch is fire-and-forget
// on mount — the rest of the card renders immediately and this box fills in when
// Lumina answers.
// Cards linked before this change hold only an advertiserId; they still render
// (advertiser view) until re-linked to a line item.

function AttachSearch({ onAttach }) {
  const [input, setInput] = useState('');
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const items = await searchLuminaLineItems(input);
        if (reqId.current === id) setOptions(items);
      } catch {
        if (reqId.current === id) setOptions([]);
      } finally {
        if (reqId.current === id) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [input]);

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
    <Autocomplete
      size="small"
      sx={{ flex: 1 }}
      options={options}
      loading={loading}
      filterOptions={x => x} // server already searched/ranked
      getOptionLabel={o => o.campaignName || o.companyName || o.lineitemId}
      isOptionEqualToValue={(o, v) => o.lineitemId === v.lineitemId}
      onInputChange={(_, v) => setInput(v)}
      onChange={(_, v) => v && onAttach(v)}
      noOptionsText="No matching line item"
      loadingText="Searching Lumina…"
      renderOption={({ key, ...props }, o) => (
        <Box component="li" key={key} {...props}>
          <Box sx={{ minWidth: 0 }}>
            {/* Campaign name is the buyer's handle, but it isn't always set. */}
            <Typography variant="body2" noWrap>
              {o.campaignName || `${o.companyName || 'Line item'} (no campaign name)`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {[o.companyName, o.product, o.status, o.market, o.woOrderNumber && `WO ${o.woOrderNumber}`]
                .filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        </Box>
      )}
      // MUI v9: renderInput params carry slotProps, NOT InputProps — just spread
      // them and keep the busy spinner outside the field.
      renderInput={params => (
        <TextField {...params} placeholder="Search by campaign, advertiser, WO number or Lumina link…" />
      )}
    />
    {loading && <CircularProgress size={14} />}
    </Box>
  );
}

export default function LuminaPanel({ lumina, readOnly, onChange }) {
  const lineitemId = lumina?.lineitemId || null;
  const advertiserId = lumina?.advertiserId || null;
  const linked = lineitemId || advertiserId;
  const [snap, setSnap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);
  const [open, setOpen] = useState(true);
  const [fieldSettings, setFieldSettings] = useState(null);

  // Which fields the admin HID. Cached per tab, so this is one network call and
  // then free on every later card open. A failure here must not hide data — an
  // empty setting means show everything.
  useEffect(() => {
    let cancelled = false;
    getLuminaFieldSettings()
      .then(s => { if (!cancelled) setFieldSettings(s); })
      .catch(() => { if (!cancelled) setFieldSettings({}); });
    return () => { cancelled = true; };
  }, []);

  // Re-pull on every card open (this mounts with the drawer) and on refresh.
  // Deliberately NOT awaited by the drawer: the card's own data is already on
  // screen while this is in flight.
  useEffect(() => {
    if (!linked) { setSnap(null); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Line item is the normal path; advertiser-only is the legacy shape.
    const fetch = lineitemId
      ? getLuminaLineItem(lineitemId)
      : getLuminaAdvertiser(advertiserId);
    fetch
      .then(d => { if (!cancelled) setSnap(d); })
      .catch(e => {
        if (!cancelled) {
          setError(e.response?.status === 404
            ? 'This no longer exists in Lumina (it may have ended or left the SEM cohort).'
            : 'Could not reach Lumina.');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lineitemId, advertiserId, linked, nonce]);

  const fetchedAt = useMemo(
    () => (snap?.fetchedAt ? new Date(snap.fetchedAt).toLocaleTimeString() : null),
    [snap]
  );

  // Not linked yet — just the search, no box to collapse.
  if (!linked) {
    return (
      <Box>
        <Typography variant="subtitle2" fontWeight={700} mb={1}>Lumina line item</Typography>
        {readOnly
          ? <Typography variant="body2" color="text.secondary">No line item attached.</Typography>
          : <AttachSearch onAttach={li => onChange({
              lineitemId: li.lineitemId,
              advertiserId: li.advertiserId,
              name: li.campaignName || li.companyName || '',
            })} />}
      </Box>
    );
  }

  const name = snap?.lineItem?.campaignName
    || snap?.lineItem?.companyName
    || snap?.advertiser?.companyName
    || lumina.name || lumina.advertiserName || linked;
  const status = loading
    ? 'Fetching from Lumina…'
    : error ? 'Unavailable'
    : fetchedAt ? `Updated ${fetchedAt}` : null;

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
      <Box
        onClick={() => setOpen(o => !o)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 1,
          cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <ExpandMoreIcon
          fontSize="small"
          sx={{ color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: '.15s' }}
        />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" fontWeight={700} noWrap>Lumina · {name}</Typography>
          {status && (
            <Typography variant="caption" color="text.secondary">
              {status}
              {!loading && !error && snap?.lineItem
                ? ` · ${[snap.lineItem.product, snap.lineItem.status, snap.lineItem.market]
                    .filter(Boolean).join(' · ')}`
                : ''}
              {!loading && !error && snap?.lineItems
                ? ` · ${snap.lineItems.length} line item${snap.lineItems.length === 1 ? '' : 's'}`
                : ''}
            </Typography>
          )}
        </Box>
        {loading && <CircularProgress size={14} />}
        {(snap?.lineItem?.url || snap?.url) && (
          <Tooltip title="Open this line item in Lumina">
            <IconButton
              size="small"
              component="a"
              href={snap.lineItem?.url || snap.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
            >
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        <Tooltip title="Refresh from Lumina">
          <IconButton size="small" onClick={e => { e.stopPropagation(); setNonce(n => n + 1); }}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        {!readOnly && (
          <Tooltip title="Detach from Lumina">
            <IconButton size="small" onClick={e => { e.stopPropagation(); onChange(null); }}>
              <LinkOffIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.5, pb: 1.5, pt: 0.5 }}>
          {error && <Alert severity="warning">{error}</Alert>}
          {!error && !snap && loading && (
            <Typography variant="body2" color="text.secondary">Fetching line-item data…</Typography>
          )}
          {!error && snap && (
            <LuminaSnapshot
              snap={snap}
              advertiserHide={new Set(fieldSettings?.hiddenAdvertiserFields || [])}
              lineItemHide={new Set(fieldSettings?.hiddenLineItemFields || [])}
            />
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
