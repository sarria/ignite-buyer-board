import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Avatar, CircularProgress, Divider,
} from '@mui/material';
import ViewKanbanOutlinedIcon from '@mui/icons-material/ViewKanbanOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleAltOutlined';
import { getBoards } from '../api/boards';
import { getUsers } from '../api/users';

// Asana-style coral/teal/purple palette for project icons, picked deterministically by name.
const BOARD_COLORS = ['#f06a6a', '#4573d2', '#5da283', '#aa62e3', '#e8a33d', '#3aa9bd', '#d35a8c'];
const colorFor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return BOARD_COLORS[Math.abs(hash) % BOARD_COLORS.length];
};

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const initials = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';

function WidgetCard({ icon, title, children }) {
  return (
    <Paper
      variant="outlined"
      sx={{
        flex: 1,
        minWidth: 320,
        borderRadius: 3,
        p: 2.5,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        {icon}
        <Typography fontWeight={700} fontSize={16}>{title}</Typography>
      </Box>
      {children}
    </Paper>
  );
}

export default function BoardListPage() {
  const [boards, setBoards] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([
      getBoards().catch(() => []),
      getUsers().catch(() => []),
    ])
      .then(([boardData, userData]) => {
        setBoards(boardData);
        setUsers(userData);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', bgcolor: 'background.default' }}>
      <Box sx={{ maxWidth: 1000, mx: 'auto', px: 3, py: 5 }}>
        {/* Greeting header */}
        <Box sx={{ textAlign: 'center', mb: 5 }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600, mb: 0.5 }}>
            {today}
          </Typography>
          <Typography variant="h4" fontWeight={500}>
            {greeting()}, Dev User
          </Typography>
        </Box>

        {/* Widgets */}
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {/* Projects (Boards) */}
          <WidgetCard
            icon={<ViewKanbanOutlinedIcon sx={{ color: 'text.secondary' }} />}
            title="Projects"
          >
            {boards.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No boards yet.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {boards.map(b => (
                  <Box
                    key={b._id}
                    onClick={() => navigate(`/boards/${b._id}`)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5,
                      px: 1, py: 1, borderRadius: 1.5, cursor: 'pointer',
                      '&:hover': { bgcolor: 'action.hover' },
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <Box
                      sx={{
                        width: 36, height: 36, borderRadius: 1.5, flexShrink: 0,
                        bgcolor: colorFor(b.name),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <ViewKanbanOutlinedIcon sx={{ fontSize: 18, color: '#fff' }} />
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={600} noWrap>{b.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {b.columnCount ?? 0} column{b.columnCount === 1 ? '' : 's'}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </WidgetCard>

          {/* People (Users) */}
          <WidgetCard
            icon={<PeopleOutlineIcon sx={{ color: 'text.secondary' }} />}
            title="People"
          >
            {users.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No people yet.</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                {users.map((u, i) => (
                  <Box key={u._id}>
                    {i > 0 && <Divider />}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25 }}>
                      <Avatar sx={{ width: 36, height: 36, fontSize: 13, bgcolor: colorFor(u.name || u.email || '') }}>
                        {initials(u.name)}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>{u.name}</Typography>
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                          {u.email}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </WidgetCard>
        </Box>
      </Box>
    </Box>
  );
}
