import { useState } from 'react';
import { Box, Typography, Divider, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { luminaLabel as label } from '../../utils/luminaFields';

// Renders a Lumina snapshot in Lumina's own visual language: grouped sections,
// a titled header with a rule under it, and bold label / value rows.
// Which fields appear is an admin setting (/admin/lumina-fields) passed in as
// `advertiserShow` / `lineItemShow` Sets; null means unconfigured → show everything.
// Fields we have no named section for fall into "Other", so new API fields still
// surface without a code change.


function formatValue(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

// Keys that exist on this record AND are selected for display.
const visible = (data, keys, show) => keys.filter(k => k in data && (!show || show.has(k)));

function Rows({ data, keys, show }) {
  // `show` is a Set of admin-selected keys, or null when unconfigured (= show all).
  const present = keys.filter(k => k in data && (!show || show.has(k)));
  if (!present.length) return null;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(110px, 34%) 1fr',
        columnGap: 2, rowGap: 0.75, mb: 2,
      }}
    >
      {present.map(k => (
        <Box key={k} sx={{ display: 'contents' }}>
          <Typography variant="body2" fontWeight={700}>{label(k)}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: 'break-word' }}>
            {formatValue(data[k])}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

// Hides itself when the admin deselected every field it would have shown.
function Section({ title, children, hidden }) {
  if (hidden) return null;
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="subtitle2" color="primary" sx={{ mb: 0.5 }}>{title}</Typography>
      <Divider sx={{ mb: 1.25 }} />
      {children}
    </Box>
  );
}

// Any key not claimed by a named section still gets rendered.
function Other({ data, used, show }) {
  const rest = Object.keys(data).filter(k => !used.includes(k) && k !== 'accounts');
  if (!visible(data, rest, show).length) return null;
  return <Section title="Other"><Rows data={data} keys={rest} show={show} /></Section>;
}

const LI_PRODUCT = ['product', 'subProduct'];
const LI_CAMPAIGN = ['luminaCampaignName', 'woNumber', 'market'];
const LI_PLATFORM = ['platformAdvertiserName', 'platformAdvertiserId', 'platformParentId', 'platform'];
const LI_IDS = ['luminaLineitemId', 'luminaAdvertiserId', 'advertiserType'];
const LI_USED = [...LI_PRODUCT, ...LI_CAMPAIGN, ...LI_PLATFORM, ...LI_IDS, 'luminaAdvertiserName'];

function LineItem({ item, defaultOpen, show }) {
  const [open, setOpen] = useState(defaultOpen);
  const title = item.luminaCampaignName || item.luminaLineitemId || 'Line item';
  const sub = [item.product, (item.subProduct || []).join(', '), item.market]
    .filter(Boolean).join(' · ');

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}>
      <Box
        onClick={() => setOpen(o => !o)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 1.25, py: 1, cursor: 'pointer',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" fontWeight={600} noWrap title={title}>{title}</Typography>
          {sub && <Typography variant="caption" color="text.secondary">{sub}</Typography>}
        </Box>
        <ExpandMoreIcon
          fontSize="small"
          sx={{ color: 'text.secondary', transform: open ? 'rotate(180deg)' : 'none', transition: '.15s' }}
        />
      </Box>
      <Collapse in={open} unmountOnExit>
        <Box sx={{ px: 1.25, pb: 1 }}>
          {[
            ['Product', LI_PRODUCT], ['Campaign', LI_CAMPAIGN],
            ['Platform', LI_PLATFORM], ['Identifiers', LI_IDS],
          ].map(([title, keys]) => (
            <Section key={title} title={title} hidden={!visible(item, keys, show).length}>
              <Rows data={item} keys={keys} show={show} />
            </Section>
          ))}
          <Other data={item} used={LI_USED} show={show} />
        </Box>
      </Collapse>
    </Box>
  );
}

const ADV_KEYS = ['luminaAdvertiserName', 'luminaAdvertiserSlug', 'advertiserType', 'pacingStatus', 'luminaAdvertiserId'];
const ACCT_KEYS = ['platformAdvertiserName', 'platformAdvertiserId', 'platformParentId', 'pacingStatus', 'advertiserType'];

export default function LuminaSnapshot({ snap, advertiserShow = null, lineItemShow = null }) {
  // Two shapes: a card linked to a line item ({ lineItem }) — the normal case —
  // or a legacy advertiser-linked card ({ lineItems: [...] }).
  const { advertiser, lineItem = null } = snap;
  const lineItems = snap.lineItems || [];
  const accounts = advertiser?.accounts || [];
  const acctVisible = accounts.length > 0
    && visible(accounts[0], ACCT_KEYS, advertiserShow).length > 0;

  return (
    <Box>
      {advertiser && (
        <>
          <Section title="Advertiser" hidden={!visible(advertiser, ADV_KEYS, advertiserShow).length}>
            <Rows data={advertiser} keys={ADV_KEYS} show={advertiserShow} />
          </Section>
          <Other data={advertiser} used={ADV_KEYS} show={advertiserShow} />
        </>
      )}

      {acctVisible && (
        <Section title={`Platform Accounts (${accounts.length})`}>
          {accounts.map((a, i) => (
            <Rows key={a.platformAdvertiserId || i} data={a} keys={ACCT_KEYS} show={advertiserShow} />
          ))}
        </Section>
      )}

      {/* Linked to one line item: render its fields inline — no need to make the
          buyer expand the very thing they attached. */}
      {lineItem && (
        <>
          {[
            ['Product', LI_PRODUCT], ['Campaign', LI_CAMPAIGN],
            ['Platform', LI_PLATFORM], ['Identifiers', LI_IDS],
          ].map(([title, keys]) => (
            <Section key={title} title={title} hidden={!visible(lineItem, keys, lineItemShow).length}>
              <Rows data={lineItem} keys={keys} show={lineItemShow} />
            </Section>
          ))}
          <Other data={lineItem} used={LI_USED} show={lineItemShow} />
        </>
      )}

      {/* Legacy advertiser-linked card: all of the advertiser's line items. */}
      {!lineItem && (
        <Section title={`Line Items (${lineItems.length})`}>
          {lineItems.length === 0
            ? <Typography variant="body2" color="text.secondary">None in Lumina.</Typography>
            : lineItems.map((li, i) => (
                <LineItem
                  key={li.luminaLineitemId || i}
                  item={li}
                  defaultOpen={lineItems.length <= 2}
                  show={lineItemShow}
                />
              ))}
        </Section>
      )}
    </Box>
  );
}
