import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Box, Typography, Tooltip, Avatar, Divider, CircularProgress } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import HomeIcon from '@mui/icons-material/Home';
import { getBoards } from '../../api/boards';

const SIDEBAR_WIDTH = 220;

export default function Sidebar() {
  const navigate = useNavigate();
  const { id: activeBoardId } = useParams();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const isHome = location.pathname === '/dashboard';
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBoards()
      .then(data => setBoards(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Box
      sx={{
        width: SIDEBAR_WIDTH,
        minWidth: SIDEBAR_WIDTH,
        bgcolor: '#1d1f25',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        flexShrink: 0,
        overflowY: 'auto',
      }}
    >
      {/* Logo / app name */}
      <Box sx={{ px: 2.5, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box
          sx={{
            width: 28, height: 28, borderRadius: 1,
            bgcolor: '#f06a6a', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <DashboardIcon sx={{ fontSize: 16, color: '#fff' }} />
        </Box>
        <Typography fontWeight={700} fontSize={15} letterSpacing={0.3} noWrap>
          Ignite Buyer Board
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      {/* Home */}
      <Box sx={{ px: 1, pt: 1 }}>
        <Box
          onClick={() => navigate('/dashboard')}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.25,
            px: 1.5, py: 0.875, borderRadius: 1.25, cursor: 'pointer',
            bgcolor: isHome ? 'rgba(255,255,255,0.12)' : 'transparent',
            '&:hover': { bgcolor: isHome ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)' },
            transition: 'background-color 0.15s',
          }}
        >
          <HomeIcon sx={{ fontSize: 18, color: isHome ? '#fff' : 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
          <Typography variant="body2" noWrap sx={{ color: isHome ? '#fff' : 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: isHome ? 600 : 400 }}>
            Home
          </Typography>
        </Box>
      </Box>

      {/* Boards section */}
      <Box sx={{ px: 2, pt: 2, pb: 0.5 }}>
        <Typography
          variant="caption"
          sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 10 }}
        >
          Boards
        </Typography>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <CircularProgress size={18} sx={{ color: 'rgba(255,255,255,0.4)' }} />
        </Box>
      ) : (
        <Box sx={{ px: 1, pb: 1 }}>
          {boards.map(board => {
            const isActive = activeBoardId === board._id?.toString();
            return (
              <Tooltip key={board._id} title={board.name} placement="right" disableHoverListener={board.name.length < 24}>
                <Box
                  onClick={() => navigate(`/boards/${board._id}`)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.25,
                    px: 1.5,
                    py: 0.875,
                    borderRadius: 1.25,
                    cursor: 'pointer',
                    bgcolor: isActive ? 'rgba(255,255,255,0.12)' : 'transparent',
                    '&:hover': { bgcolor: isActive ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)' },
                    transition: 'background-color 0.15s',
                  }}
                >
                  <Avatar
                    sx={{
                      width: 22, height: 22, fontSize: 10, fontWeight: 700,
                      bgcolor: isActive ? '#f06a6a' : 'rgba(255,255,255,0.18)',
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    {board.name.charAt(0).toUpperCase()}
                  </Avatar>
                  <Typography
                    variant="body2"
                    noWrap
                    sx={{
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.7)',
                      fontWeight: isActive ? 600 : 400,
                      fontSize: 13,
                    }}
                  >
                    {board.name}
                  </Typography>
                </Box>
              </Tooltip>
            );
          })}
        </Box>
      )}

      {/* Spacer */}
      <Box sx={{ flex: 1 }} />

      {/* Admin section */}
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
      <Box sx={{ px: 1, py: 1 }}>
        <Box
          onClick={() => navigate('/admin/users')}
          sx={{
            display: 'flex', alignItems: 'center', gap: 1.25,
            px: 1.5, py: 0.875, borderRadius: 1.25, cursor: 'pointer',
            bgcolor: isAdmin ? 'rgba(255,255,255,0.12)' : 'transparent',
            '&:hover': { bgcolor: isAdmin ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)' },
            transition: 'background-color 0.15s',
          }}
        >
          <PeopleIcon sx={{ fontSize: 18, color: isAdmin ? '#fff' : 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
          <Typography variant="body2" noWrap sx={{ color: isAdmin ? '#fff' : 'rgba(255,255,255,0.7)', fontSize: 13 }}>
            Users
          </Typography>
        </Box>
      </Box>

      {/* Bottom user area */}
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: '#f06a6a' }}>D</Avatar>
        <Box sx={{ overflow: 'hidden' }}>
          <Typography variant="body2" noWrap sx={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Dev User</Typography>
          <Typography variant="caption" noWrap sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Admin</Typography>
        </Box>
      </Box>
    </Box>
  );
}
