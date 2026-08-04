import { useMemo, useState } from 'react';
import { Box, Typography, IconButton, Button, Tooltip, Avatar, Chip } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { toInput, todayInput, monthGrid, monthLabel } from '../../utils/dueDate';
import { tagColor } from '../../utils/tagColor';
import { userColor } from '../../utils/userColor';

// Month calendar of cards by DUE DATE, mirroring Asana's Calendar view. Cards without a
// due date can't be placed, so they're surfaced as a count rather than silently dropped
// — on these boards most cards have no due date, and a view that quietly hides 1,100
// cards would be actively misleading.
//
// Weeks start MONDAY here (Asana's calendar does) even though DueDatePicker starts
// Sunday (Asana's picker does). Deliberate, not an oversight.

const HEALTH_COLORS = {
  'Good': '#4caf50',
  'Ok': '#ff9800',
  'Needs Work': '#f44336',
  'Waiting on DCM': '#2196f3',
};
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PER_DAY = 3;   // before collapsing into "+N more"

const initials = (name = '') => name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

function CalendarCard({ card, fields, users, selected, onClick }) {
  const assignee = users.find(u => u._id?.toString() === card.assigneeId?.toString());
  const healthField = fields.find(f => f.name === 'Health' && f.type === 'enum');
  const health = healthField
    && card.fieldValues?.find(v => v.fieldId?.toString() === healthField._id?.toString())?.valueEnum;

  return (
    <Tooltip title={card.title} enterDelay={600}>
      <Box
        onClick={() => onClick(card)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          px: 0.5, py: 0.25, mb: 0.25, borderRadius: 0.75, cursor: 'pointer',
          bgcolor: 'background.paper',
          // Health as a left edge — the calendar has no room for the board's chip, but
          // health is the thing buyers scan for.
          borderLeft: '3px solid',
          borderLeftColor: health ? HEALTH_COLORS[health] : 'divider',
          boxShadow: selected
            ? theme => `0 0 0 2px ${theme.palette.primary.main}`
            : '0 1px 2px rgba(0,0,0,.10)',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        {card.isCompleted && <CheckCircleIcon sx={{ fontSize: 12, color: '#4caf50', flexShrink: 0 }} />}
        {assignee && (
          <Avatar sx={{ width: 16, height: 16, fontSize: 8, bgcolor: userColor(assignee), flexShrink: 0 }}>
            {initials(assignee.name)}
          </Avatar>
        )}
        <Typography
          variant="caption"
          noWrap
          sx={{ flex: 1, minWidth: 0, color: card.isCompleted ? 'text.disabled' : 'text.primary' }}
        >
          {card.title}
        </Typography>
        {card.tags?.slice(0, 2).map(t => (
          <Box key={t} sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tagColor(t).dot, flexShrink: 0 }} />
        ))}
      </Box>
    </Tooltip>
  );
}

export default function CalendarView({ cards, fields, users, selectedCardId, onCardClick }) {
  const today = todayInput();
  const [view, setView] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { y, m: m - 1 };
  });
  const [expanded, setExpanded] = useState({});   // iso -> true, per-day "show all"

  const { byDay, noDate } = useMemo(() => {
    const map = {};
    let none = 0;
    for (const card of cards) {
      const iso = toInput(card.dueDate);
      if (!iso) { none += 1; continue; }
      (map[iso] ||= []).push(card);
    }
    return { byDay: map, noDate: none };
  }, [cards]);

  const step = (delta) => setView(({ y, m }) => {
    const n = m + delta;
    return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
  });
  const goToday = () => {
    const [y, m] = today.split('-').map(Number);
    setView({ y, m: m - 1 });
  };

  const grid = monthGrid(view.y, view.m, 1);

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 2, pt: 1 }}>
      {/* Month nav */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexShrink: 0 }}>
        <Button size="small" onClick={goToday} variant="outlined">Today</Button>
        <IconButton size="small" onClick={() => step(-1)} aria-label="Previous month">
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => step(1)} aria-label="Next month">
          <ChevronRightIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" sx={{ ml: 0.5 }}>{monthLabel(view.y, view.m)}</Typography>
        <Box sx={{ flex: 1 }} />
        {noDate > 0 && (
          <Tooltip title="Cards with no due date can't be placed on a calendar. Set a due date and they'll appear.">
            <Chip size="small" variant="outlined" label={`No due date · ${noDate}`} />
          </Tooltip>
        )}
      </Box>

      {/* Weekday header */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flexShrink: 0 }}>
        {DOW.map(d => (
          <Typography key={d} variant="caption" color="text.secondary" fontWeight={600}
            sx={{ px: 1, py: 0.5, textTransform: 'uppercase' }}>
            {d}
          </Typography>
        ))}
      </Box>

      {/* Day grid — the only thing that scrolls, so the page never does */}
      <Box
        sx={{
          flex: 1, minHeight: 0, overflowY: 'auto',
          display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: 'minmax(112px, auto)',
          borderTop: 1, borderLeft: 1, borderColor: 'divider',
        }}
      >
        {grid.map(({ iso, day, outside }) => {
          const dayCards = byDay[iso] || [];
          const isToday = iso === today;
          const show = expanded[iso] ? dayCards : dayCards.slice(0, PER_DAY);
          const hidden = dayCards.length - show.length;
          return (
            <Box
              key={iso}
              sx={{
                borderRight: 1, borderBottom: 1, borderColor: 'divider',
                p: 0.5, minWidth: 0,
                bgcolor: outside ? 'action.hover' : 'transparent',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
                <Typography
                  variant="caption"
                  sx={{
                    minWidth: 18, height: 18, borderRadius: '50%',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: isToday ? 700 : 500,
                    bgcolor: isToday ? 'primary.main' : 'transparent',
                    color: isToday ? 'primary.contrastText'
                      : outside ? 'text.disabled' : 'text.secondary',
                  }}
                >
                  {day}
                </Typography>
              </Box>

              {show.map(card => (
                <CalendarCard
                  key={card._id}
                  card={card}
                  fields={fields}
                  users={users}
                  selected={selectedCardId === card._id}
                  onClick={onCardClick}
                />
              ))}

              {hidden > 0 && (
                <Typography
                  variant="caption"
                  onClick={() => setExpanded(p => ({ ...p, [iso]: true }))}
                  sx={{ px: 0.5, cursor: 'pointer', color: 'primary.main', fontWeight: 600 }}
                >
                  +{hidden} more
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
