import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Checkbox, FormControlLabel, Button, Divider,
  CircularProgress, Alert, Snackbar, IconButton, Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  getLuminaFieldSettings, saveLuminaFieldSettings, resetLuminaFieldSettings,
} from '../api/settings';
import { luminaLabel, LUMINA_SPARSE, groupLuminaFields } from '../utils/luminaFields';

// Global (app-wide) picker for which Lumina fields the card panel shows. Applies
// to every board and every user — the point is that buyers tune this themselves
// instead of us guessing which of Lumina's fields matter.

function Checkboxes({ keys, selected, onToggle }) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.25 }}>
      {keys.map(k => (
        <FormControlLabel
          key={k}
          control={<Checkbox size="small" checked={selected.includes(k)} onChange={() => onToggle(k)} />}
          label={
            <Box>
              <Typography variant="body2">{luminaLabel(k)}</Typography>
              <Typography variant="caption" color="text.secondary">
                {k}{LUMINA_SPARSE[k] ? ` · ${LUMINA_SPARSE[k]}` : ''}
              </Typography>
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

export default function AdminLuminaFieldsPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [adv, setAdv] = useState([]);
  const [li, setLi] = useState([]);
  const [unset, setUnset] = useState(false);   // nothing saved yet = "show everything"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState('');

  const load = (data) => {
    setCatalog(data.catalog);
    setUnset(data.advertiserFields == null);
    // Unconfigured → pre-check everything, so the picker reflects what cards show now.
    setAdv(data.advertiserFields ?? data.catalog.advertiser);
    setLi(data.lineItemFields ?? data.catalog.lineItem);
  };

  useEffect(() => {
    getLuminaFieldSettings().then(load).catch(() => setError('Could not load Lumina field settings.'));
  }, []);

  const toggle = (setter) => (k) =>
    setter(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      load(await saveLuminaFieldSettings(adv, li));
      setToast('Saved — every card will show these fields.');
    } catch {
      setError('Could not save. Admin access is required.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      load(await resetLuminaFieldSettings());
      setToast('Reset — cards show every field Lumina returns.');
    } catch {
      setError('Could not reset. Admin access is required.');
    } finally {
      setSaving(false);
    }
  };

  if (!catalog) {
    return (
      <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
        {error ? <Alert severity="error">{error}</Alert> : <CircularProgress size={20} />}
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', overflowY: 'auto', p: 3 }}>
      <Paper variant="outlined" sx={{ maxWidth: 860, mx: 'auto', p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Tooltip title="Back">
            <IconButton size="small" onClick={() => navigate(-1)}><ArrowBackIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Typography variant="h5">Lumina fields</Typography>
        </Box>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Choose what the Lumina panel shows on a card. Applies to every board and
          everyone, and takes effect the next time a card is opened.
          {unset && ' Nothing is saved yet, so cards currently show every field.'}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <FieldGroup
          title="Line item"
          count={`${li.length}/${catalog.lineItem.length} selected`}
          hint="Grouped the same way Lumina's own line-item page is, and shown on the card in this order. Deselect a whole group to hide its heading."
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
              onToggle={toggle(setLi)}
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
          <Checkboxes keys={catalog.advertiser} selected={adv} onToggle={toggle(setAdv)} />
        </FieldGroup>

        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Button variant="contained" onClick={save} disabled={saving}>Save</Button>
          <Button onClick={reset} disabled={saving || unset}>Show all fields</Button>
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {adv.length + li.length} field{adv.length + li.length === 1 ? '' : 's'} selected
          </Typography>
        </Box>
      </Paper>

      <Snackbar
        open={!!toast}
        autoHideDuration={3000}
        onClose={() => setToast('')}
        message={toast}
      />
    </Box>
  );
}
