import { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, IconButton, Button, Tooltip, Avatar, Chip,
  Select, MenuItem, FormControl, TextField,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutlined';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlineOutlined';
import CheckBoxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined';
import LinkIcon from '@mui/icons-material/Link';
import {
  toInput, todayInput, monthGrid, monthLabel, addDays, addMonths, weekStart, weekLabel,
} from '../../utils/dueDate';
import { tagColor } from '../../utils/tagColor';
import { userColor } from '../../utils/userColor';

// Month calendar of cards by DUE DATE, mirroring Asana's Calendar view. Cards without a
// due date can't be placed, so they're surfaced as a count rather than silently dropped
// — on these boards most cards have no due date, and a view that quietly hides ~1,100
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
const PER_DAY = 3;                       // before collapsing into "N more" (Months only)
const CARD_H = 56;                       // fixed — see CalendarCard for why
const COLOR_BY_KEY = 'calendar.colorBy';
const MODE_KEY = 'calendar.mode';        // 'month' | 'week'
const WEEKENDS_KEY = 'calendar.weekends';

const initials = (name = '') => name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();

function CalendarCard({ card, health, tint, users, selected, onClick, onToggleComplete }) {
  const assignee = users.find(u => u._id?.toString() === card.assigneeId?.toString());
  const done = !!card.isCompleted;
  const linked = !!(card.lumina?.lineitemId || card.lumina?.advertiserId);
  const subtaskCount = card.subtaskCount || 0;
  const commentCount = card.commentCount || 0;

  return (
    <Box
      onClick={() => onClick(card)}
      sx={{
        display: 'flex', alignItems: 'flex-start', gap: 0.5,
        // FIXED height, and it has to be fixed. Grid row sizing measures a wrapping title
        // at its unwrapped (max-content) width — one line — so with an auto/minHeight card
        // the row was sized for short cards, then layout wrapped titles to two lines and
        // they overflowed into the next week. A definite height is what intrinsic sizing
        // actually respects, and it gives Asana's uniform card look for free.
        // Fits: 2 clamped title lines (2.6em @ 11.5px ≈ 30) + meta row (~16) + py (8).
        flexShrink: 0, height: CARD_H, boxSizing: 'border-box', overflow: 'hidden',
        px: 0.625, py: 0.5, borderRadius: 1.5, cursor: 'pointer',
        // A DONE card drops its colour entirely (Asana does this): no fill, no health
        // edge, everything muted. Colour on this board means "needs attention", so a
        // finished card keeping a bright Health fill competes with live work for the eye.
        bgcolor: done ? 'transparent' : (tint || 'background.paper'),
        border: done ? '1px solid' : 0,
        borderColor: 'divider',
        borderLeft: done ? '1px solid' : '3px solid',
        borderLeftColor: done ? 'divider' : (health ? HEALTH_COLORS[health] : 'transparent'),
        opacity: done ? 0.65 : 1,
        boxShadow: selected
          ? theme => `0 0 0 2px ${theme.palette.primary.main}`
          : done ? 'none' : '0 1px 2px rgba(0,0,0,.08)',
        '&:hover': { filter: 'brightness(0.97)' },
        // Asana's move: the complete button slides in from the left on hover, pushing
        // the content over, and slides back out. Width (not just opacity) is what makes
        // it push rather than overlap.
        '&:hover .cal-complete': { width: 18, opacity: 1, mr: 0.25 },
      }}
    >
      <Box
        className="cal-complete"
        sx={{
          // Hover-only for BOTH states. Done-ness is signalled by the small grey tick
          // beside the avatar; this button is purely the toggle affordance, and it shows
          // filled-green on a done card to say "complete — click to undo".
          width: 0, opacity: 0, overflow: 'hidden', flexShrink: 0,
          transition: 'width .15s ease, opacity .15s ease, margin-right .15s ease',
        }}
      >
        <Tooltip title={done ? 'Mark incomplete' : 'Mark task complete'}>
          <IconButton
            size="small"
            sx={{ p: 0, color: done ? '#4caf50' : 'text.secondary', '&:hover': { color: '#4caf50' } }}
            onClick={(e) => { e.stopPropagation(); onToggleComplete?.(card); }}
          >
            {done
              ? <CheckCircleIcon sx={{ fontSize: 16 }} />
              : <CheckCircleOutlineIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      {assignee && (
        <Tooltip title={assignee.name}>
          <Avatar sx={{ width: 18, height: 18, fontSize: 9, bgcolor: userColor(assignee), flexShrink: 0, mt: '1px', opacity: done ? 0.6 : 1 }}>
            {initials(assignee.name)}
          </Avatar>
        </Tooltip>
      )}

      {/* Done state at rest: a quiet grey tick before the title (Asana's signal), which
          stays visible while the green toggle slides in on hover. */}
      {done && <CheckIcon sx={{ fontSize: 13, color: 'text.secondary', flexShrink: 0, mt: '2px' }} />}

      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Two-line clamp with a hard maxHeight as the real guarantee — -webkit-box alone
            isn't reliable cross-browser, and the fallback has to be "clipped at two
            lines", never "no height at all". */}
        <Typography
          variant="caption"
          component="div"
          sx={{
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', lineHeight: 1.3, fontSize: 11.5,
            maxHeight: '2.6em', minHeight: '1.3em', wordBreak: 'break-word',
            color: done ? 'text.disabled' : 'text.primary',
          }}
        >
          {card.title}
        </Typography>

        {(linked || subtaskCount > 0 || commentCount > 0 || card.tags?.length > 0) && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
            {/* Same blue link glyph as the board card — one meaning, learned once. */}
            {linked && (
              <Tooltip title={card.lumina?.name ? `Lumina · ${card.lumina.name}` : 'Linked to Lumina'}>
                <LinkIcon sx={{ fontSize: 13, color: 'primary.main' }} />
              </Tooltip>
            )}
            {subtaskCount > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.125 }}>
                <CheckBoxOutlinedIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                  {card.subtaskDone || 0}/{subtaskCount}
                </Typography>
              </Box>
            )}
            {commentCount > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.125 }}>
                <ChatBubbleOutlineIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                  {commentCount}
                </Typography>
              </Box>
            )}
            <Box sx={{ flex: 1 }} />
            {card.tags?.slice(0, 3).map(t => (
              <Tooltip key={t} title={t}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tagColor(t).dot, flexShrink: 0 }} />
              </Tooltip>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

export default function CalendarView({
  cards, fields, users, columns = [], selectedCardId, onCardClick, onToggleComplete, onAddCard,
  addSignal = 0,
}) {
  const today = todayInput();
  // ONE date anchor drives both modes — Months renders the month containing it, Weeks the
  // week containing it, and prev/next steps by whichever unit is showing.
  const [anchor, setAnchor] = useState(today);
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(MODE_KEY) || 'month'; } catch { return 'month'; }
  });
  const [expanded, setExpanded] = useState({});   // iso -> true, per-day "show all"
  const [composing, setComposing] = useState(null);   // iso of the day being added to
  const [draft, setDraft] = useState('');
  // Column colours are all the seeded default until someone changes them, so Health —
  // which has four real colours — is the useful default here.
  const [colorBy, setColorBy] = useState(() => {
    try { return localStorage.getItem(COLOR_BY_KEY) || 'health'; } catch { return 'health'; }
  });
  // OFF by default: buying work is weekday-shaped, and dropping Sat/Sun buys ~30% more
  // width per day. Cards genuinely due on a weekend are reported by the "Weekend · N" chip.
  const [weekends, setWeekends] = useState(() => {
    try { return (localStorage.getItem(WEEKENDS_KEY) || 'hide') === 'show'; } catch { return false; }
  });
  // Header "Add task": jump to today and open that day's composer, so the new card lands
  // somewhere visible instead of on a date you can't see.
  useEffect(() => {
    if (!addSignal) return;
    setAnchor(today);
    setComposing(today);
    setDraft('');
  }, [addSignal]);   // eslint-disable-line react-hooks/exhaustive-deps

  const persist = (key, v, set) => {
    set(v);
    try { localStorage.setItem(key, v); } catch { /* ignore */ }
  };

  const healthField = useMemo(
    () => fields.find(f => f.name === 'Health' && f.type === 'enum'),
    [fields]
  );
  const columnColor = useMemo(
    () => Object.fromEntries(columns.map(c => [c._id?.toString(), c.color])),
    [columns]
  );

  const healthOf = (card) => healthField
    && card.fieldValues?.find(v => v.fieldId?.toString() === healthField._id?.toString())?.valueEnum;

  // The fill. `alpha` on the source colour keeps it legible in both themes instead of
  // hardcoding pastels that only work in light mode.
  const tintOf = (card) => {
    if (colorBy === 'none') return null;
    const base = colorBy === 'column'
      ? columnColor[card.columnId?.toString()]
      : HEALTH_COLORS[healthOf(card)];
    if (!base) return null;
    return theme => alpha(base, theme.palette.mode === 'dark' ? 0.28 : 0.16);
  };

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

  const isWeek = mode === 'week';
  const [ay, am] = anchor.split('-').map(Number);
  const grid = isWeek
    ? Array.from({ length: 7 }, (_, i) => {
      const iso = addDays(weekStart(anchor, 1), i);
      return { iso, day: Number(iso.slice(8)), outside: false };
    })
    : monthGrid(ay, am - 1, 1);

  // Weeks start Monday, so within every run of 7 the weekend is always indexes 5 and 6 —
  // true for the month grid (6x7) and the single week alike.
  const visibleGrid = weekends ? grid : grid.filter((_, i) => i % 7 < 5);
  const colCount = weekends ? 7 : 5;
  const dowLabels = weekends ? DOW : DOW.slice(0, 5);

  // Hiding weekends hides any card DUE on one. Say so rather than silently dropping them,
  // same rule as the no-due-date chip.
  const weekendHidden = weekends
    ? 0
    : grid.filter((_, i) => i % 7 >= 5).reduce((n, c) => n + (byDay[c.iso]?.length || 0), 0);

  const step = (delta) => setAnchor(a => (isWeek ? addDays(a, delta * 7) : addMonths(a, delta)));
  const label = isWeek ? weekLabel(weekStart(anchor, 1)) : monthLabel(ay, am - 1);

  const commitAdd = async (iso) => {
    const title = draft.trim();
    setDraft('');
    if (!title) { setComposing(null); return; }
    await onAddCard?.(title, iso);
    setComposing(iso);   // stay open so a run of cards can be typed into one day
  };

  return (
    <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', p: 2, pt: 1 }}>
      {/* Nav */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, flexShrink: 0 }}>
        <Button size="small" onClick={() => setAnchor(today)} variant="outlined">Today</Button>
        <IconButton size="small" onClick={() => step(-1)} aria-label="Previous">
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={() => step(1)} aria-label="Next">
          <ChevronRightIcon fontSize="small" />
        </IconButton>
        <Typography variant="h6" sx={{ ml: 0.5 }}>{label}</Typography>
        <Box sx={{ flex: 1 }} />
        {noDate > 0 && (
          <Tooltip title="Cards with no due date can't be placed on a calendar. Set a due date and they'll appear.">
            <Chip size="small" variant="outlined" label={`No due date · ${noDate}`} />
          </Tooltip>
        )}
        {weekendHidden > 0 && (
          <Tooltip title="Cards due on a Saturday or Sunday, hidden while weekends are off.">
            <Chip size="small" variant="outlined" label={`Weekend · ${weekendHidden}`} />
          </Tooltip>
        )}
        <FormControl size="small">
          <Select
            value={weekends ? 'show' : 'hide'}
            onChange={e => {
              const v = e.target.value;
              setWeekends(v === 'show');
              try { localStorage.setItem(WEEKENDS_KEY, v); } catch { /* ignore */ }
            }}
            sx={{ height: 30, fontSize: '0.8125rem', '& .MuiSelect-select': { py: 0 } }}
          >
            <MenuItem value="show">Weekends: On</MenuItem>
            <MenuItem value="hide">Weekends: Off</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small">
          <Select
            value={mode}
            onChange={e => persist(MODE_KEY, e.target.value, setMode)}
            sx={{ height: 30, fontSize: '0.8125rem', '& .MuiSelect-select': { py: 0 } }}
          >
            <MenuItem value="week">Weeks</MenuItem>
            <MenuItem value="month">Months</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small">
          <Select
            value={colorBy}
            onChange={e => persist(COLOR_BY_KEY, e.target.value, setColorBy)}
            sx={{ height: 30, fontSize: '0.8125rem', '& .MuiSelect-select': { py: 0 } }}
          >
            <MenuItem value="health">Color: Health</MenuItem>
            <MenuItem value="column">Color: Column</MenuItem>
            <MenuItem value="none">Color: None</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {/* Weekday header */}
      <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`, flexShrink: 0 }}>
        {dowLabels.map(d => (
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
          display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)`,
          // MUST be plain `max-content`. Measured in the browser: `auto` and
          // `minmax(132px, max-content)` both pinned every row to its minimum and let busy
          // days spill into the next week. Growing a track from base to growth-limit
          // happens in grid's "maximize tracks" step, which distributes FREE space — and
          // there is none here, since the grid already overflows and scrolls. `max-content`
          // sets the base size directly, so it doesn't need free space. The per-row floor
          // comes from the cell's own minHeight.
          // Weeks is instead a single row filling the height, so every card fits.
          gridAutoRows: isWeek ? '1fr' : 'max-content',
          borderTop: 1, borderLeft: 1, borderColor: 'divider',
        }}
      >
        {visibleGrid.map(({ iso, day, outside }) => {
          const dayCards = byDay[iso] || [];
          const isToday = iso === today;
          // Weeks has room for everything, so no "N more" there.
          const show = (isWeek || expanded[iso]) ? dayCards : dayCards.slice(0, PER_DAY);
          const hidden = dayCards.length - show.length;
          return (
            <Box
              key={iso}
              sx={{
                borderRight: 1, borderBottom: 1, borderColor: 'divider',
                p: 0.5, minWidth: 0, minHeight: isWeek ? 0 : 2 * CARD_H + 30,
                overflowY: isWeek ? 'auto' : 'visible',
                '&:hover .cal-add': { opacity: 1 },
                // Explicit flex column so cards stack predictably. NOT overflow:hidden —
                // "Show more" has to make the week ROW grow (gridAutoRows max-content),
                // and clipping an expanded day would hide cards outright, which is worse
                // than a tall row. Spilling was a symptom of the card-collapse bug, fixed
                // by the card's own minHeight.
                display: 'flex', flexDirection: 'column', gap: 0.375,
                bgcolor: outside ? 'action.hover' : 'transparent',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
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
                  health={healthOf(card)}
                  tint={tintOf(card)}
                  users={users}
                  selected={selectedCardId === card._id}
                  onClick={onCardClick}
                  onToggleComplete={onToggleComplete}
                />
              ))}

              {/* "2 more" ⇄ "Show less", as Asana does: a quiet grey link, and expanding
                  grows the whole week ROW rather than scrolling or clipping the cell
                  (gridAutoRows max-content is what lets the row stretch). Rendered on
                  card count, not on `hidden`, so it survives being expanded. */}
              {/* One footer row: "N more" and "+ Add task" side by side. They were stacked,
                  which cost a whole extra line of height in every busy cell. */}
              {composing !== iso && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                  {!isWeek && dayCards.length > PER_DAY && (
                    <Typography
                      variant="caption"
                      onClick={() => setExpanded(p => ({ ...p, [iso]: !p[iso] }))}
                      sx={{
                        px: 0.5, py: 0.25, cursor: 'pointer',
                        color: 'text.secondary',
                        '&:hover': { color: 'text.primary', textDecoration: 'underline' },
                      }}
                    >
                      {expanded[iso] ? 'Show less' : `${hidden} more`}
                    </Typography>
                  )}
                  {onAddCard && (
                    <Typography
                      className="cal-add"
                      variant="caption"
                      onClick={() => { setComposing(iso); setDraft(''); }}
                      sx={{
                        px: 0.5, py: 0.25, cursor: 'pointer',
                        color: 'text.secondary', opacity: 0, transition: 'opacity .12s',
                        '&:hover': { color: 'text.primary' },
                      }}
                    >
                      + Add task
                    </Typography>
                  )}
                </Box>
              )}

              {/* Inline add, revealed on cell hover. Creating from a day cell is the point
                  of a calendar: the due date is implied by where you clicked, so it needs
                  no date picker. Stays open after Enter so a run of cards can be typed. */}
              {onAddCard && composing === iso && (
                <TextField
                  size="small"
                  autoFocus
                  fullWidth
                  placeholder="Card title"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitAdd(iso); }
                    if (e.key === 'Escape') { setDraft(''); setComposing(null); }
                  }}
                  onBlur={() => { setComposing(null); setDraft(''); }}
                  sx={{ flexShrink: 0, '& .MuiOutlinedInput-input': { py: 0.5, fontSize: 11.5 } }}
                />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
