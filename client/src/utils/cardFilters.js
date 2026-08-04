import { toInput, todayInput, dayDiff } from './dueDate';

// The toolbar filters, in one place. Board, archive grid and calendar all run the same
// predicate — it used to be copy-pasted per view, which is how a filter ends up working
// on one view and not another.
//
// `completion` is evaluated separately (matchesCompletion) because the archive view
// deliberately ignores it: archived shows complete + incomplete together.

export const EMPTY_FILTERS = {
  assignee: '',
  tags: [],
  enums: {},        // { [customFieldId]: enumValue } — Health and any other enum field
  due: '',          // overdue | today | next7 | none | has
  column: '',
  lumina: '',       // linked | unlinked
  createdWithin: '',    // '7' | '30' | '90' (days)
  modifiedWithin: '',
  completedWithin: '',
  search: '',
};

// Which keys actually carry a value. Drives the "N" badge on the Filter button and
// what "Clear all" has to reset.
export function activeFilterKeys(f) {
  return Object.keys(EMPTY_FILTERS).filter((k) => {
    if (k === 'search') return false;       // search has its own always-visible box
    if (k === 'tags') return f.tags?.length > 0;
    if (k === 'enums') return Object.values(f.enums || {}).some(Boolean);
    return !!f[k];
  });
}

// Days between a stored timestamp and now. Used by the created/modified/completed
// windows, which ARE instants (unlike due dates) so local is right.
function withinDays(value, days) {
  if (!value) return false;
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return false;
  return (Date.now() - then) / 86400000 <= Number(days);
}

function matchesDue(card, due) {
  const iso = toInput(card.dueDate);
  if (due === 'none') return !iso;
  if (!iso) return false;               // every other due filter implies having one
  if (due === 'has') return true;
  const diff = dayDiff(iso, todayInput());
  if (due === 'overdue') return diff < 0;
  if (due === 'today') return diff === 0;
  if (due === 'next7') return diff >= 0 && diff <= 7;
  return true;
}

export function cardMatchesFilters(card, f) {
  if (f.assignee && card.assigneeId?.toString() !== f.assignee) return false;

  // Match ANY selected tag (OR), which is what "filter by tag" means to a buyer
  // holding two tags they care about.
  if (f.tags?.length && !f.tags.some(t => card.tags?.includes(t))) return false;

  // Enum custom fields (Health and any other). AND across different fields.
  for (const [fieldId, want] of Object.entries(f.enums || {})) {
    if (!want) continue;
    const fv = card.fieldValues?.find(v => v.fieldId?.toString() === fieldId);
    if (fv?.valueEnum !== want) return false;
  }
  if (f.due && !matchesDue(card, f.due)) return false;

  if (f.column && card.columnId?.toString() !== f.column) return false;

  // Linked to a Lumina line item. Counts the legacy advertiser-only shape as linked,
  // matching LuminaPanel and the board glyph. "unlinked" is the useful direction —
  // it's the worklist for what still needs a Lumina link.
  if (f.lumina) {
    const linked = !!(card.lumina?.lineitemId || card.lumina?.advertiserId);
    if (f.lumina === 'linked' && !linked) return false;
    if (f.lumina === 'unlinked' && linked) return false;
  }

  if (f.createdWithin && !withinDays(card.createdAt, f.createdWithin)) return false;
  if (f.modifiedWithin && !withinDays(card.updatedAt, f.modifiedWithin)) return false;
  if (f.completedWithin && !withinDays(card.completedAt, f.completedWithin)) return false;

  // Title only. Tag/assignee/health are filters, not search.
  if (f.search && !card.title.toLowerCase().includes(f.search.toLowerCase())) return false;

  return true;
}

export function matchesCompletion(card, completion) {
  if (completion === 'incomplete') return !card.isCompleted;
  if (completion === 'completed') return !!card.isCompleted;
  return true;
}
