import { useState } from 'react';
import { Box, Typography, Divider, Collapse } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  luminaLabel as label, formatLuminaValue, LUMINA_HIDDEN, groupLuminaFields,
} from '../../utils/luminaFields';

// Renders a Lumina line item in Lumina's own visual language: grouped sections
// with a colored header + rule, and bold-label / value rows.
//
// The detail payload is a DOCUMENT whose field set varies by product, so the
// sections below are a display order, not a schema: any key we don't place lands
// in "Other", and anything Lumina adds later shows up with no code change.
// Which fields appear at all is the admin setting (/admin/lumina-fields), passed
// in as a Set; null means unconfigured → show everything.

const shown = (data, keys, show) =>
  keys.filter(k => k in data && !LUMINA_HIDDEN.has(k) && (!show || show.has(k)));

function Row({ label: text, children }) {
  return (
    <Box sx={{ display: 'contents' }}>
      <Typography variant="body2" fontWeight={700}>{text}</Typography>
      <Typography variant="body2" color="text.secondary" component="div" sx={{ wordBreak: 'break-word' }}>
        {children}
      </Typography>
    </Box>
  );
}

// A nested object (e.g. buildDetails) renders as an indented mini-list instead of
// raw JSON — Lumina's own form shows these as sub-fields.
function NestedValue({ value }) {
  const entries = Object.entries(value).filter(([k]) => !LUMINA_HIDDEN.has(k));
  if (!entries.length) return '—';
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 1.5, rowGap: 0.25 }}>
      {entries.map(([k, v]) => (
        <Box key={k} sx={{ display: 'contents' }}>
          <Typography variant="caption" color="text.secondary">{label(k)}</Typography>
          <Typography variant="caption" sx={{ wordBreak: 'break-word' }}>
            {formatLuminaValue(k, v) ?? JSON.stringify(v)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function Rows({ data, keys }) {
  if (!keys.length) return null;
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(110px, 38%) 1fr',
        columnGap: 2, rowGap: 0.75, mb: 2,
      }}
    >
      {keys.map(k => {
        const formatted = formatLuminaValue(k, data[k]);
        return (
          <Row key={k} label={label(k)}>
            {formatted !== null
              ? formatted
              : <NestedValue value={data[k]} />}
          </Row>
        );
      })}
    </Box>
  );
}

function Section({ title, children }) {
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="subtitle2" color="primary" sx={{ mb: 0.5 }}>{title}</Typography>
      <Divider sx={{ mb: 1.25 }} />
      {children}
    </Box>
  );
}

function Document({ data, show }) {
  // Same grouping the admin picker uses, so what you tick is where it appears.
  const groups = groupLuminaFields(Object.keys(data))
    .map(([title, keys]) => [title, shown(data, keys, show)])
    .filter(([, keys]) => keys.length);

  if (!groups.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        No fields selected — see Lumina fields in the sidebar.
      </Typography>
    );
  }
  return groups.map(([title, keys]) => (
    <Section key={title} title={title}><Rows data={data} keys={keys} /></Section>
  ));
}

// Legacy shape: a card linked to an advertiser rather than a line item shows the
// advertiser plus a collapsible per line item.
function LegacyLineItem({ item, defaultOpen, show }) {
  const [open, setOpen] = useState(defaultOpen);
  const title = item.campaignName || item.displayName || item.lineitemId;
  const sub = [item.product, item.status, item.market].filter(Boolean).join(' · ');
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
        <Box sx={{ px: 1.25, pb: 1 }}><Document data={item} show={show} /></Box>
      </Collapse>
    </Box>
  );
}

export default function LuminaSnapshot({ snap, advertiserShow = null, lineItemShow = null }) {
  const { lineItem = null, advertiser = null } = snap;
  const lineItems = snap.lineItems || [];

  // Normal case: the card is linked to one line item — show its document.
  if (lineItem) return <Box><Document data={lineItem} show={lineItemShow} /></Box>;

  return (
    <Box>
      {advertiser && (
        <Section title="Advertiser">
          <Rows data={advertiser} keys={shown(advertiser, Object.keys(advertiser), advertiserShow)} />
        </Section>
      )}
      <Section title={`Line Items (${lineItems.length})`}>
        {lineItems.length === 0
          ? <Typography variant="body2" color="text.secondary">None in Lumina.</Typography>
          : lineItems.map((li, i) => (
              <LegacyLineItem
                key={li.lineitemId || i}
                item={li}
                defaultOpen={lineItems.length <= 2}
                show={lineItemShow}
              />
            ))}
      </Section>
    </Box>
  );
}
