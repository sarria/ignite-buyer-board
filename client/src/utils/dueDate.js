// Due dates are CALENDAR DATES, not instants. They're stored at UTC midnight
// (`2026-06-04T00:00:00.000Z`) because the server does `new Date('2026-06-04')`.
//
// So NEVER format one with toLocaleDateString / getDate(): in any negative-offset
// timezone that prints the PREVIOUS day. America/New_York rendered "Jun 3" for a card
// Asana showed as "Jun 4" — every due date on the board was a day early. Always read
// and write the UTC parts, which is what these helpers do. Use them everywhere a due
// date is shown or edited.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');

// Stored value -> 'YYYY-MM-DD' (the shape the API takes back).
export function toInput(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

// Today as a local calendar date. Local is right here: "is this overdue" is a
// question about the user's day, not UTC's.
export function todayInput() {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

// 'YYYY-MM-DD' strings compare lexicographically in date order, so no Date needed.
export const isOverdue = value => !!value && toInput(value) < todayInput();
export const isToday = value => !!value && toInput(value) === todayInput();

// 'Jun 4', or 'Jun 4, 2025' when the year isn't the current one (Asana does this too —
// the year is noise 90% of the time and essential the rest).
export function formatDue(value) {
  const iso = toInput(value);
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const thisYear = Number(todayInput().slice(0, 4));
  return `${MONTHS[m - 1]} ${d}${y === thisYear ? '' : `, ${y}`}`;
}

// Whole days between two 'YYYY-MM-DD' dates. Both sides go through Date.UTC, so a DST
// boundary in between can't make it 23 or 25 hours and round to the wrong day.
const utcMs = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const dayDiff = (isoA, isoB) => Math.round((utcMs(isoA) - utcMs(isoB)) / 86400000);

// 'Today' / 'Tomorrow' / 'in 3 days' / 'Yesterday' / '4 days ago', falling back to the
// plain date. The relative window stops at a week: past that, "in 23 days" is harder to
// act on than "Aug 27", and a buyer scanning a column wants the date.
//
// ALWAYS pair this with `dueExact()` in a tooltip/title — a relative label is easier to
// scan but drops information, and someone will need the actual date.
const RELATIVE_WINDOW = 6;

export function formatDueRelative(value) {
  const iso = toInput(value);
  if (!iso) return '';
  const diff = dayDiff(iso, todayInput());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (diff > 1 && diff <= RELATIVE_WINDOW) return `in ${diff} days`;
  if (diff < -1 && diff >= -RELATIVE_WINDOW) return `${-diff} days ago`;
  return formatDue(value);
}

// The unambiguous long form, for tooltips: 'Thursday, June 4, 2026'.
// timeZone:'UTC' is what keeps toLocaleDateString honest on a UTC-midnight date.
export function dueExact(value) {
  const iso = toInput(value);
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
}

// Accepts what someone actually types: 6/4/26, 06/04/2026, 2026-06-04.
// Returns 'YYYY-MM-DD' or null. Rejects anything that isn't a real date (2/30),
// rather than silently rolling it over the way `new Date()` would.
export function parseTyped(text) {
  const s = (text || '').trim();
  if (!s) return null;

  let y, m, d;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (iso) [, y, m, d] = iso.map(Number);
  else if (us) {
    [, m, d, y] = us.map(Number);
    if (y < 100) y += 2000;
  } else return null;

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  // Catches 2026-02-30, which Date would happily turn into March 2.
  if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

// The 6x7 grid a month is drawn on, including the adjacent-month days that pad it.
// Built in UTC so a DST boundary can't drop or duplicate a day.
export function monthGrid(year, month) {
  const startDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(Date.UTC(year, month, 1 - startDow + i));
    return {
      iso: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      outside: d.getUTCMonth() !== month,
    };
  });
}

export const monthLabel = (year, month) => `${['January', 'February', 'March', 'April', 'May',
  'June', 'July', 'August', 'September', 'October', 'November', 'December'][month]} ${year}`;
