import { Box, Typography, Checkbox, FormControlLabel, Button, Divider } from '@mui/material';
import { luminaLabel, LUMINA_SPARSE, groupLuminaFields } from '../../utils/luminaFields';

// The tick-boxes for "which Lumina fields does a card show", used by the per-board
// Lumina settings tab.
//
// NOTE: the caller works in VISIBLE keys; the server stores HIDDEN ones. Inverting
// lives with whoever saves, because "hidden" is what makes unknown/new fields show
// by default (see server/controllers/settings.js).

function Checkboxes({ keys, selected, onToggle }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.25 }}>
      {keys.map(k => (
        <FormControlLabel
          key={k}
          control={<Checkbox size="small" checked={selected.includes(k)} onChange={() => onToggle(k)} />}
          // Label only — the raw API key is noise for buyers. Kept as a title
          // attribute so it's still discoverable on hover when debugging.
          label={
            <Box title={k}>
              <Typography variant="body2">{luminaLabel(k)}</Typography>
              {LUMINA_SPARSE[k] && (
                <Typography variant="caption" color="text.secondary">
                  {LUMINA_SPARSE[k]}
                </Typography>
              )}
            </Box>
          }
        />
      ))}
    </Box>
  );
}

// Sub-section header with its own All/None — the groups mirror Lumina's own
// line-item page (Product, Campaign, Ignite Team, …) and match the order the
// fields appear in on the card, so ticking here is predictable.
function SubSection({ title, keys, selected, setSelected, onToggle }) {
  const allOn = keys.every(k => selected.includes(k));
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Typography variant="subtitle2" color="primary">{title}</Typography>
        <Typography variant="caption" color="text.secondary">
          {keys.filter(k => selected.includes(k)).length}/{keys.length}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          onClick={() => setSelected(prev => (allOn
            ? prev.filter(k => !keys.includes(k))
            : [...new Set([...prev, ...keys])]))}
        >
          {allOn ? 'None' : 'All'}
        </Button>
      </Box>
      <Divider sx={{ mb: 1 }} />
      <Checkboxes keys={keys} selected={selected} onToggle={onToggle} />
    </Box>
  );
}

function FieldGroup({ title, hint, children, onAll, onNone, count }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Typography variant="h6">{title}</Typography>
        {count && <Typography variant="caption" color="text.secondary">{count}</Typography>}
        <Box sx={{ flex: 1 }} />
        <Button size="small" onClick={onAll}>All</Button>
        <Button size="small" onClick={onNone}>None</Button>
      </Box>
      <Typography variant="caption" color="text.secondary">{hint}</Typography>
      <Divider sx={{ my: 1.5 }} />
      {children}
    </Box>
  );
}

export const toggleKey = (setter) => (k) =>
  setter(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));

export default function LuminaFieldPicker({ catalog, adv, setAdv, li, setLi }) {
  return (
    <>
      <FieldGroup
        title="Line item"
        count={`${li.length}/${catalog.lineItem.length} selected`}
        hint="Grouped and ordered the same way Lumina's own line-item page is. Unticking hides a field; a field Lumina adds later shows up automatically."
        onAll={() => setLi(catalog.lineItem)}
        onNone={() => setLi([])}
      >
        {groupLuminaFields(catalog.lineItem).map(([title, keys]) => (
          <SubSection
            key={title}
            title={title}
            keys={keys}
            selected={li}
            setSelected={setLi}
            onToggle={toggleKey(setLi)}
          />
        ))}
      </FieldGroup>

      <FieldGroup
        title="Advertiser"
        count={`${adv.length}/${catalog.advertiser.length} selected`}
        hint="Only used by cards still linked to an advertiser instead of a line item."
        onAll={() => setAdv(catalog.advertiser)}
        onNone={() => setAdv([])}
      >
        <Checkboxes keys={catalog.advertiser} selected={adv} onToggle={toggleKey(setAdv)} />
      </FieldGroup>
    </>
  );
}
