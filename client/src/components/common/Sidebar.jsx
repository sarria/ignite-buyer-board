import { useEffect, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { Box, Typography, Tooltip, Avatar, Divider, CircularProgress, IconButton } from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';
import HomeIcon from '@mui/icons-material/Home';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import { getBoards } from '../../api/boards';
import { userColor } from '../../utils/userColor';

const WIDTH_COLLAPSED = 60;
const WIDTH_DEFAULT = 248;
const WIDTH_MIN = 180;
const WIDTH_MAX = 420;
const COLLAPSE_KEY = 'sidebar.collapsed';
const WIDTH_KEY = 'sidebar.width';

export default function Sidebar() {
  const navigate = useNavigate();
  const { id: activeBoardId } = useParams();
  const location = useLocation();
  const isAdmin = location.pathname.startsWith('/admin');
  const isHome = location.pathname === '/dashboard';
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [width, setWidth] = useState(() => {
    try {
      const v = parseInt(localStorage.getItem(WIDTH_KEY), 10);
      return Number.isFinite(v) ? Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, v)) : WIDTH_DEFAULT;
    } catch { return WIDTH_DEFAULT; }
  });
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    getBoards()
      .then(data => setBoards(data))
      .finally(() => setLoading(false));
  }, []);

  // Drag-to-resize: the sidebar's left edge is the viewport left (x=0), so the
  // pointer's clientX is the target width. Clamp to [MIN, MAX] and persist.
  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (e) => setWidth(Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, e.clientX)));
    const onUp = () => setDragging(false);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging]);

  useEffect(() => {
    try { localStorage.setItem(WIDTH_KEY, String(width)); } catch { /* ignore */ }
  }, [width]);

  const toggleCollapsed = () => setCollapsed(prev => {
    const next = !prev;
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });

  // Shared style for a clickable nav row (Home / Users); collapses to a centered icon.
  const navRowSx = (active) => ({
    display: 'flex', alignItems: 'center', gap: 1.25,
    justifyContent: collapsed ? 'center' : 'flex-start',
    px: 1.5, py: 0.875, borderRadius: 1.25, cursor: 'pointer',
    bgcolor: active ? 'rgba(255,255,255,0.12)' : 'transparent',
    '&:hover': { bgcolor: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)' },
    transition: 'background-color 0.15s',
  });

  const currentWidth = collapsed ? WIDTH_COLLAPSED : width;

  return (
    <Box
      sx={{
        position: 'relative',
        width: currentWidth,
        minWidth: currentWidth,
        bgcolor: '#1d1f25',
        height: '100vh',
        flexShrink: 0,
        transition: dragging ? 'none' : 'width 0.2s, min-width 0.2s',
      }}
    >
      {/* Scrollable content */}
      <Box
        sx={{
          width: '100%', height: '100%',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Logo / app name + collapse toggle */}
        <Box sx={{ px: collapsed ? 0 : 2.5, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.25, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <Tooltip title={collapsed ? 'Expand sidebar' : ''} placement="right" disableHoverListener={!collapsed}>
            <Box
              onClick={collapsed ? toggleCollapsed : undefined}
              sx={{
                width: 28, height: 28, borderRadius: 1,
                bgcolor: 'primary.main', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, cursor: collapsed ? 'pointer' : 'default',
              }}
            >
              <DashboardIcon sx={{ fontSize: 16, color: '#fff' }} />
            </Box>
          </Tooltip>
          {!collapsed && (
            <>
              <Typography fontWeight={700} fontSize={15} letterSpacing={0.3} noWrap sx={{ flex: 1 }}>
                Ignite Buyer Board
              </Typography>
              <Tooltip title="Collapse sidebar" placement="right">
                <IconButton size="small" onClick={toggleCollapsed} sx={{ color: 'rgba(255,255,255,0.6)', '&:hover': { color: '#fff' } }}>
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

        {/* Home */}
        <Box sx={{ px: 1, pt: 1 }}>
          <Tooltip title="Home" placement="right" disableHoverListener={!collapsed}>
            <Box onClick={() => navigate('/dashboard')} sx={navRowSx(isHome)}>
              <HomeIcon sx={{ fontSize: 18, color: isHome ? '#fff' : 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
              {!collapsed && (
                <Typography variant="body2" noWrap sx={{ color: isHome ? '#fff' : 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: isHome ? 600 : 400 }}>
                  Home
                </Typography>
              )}
            </Box>
          </Tooltip>
        </Box>

        {/* Boards section */}
        {!collapsed && (
          <Box sx={{ px: 2, pt: 2, pb: 0.5 }}>
            <Typography
              variant="caption"
              sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', fontSize: 10 }}
            >
              Boards
            </Typography>
          </Box>
        )}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <CircularProgress size={18} sx={{ color: 'rgba(255,255,255,0.4)' }} />
          </Box>
        ) : (
          <Box sx={{ px: 1, pt: collapsed ? 1 : 0, pb: 1 }}>
            {boards.map(board => {
              const isActive = activeBoardId === board._id?.toString();
              return (
                <Tooltip key={board._id} title={board.name} placement="right" disableHoverListener={!collapsed && board.name.length < 24}>
                  <Box
                    onClick={() => navigate(`/boards/${board._id}`)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      justifyContent: collapsed ? 'center' : 'flex-start',
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
                        bgcolor: isActive ? 'primary.main' : 'rgba(255,255,255,0.18)',
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {board.name.charAt(0).toUpperCase()}
                    </Avatar>
                    {!collapsed && (
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
                    )}
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
          <Tooltip title="Users" placement="right" disableHoverListener={!collapsed}>
            <Box onClick={() => navigate('/admin/users')} sx={navRowSx(isAdmin)}>
              <PeopleIcon sx={{ fontSize: 18, color: isAdmin ? '#fff' : 'rgba(255,255,255,0.5)', flexShrink: 0 }} />
              {!collapsed && (
                <Typography variant="body2" noWrap sx={{ color: isAdmin ? '#fff' : 'rgba(255,255,255,0.7)', fontSize: 13 }}>
                  Users
                </Typography>
              )}
            </Box>
          </Tooltip>
        </Box>

        {/* Bottom user area */}
        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
        <Box sx={{ px: collapsed ? 0 : 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.25, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <Tooltip title={collapsed ? 'Dev User · Admin' : ''} placement="right" disableHoverListener={!collapsed}>
            <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: userColor('Dev User'), flexShrink: 0 }}>D</Avatar>
          </Tooltip>
          {!collapsed && (
            <Box sx={{ overflow: 'hidden' }}>
              <Typography variant="body2" noWrap sx={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>Dev User</Typography>
              <Typography variant="caption" noWrap sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>Admin</Typography>
            </Box>
          )}
        </Box>
      </Box>

      {/* Drag-to-resize handle (hidden when collapsed) */}
      {!collapsed && (
        <Box
          onMouseDown={() => setDragging(true)}
          sx={{
            position: 'absolute', top: 0, right: 0, bottom: 0, width: 6,
            cursor: 'col-resize', zIndex: 10,
            bgcolor: dragging ? 'rgba(69,115,210,0.6)' : 'transparent',
            '&:hover': { bgcolor: 'rgba(69,115,210,0.6)' },
            transition: 'background-color 0.15s',
          }}
        />
      )}
    </Box>
  );
}
