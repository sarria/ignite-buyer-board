import { useState, useEffect } from 'react';
import { Box, Typography, Popover, TextField, IconButton, Button, Tooltip } from '@mui/material';
import CalendarTodayOutlinedIcon from '@mui/icons-material/CalendarTodayOutlined';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {
  toInput, todayInput, formatDueRelative, dueExact, isOverdue, isToday,
  parseTyped, monthGrid, monthLabel,
} from '../../utils/dueDate';

// Asana's due-date control: the row is just a calendar glyph + "Jun 4" + a clear ×,
// and clicking it opens a popover with a typed field, a month grid, and Clear. The
// old version was a raw <input type="date">, which showed an empty mm/dd/yyyy box and
// handed you the browser's own picker.
//
// `onChange` emits 'YYYY-MM-DD' (or null to clear) — the same shape the API already
// took, so nothing server-side changes. See utils/dueDate for why everything here is
// UTC-based rather than local.

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function Calendar({ selected, onPick }) {
  const today = todayInput();
  const initial = selected || today;
  const [view, setView] = useState(() => {
    const [y, m] = initial.split('-').map(Number);
    return { y, m: m - 1 };
  });

  const step = (delta) => setView(({ y, m }) => {
    const n = m + delta;
    return { y: y + Math.floor(n / 12), m: ((n % 12) + 12) % 12 };
  });

  return (
    <Box sx={{ px: 1.5, pb: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <IconButton size="small" onClick={() => step(-1)} aria-label="Previous month">
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <Typography variant="subtitle2">{monthLabel(view.y, view.m)}</Typography>
        <IconButton size="small" onClick={() => step(1)} aria-label="Next month">
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 32px)', justifyContent: 'center' }}>
        {DOW.map((d, i) => (
          <Typography key={i} variant="caption" color="text.secondary" align="center" sx={{ py: 0.5 }}>
            {d}
          </Typography>
        ))}
        {monthGrid(view.y, view.m).map(({ iso, day, outside }) => {
          const isSelected = iso === selected;
          // Named to avoid shadowing the imported isToday() helper.
          const isTodayCell = iso === today;
          return (
            <Box
              key={iso}
              onClick={() => onPick(iso)}
              sx={{
                height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', borderRadius: '50%', fontSize: 13,
                // Selected wins over today; today is only a ring so both can show.
                bgcolor: isSelected ? 'primary.main' : 'transparent',
                color: isSelected ? 'primary.contrastText'
                  : outside ? 'text.disabled' : 'text.primary',
                fontWeight: isSelected || isTodayCell ? 700 : 400,
                boxShadow: !isSelected && isTodayCell
                  ? theme => `inset 0 0 0 1px ${theme.palette.primary.main}`
                  : 'none',
                '&:hover': { bgcolor: isSelected ? 'primary.dark' : 'action.hover' },
              }}
            >
              {day}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// `compact` is the same control shrunk to a card/row affordance: a dashed calendar ring
// when there's no date (Asana's "Add due date"), the relative label alone once there is.
// Same popover, so a date is set the same way wherever you are.
export default function DueDatePicker({
  value, onChange, readOnly = false, compact = false, size = 24,
}) {
  const [anchor, setAnchor] = useState(null);
  const selected = toInput(value);
  const [typed, setTyped] = useState(selected);
  const [invalid, setInvalid] = useState(false);

  // Reopening (or an external change) should show the current value, not stale text.
  useEffect(() => { setTyped(selected); setInvalid(false); }, [selected, anchor]);

  const commit = (iso) => { onChange(iso); setAnchor(null); };

  const commitTyped = () => {
    if (!typed.trim()) return commit(null);
    const iso = parseTyped(typed);
    if (iso) return commit(iso);
    setInvalid(true);   // keep the popover open so the typo is fixable
    return undefined;
  };

  const overdue = isOverdue(value);

  const openPopover = (e) => {
    if (readOnly) return;
    e.stopPropagation();      // never bubble into "open the card"
    e.preventDefault();
    setAnchor(e.currentTarget);
  };

  const popover = (
    <Popover
      open={!!anchor}
      anchorEl={anchor}
      onClose={() => setAnchor(null)}
      onClick={e => e.stopPropagation()}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { sx: { mt: 0.5, borderRadius: 2 } } }}
    >
      <Box sx={{ p: 1.5, pb: 1 }}>
        <TextField
          size="small"
          autoFocus
          fullWidth
          value={typed}
          error={invalid}
          helperText={invalid ? 'Try 6/4/26 or 2026-06-04' : ' '}
          placeholder="MM/DD/YY"
          onChange={e => { setTyped(e.target.value); setInvalid(false); }}
          onKeyDown={e => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); commitTyped(); }
            if (e.key === 'Escape') setAnchor(null);
          }}
          onBlur={() => { if (typed !== selected) commitTyped(); }}
        />
      </Box>

      <Calendar selected={selected} onPick={commit} />

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', px: 1.5, pb: 1.5, pt: 0.5 }}>
        <Button size="small" onClick={() => commit(null)} disabled={!value}>Clear</Button>
      </Box>
    </Popover>
  );

  if (compact) {
    // No date and read-only → nothing to show; an empty ring would offer a control that
    // does nothing on a completed/archived card.
    if (!value && readOnly) return null;
    return (
      <>
        <Tooltip title={value ? dueExact(value) : 'Add due date'}>
          <Box
            onClick={openPopover}
            onMouseDown={e => e.stopPropagation()}     // don't start a dnd-kit drag
            sx={{
              display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0,
              cursor: readOnly ? 'default' : 'pointer',
              color: overdue ? 'error.main' : 'text.secondary',
              ...(value ? {
                px: 0.5, borderRadius: 1,
                '&:hover': { bgcolor: readOnly ? 'transparent' : 'action.hover' },
              } : {
                width: size, height: size, borderRadius: '50%', justifyContent: 'center',
                border: '1px dashed', borderColor: 'text.disabled', color: 'text.disabled',
                '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
              }),
            }}
          >
            <CalendarTodayOutlinedIcon sx={{ fontSize: value ? 14 : size * 0.55 }} />
            {value && (
              <Typography
                variant="caption"
                color={overdue ? 'error' : 'text.secondary'}
                fontWeight={overdue || isToday(value) ? 700 : 400}
              >
                {formatDueRelative(value)}
              </Typography>
            )}
          </Box>
        </Tooltip>
        {popover}
      </>
    );
  }

  return (
    <>
      <Box
        onClick={e => { if (!readOnly) setAnchor(e.currentTarget); }}
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.75,
          px: 0.75, py: 0.5, ml: -0.75, borderRadius: 1,
          cursor: readOnly ? 'default' : 'pointer',
          '&:hover': { bgcolor: readOnly ? 'transparent' : 'action.hover' },
          '&:hover .due-clear': { opacity: 1 },
        }}
      >
        <CalendarTodayOutlinedIcon
          sx={{ fontSize: 16, color: overdue ? 'error.main' : 'text.secondary' }}
        />
        {value ? (
          <Tooltip title={dueExact(value)}>
            <Typography
              variant="body2"
              color={overdue ? 'error' : 'text.primary'}
              fontWeight={overdue || isToday(value) ? 600 : 400}
            >
              {formatDueRelative(value)}
            </Typography>
          </Tooltip>
        ) : (
          <Typography variant="body2" color="text.secondary">
            {readOnly ? 'No due date' : 'Set due date'}
          </Typography>
        )}
        {value && !readOnly && (
          <Tooltip title="Clear due date">
            <IconButton
              className="due-clear"
              size="small"
              sx={{ p: 0.125, opacity: 0, transition: 'opacity .15s' }}
              onClick={e => { e.stopPropagation(); onChange(null); }}
            >
              <CloseIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {popover}
    </>
  );
}
