import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, Divider,
  CircularProgress, Alert, Snackbar, IconButton, Tooltip,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import {
  getLuminaFieldSettings, saveLuminaFieldSettings, resetLuminaFieldSettings,
} from '../api/settings';
import LuminaFieldPicker from '../components/settings/LuminaFieldPicker';

// Global (app-wide) picker for which Lumina fields the card panel shows. The
// DEFAULT for every board — a board can override it in its own settings, and any
// board that hasn't follows whatever is set here.

export default function AdminLuminaFieldsPage() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState(null);
  const [adv, setAdv] = useState([]);
  const [li, setLi] = useState([]);
  const [unset, setUnset] = useState(false);   // nothing saved yet = "show everything"
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState('');

  // The server stores HIDDEN keys; the checkboxes show what's visible, so we
  // invert on load and again on save. Anything outside the catalog stays visible
  // by default — that's the point of storing hidden rather than kept.
  const load = (data) => {
    const hiddenLi = data.hiddenLineItemFields || [];
    const hiddenAdv = data.hiddenAdvertiserFields || [];
    setCatalog(data.catalog);
    setUnset(!hiddenLi.length && !hiddenAdv.length);
    setAdv(data.catalog.advertiser.filter(k => !hiddenAdv.includes(k)));
    setLi(data.catalog.lineItem.filter(k => !hiddenLi.includes(k)));
  };

  useEffect(() => {
    getLuminaFieldSettings().then(load).catch(() => setError('Could not load Lumina field settings.'));
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      load(await saveLuminaFieldSettings(
        catalog.advertiser.filter(k => !adv.includes(k)),
        catalog.lineItem.filter(k => !li.includes(k)),
      ));
      setToast('Saved — boards without their own selection will show these fields.');
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
          The default for every board. A board can override this in its own settings
          (Board settings → Lumina); boards that haven&apos;t follow what you set here.
          Takes effect the next time a card is opened.
          {unset && ' Nothing is hidden yet, so cards show every field Lumina returns.'}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <LuminaFieldPicker catalog={catalog} adv={adv} setAdv={setAdv} li={li} setLi={setLi} />

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
