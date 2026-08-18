import { useEffect, useState } from 'react';
import { Box, Typography, Button, Divider, CircularProgress, Alert, Snackbar, Chip } from '@mui/material';
import {
  getBoardLuminaFieldSettings, saveBoardLuminaFieldSettings, resetBoardLuminaFieldSettings,
} from '../../api/settings';
import LuminaFieldPicker from '../../components/settings/LuminaFieldPicker';

// Which Lumina fields show on this board's cards. Purely per-board — no global
// fallback. Absent selection means "show everything".

export default function LuminaTab({ boardId }) {
  const [catalog, setCatalog] = useState(null);
  const [adv, setAdv] = useState([]);
  const [li, setLi] = useState([]);
  const [isDefault, setIsDefault] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState('');

  // Server stores HIDDEN keys, the checkboxes show VISIBLE ones — invert both ways.
  // Anything outside the catalog stays visible, which is the point of a hide-list.
  const load = (data) => {
    const hiddenLi = data.hiddenLineItemFields || [];
    const hiddenAdv = data.hiddenAdvertiserFields || [];
    setCatalog(data.catalog);
    setIsDefault(hiddenLi.length === 0 && hiddenAdv.length === 0);
    setAdv(data.catalog.advertiser.filter(k => !hiddenAdv.includes(k)));
    setLi(data.catalog.lineItem.filter(k => !hiddenLi.includes(k)));
  };

  useEffect(() => {
    getBoardLuminaFieldSettings(boardId)
      .then(load)
      .catch(() => setError('Could not load the Lumina field selection.'));
  }, [boardId]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      load(await saveBoardLuminaFieldSettings(
        boardId,
        catalog.advertiser.filter(k => !adv.includes(k)),
        catalog.lineItem.filter(k => !li.includes(k)),
      ));
      setToast('Saved.');
    } catch {
      setError('Could not save. Admin access is required.');
    } finally {
      setSaving(false);
    }
  };

  const showEverything = async () => {
    setSaving(true);
    setError(null);
    try {
      load(await resetBoardLuminaFieldSettings(boardId));
      setToast('This board now shows every Lumina field.');
    } catch {
      setError('Could not reset. Admin access is required.');
    } finally {
      setSaving(false);
    }
  };

  if (!catalog) {
    return (
      <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
        {error ? <Alert severity="error">{error}</Alert> : <CircularProgress size={20} />}
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Chip
          size="small"
          label={isDefault ? 'Showing every field' : 'Custom field selection'}
          color={isDefault ? 'default' : 'primary'}
          variant={isDefault ? 'outlined' : 'filled'}
        />
        <Typography variant="caption" color="text.secondary">
          This selection applies only to this board.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <LuminaFieldPicker catalog={catalog} adv={adv} setAdv={setAdv} li={li} setLi={setLi} />

      <Divider sx={{ mb: 2 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Button variant="contained" onClick={save} disabled={saving}>Save</Button>
        <Button onClick={showEverything} disabled={saving || isDefault}>Show everything</Button>
        <Box sx={{ flex: 1 }} />
        <Typography variant="caption" color="text.secondary">
          {adv.length + li.length} field{adv.length + li.length === 1 ? '' : 's'} selected
        </Typography>
      </Box>

      <Snackbar open={!!toast} autoHideDuration={3000} onClose={() => setToast('')} message={toast} />
    </Box>
  );
}
