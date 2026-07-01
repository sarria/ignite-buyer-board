import { useEffect, useState } from 'react';
import { Box, Paper, Typography, TextField, Button, CircularProgress, Alert } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import api, { ACCESS_PW_KEY } from '../../api/client';

// ─── TEMPORARY shared-password gate ─────────────────────────────────────────
// Stop-gap so we can demo with real (sensitive) imported data before real auth.
// It calls GET /api/auth/check: 200 = unlocked (correct password, or the server
// isn't enforcing one → local dev), 401 = show the password screen. The password
// lives in localStorage and is sent by the axios interceptor (see client.js).
// TODO(auth): REMOVE this component (and unwrap it in App.jsx) when Stephen Alba
// implements MSAL SSO. Server side lives in server/middleware/auth.js.
export default function AccessGate({ children }) {
  const [status, setStatus] = useState('checking'); // checking | locked | open
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const check = async () => {
    try {
      await api.get('/auth/check');
      setStatus('open');
    } catch {
      // 401 (password required) or any error → show the lock screen.
      setStatus('locked');
    }
  };

  useEffect(() => { check(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!pw.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    localStorage.setItem(ACCESS_PW_KEY, pw);
    try {
      await api.get('/auth/check');
      setStatus('open');
    } catch {
      localStorage.removeItem(ACCESS_PW_KEY);
      setError('Incorrect password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'checking') {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (status === 'open') return children;

  return (
    <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 380, borderRadius: 3, p: 4, textAlign: 'center' }}>
        <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
          <LockOutlinedIcon sx={{ color: '#fff' }} />
        </Box>
        <Typography variant="h6" fontWeight={700} gutterBottom>Ignite Buyer Board</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          This is a private preview with real data. Enter the access password to continue.
        </Typography>
        <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {error && <Alert severity="error" sx={{ textAlign: 'left' }}>{error}</Alert>}
          <TextField
            autoFocus
            type="password"
            size="small"
            label="Access password"
            value={pw}
            onChange={e => setPw(e.target.value)}
            fullWidth
          />
          <Button type="submit" variant="contained" disabled={submitting || !pw.trim()}>
            {submitting ? <CircularProgress size={22} color="inherit" /> : 'Enter'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}
