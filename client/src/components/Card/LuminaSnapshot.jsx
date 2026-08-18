import { useState } from 'react';
import { Box, Typography, Divider, Collapse, Link } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  luminaLabel as label, formatLuminaValue, LUMINA_HIDDEN, groupLuminaFields,
  looksLikeHtml,
} from '../../utils/luminaFields';
import RichContent from '../common/RichContent';

// Renders a Lumina line item in Lumina's own visual language: grouped sections
// with a colored header + rule, and bold-label / value rows.
//
// The detail payload is a DOCUMENT whose field set varies by product, so the
// sections below are a display order, not a schema: any key we don't place lands
// in "Other", and anything Lumina adds later shows up with no code change.
// The board's Lumina settings tab (Board settings → Lumina) passes a Set of keys to
// HIDE — not to show. That way a field Lumina returns but our catalog sample never
// saw (states, zipcodes, creativeInstructions…) still appears instead of silently
// vanishing.

// Lumina's own page omits a field it has no value for (an unfilled team role, an
// unused geo option) rather than printing a blank row — so do we. `false` and 0
// are values, not blanks, and still render.
const isBlank = v =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length)
  || (typeof v === 'string' && !v.trim());

const shown = (data, keys, hide) =>
  keys.filter(k => k in data && !LUMINA_HIDDEN.has(k)
    && !(hide && hide.has(k)) && !isBlank(data[k]));

// Values often carry URLs (advertiser site, landing page, keyword notes) and real
// line breaks. Lumina renders those as links / multi-line text, so we do too.
const URL_SPLIT = /(https?:\/\/[^\s]+)/g;
const IS_URL = /^https?:\/\//;

function Text({ children }) {
  if (typeof children !== 'string') return children;
  // Rich text from the order form — render it (sanitized, links open in a new tab)
  // rather than showing the markup.
  if (looksLikeHtml(children)) return <RichContent html={children} sx={{ '& p': { m: 0 } }} />;
  return (
    <Box component="span" sx={{ whiteSpace: 'pre-line' }}>
      {children.split(URL_SPLIT).map((part, i) => (IS_URL.test(part) ? (
        <Link
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          sx={{ wordBreak: 'break-all' }}
        >
          {part}
        </Link>
      ) : part))}
    </Box>
  );
}

function Row({ label: text, children }) {
  return (
    <Box sx={{ display: 'contents' }}>
      <Typography variant="body2" fontWeight={700}>{text}</Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        component="div"
        sx={{ overflowWrap: 'anywhere' }}
      >
        {children}
      </Typography>
    </Box>
  );
}

// A sub-heading that spans both grid columns (used when a nested object needs a
// name of its own).
function SubHeading({ children }) {
  return (
    <Typography
      variant="caption"
      color="text.secondary"
      sx={{ gridColumn: '1 / -1', mt: 0.5, fontWeight: 700 }}
    >
      {children}
    </Typography>
  );
}

// Nested objects (buildDetails) are FLATTENED into the parent grid rather than
// rendered inside the value column. Nesting a second two-column grid inside a
// ~150px cell squeezed values to one character per line — and Lumina doesn't nest
// them either: its Build Details section lists the sub-fields as ordinary rows.
function Rows({ data, keys, sectionTitle }) {
  if (!keys.length) return null;

  const cells = [];
  for (const k of keys) {
    const formatted = formatLuminaValue(k, data[k]);
    if (formatted !== null) {
      cells.push(<Row key={k} label={label(k)}><Text>{formatted}</Text></Row>);
      continue;
    }
    // Nested object → optional sub-heading, then its entries as normal rows.
    // Skip the heading when it would just repeat the section title.
    const entries = Object.entries(data[k] || {}).filter(([sk]) => !LUMINA_HIDDEN.has(sk));
    if (!entries.length) continue;
    if (label(k) !== sectionTitle) cells.push(<SubHeading key={`${k}-h`}>{label(k)}</SubHeading>);
    for (const [sk, sv] of entries) {
      cells.push(
        <Row key={`${k}.${sk}`} label={label(sk)}>
          <Text>{formatLuminaValue(sk, sv) ?? JSON.stringify(sv)}</Text>
        </Row>
      );
    }
  }

  return (
    <Box
      sx={{
        display: 'grid',
        // Labels here can be full questions ("Services the client offers…"), so give
        // the value column a floor — a percentage-only split starves it.
        gridTemplateColumns: 'minmax(120px, 0.9fr) minmax(140px, 1.1fr)',
        columnGap: 2, rowGap: 0.75, mb: 2,
      }}
    >
      {cells}
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

function Document({ data, hide }) {
  // Same grouping the admin picker uses, so what you tick is where it appears.
  const groups = groupLuminaFields(Object.keys(data))
    .map(([title, keys]) => [title, shown(data, keys, hide)])
    .filter(([, keys]) => keys.length);

  if (!groups.length) {
    return (
      <Typography variant="body2" color="text.secondary">
        Every field is hidden — see Lumina fields in the sidebar.
      </Typography>
    );
  }
  return groups.map(([title, keys]) => (
    <Section key={title} title={title}>
      <Rows data={data} keys={keys} sectionTitle={title} />
    </Section>
  ));
}

// Legacy shape: a card linked to an advertiser rather than a line item shows the
// advertiser plus a collapsible per line item.
function LegacyLineItem({ item, defaultOpen, hide }) {
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
        <Box sx={{ px: 1.25, pb: 1 }}><Document data={item} hide={hide} /></Box>
      </Collapse>
    </Box>
  );
}

export default function LuminaSnapshot({ snap, advertiserHide = null, lineItemHide = null }) {
  const { lineItem = null, advertiser = null } = snap;
  const lineItems = snap.lineItems || [];

  // Normal case: the card is linked to one line item — show its document.
  if (lineItem) return <Box><Document data={lineItem} hide={lineItemHide} /></Box>;

  return (
    <Box>
      {advertiser && (
        <Section title="Advertiser">
          <Rows data={advertiser} keys={shown(advertiser, Object.keys(advertiser), advertiserHide)} />
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
                hide={lineItemHide}
              />
            ))}
      </Section>
    </Box>
  );
}
