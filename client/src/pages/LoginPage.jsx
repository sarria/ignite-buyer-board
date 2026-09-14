import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Box, Paper, Typography, Button, CircularProgress, Alert } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import { getAuthConfig, getLoginUrl } from '../api/auth';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { status } = useAuth();
  const [redirecting, setRedirecting] = useState(false);
  const [ssoEnabled, setSsoEnabled] = useState(true);
  // The server redirects failures back here as ?error= — the browser is mid-
  // navigation during the Entra callback, so there's nowhere else to report them.
  const [error, setError] = useState(() => new URLSearchParams(window.location.search).get('error'));

  useEffect(() => {
    getAuthConfig().then(c => setSsoEnabled(c.ssoEnabled)).catch(() => {});
  }, []);

  const handleSignIn = async () => {
    setRedirecting(true);
    setError('');
    try {
      window.location.href = await getLoginUrl();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Could not reach the server. Please try again.');
      setRedirecting(false);
    }
  };

  if (status === 'authed') return <Navigate to="/" replace />;

  return (
    <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: 2 }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 380, borderRadius: 3, p: 4, textAlign: 'center' }}>
        <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}>
          <DashboardIcon sx={{ color: '#fff' }} />
        </Box>
        <Typography variant="h6" fontWeight={700} gutterBottom>Ignite Buyer Board</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Sign in with your Townsquare account to continue.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{decodeURIComponent(error)}</Alert>}

        {ssoEnabled ? (
          <Button
            variant="contained"
            fullWidth
            size="large"
            onClick={handleSignIn}
            disabled={redirecting}
            startIcon={redirecting ? <CircularProgress size={18} color="inherit" /> : null}
          >
            {redirecting ? 'Redirecting…' : 'Sign in with Microsoft'}
          </Button>
        ) : (
          <Alert severity="warning" sx={{ textAlign: 'left' }}>
            Single sign-on isn’t configured on this server yet.
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2.5 }}>
          Single sign-on via Microsoft Entra ID
        </Typography>
      </Paper>
    </Box>
  );
}
