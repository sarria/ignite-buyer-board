import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../context/AuthContext';

// Landing spot for the server's post-SSO redirect: it carries the minted token in
// the query string, which we trade for a session and then drop from the URL.
export default function LoginCallback() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState('Signing you in…');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;        // StrictMode double-invoke would sign in twice
    ran.current = true;

    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) {
      navigate('/login?error=No+token+received.+Please+try+signing+in+again.', { replace: true });
      return;
    }
    signIn(token).then((user) => {
      if (user) navigate('/', { replace: true });
      else {
        setMessage('');
        navigate('/login?error=Your+session+could+not+be+verified.', { replace: true });
      }
    });
  }, [signIn, navigate]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, bgcolor: 'background.default' }}>
      <CircularProgress />
      {message && <Typography variant="body2" color="text.secondary">{message}</Typography>}
    </Box>
  );
}
