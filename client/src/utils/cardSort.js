// Asana's List/Board "Sort" — one active field + direction, applied WITHIN each
// group/column (never across them, so grouping still means something). 'manual' is
// the default (drag order / position) and is the only mode that allows drag reordering.

export const SORT_NONE = 'manual';

export const baseSortFields = [
  { key: 'title', label: 'Task name' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'dueDate', label: 'Due date' },
  { key: 'created', label: 'Date created' },
];

// Enum fields (Health etc.) are sorted by their position in the field's own options
// list — that's the order someone chose when defining the field (e.g. Good..Needs
// Work), which is more meaningful than alphabetical.
export function sortFieldsFor(enumFields = []) {
  return [
    ...baseSortFields,
    ...enumFields.map(f => ({ key: `enum:${f._id}`, label: f.name, options: f.options || [] })),
  ];
}

function enumRank(card, field) {
  const v = card.fieldValues?.find(x => x.fieldId?.toString() === field._id?.toString())?.valueEnum;
  if (!v) return null;
  const idx = (field.options || []).indexOf(v);
  return idx < 0 ? field.options?.length ?? 0 : idx;
}

function compareBy(a, b, sortBy, users, enumFields) {
  if (sortBy === 'title') {
    return (a.title || '').localeCompare(b.title || '');
  }
  if (sortBy === 'assignee') {
    const an = users?.find(u => u._id?.toString() === a.assigneeId?.toString())?.name || '';
    const bn = users?.find(u => u._id?.toString() === b.assigneeId?.toString())?.name || '';
    if (!an && bn) return 1;
    if (an && !bn) return -1;
    return an.localeCompare(bn);
  }
  if (sortBy === 'dueDate') {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0;
  }
  if (sortBy === 'created') {
    const ac = a.createdAt || '';
    const bc = b.createdAt || '';
    return ac < bc ? -1 : ac > bc ? 1 : 0;
  }
  if (sortBy?.startsWith('enum:')) {
    const fieldId = sortBy.slice(5);
    const field = enumFields?.find(f => f._id?.toString() === fieldId);
    if (!field) return 0;
    const ar = enumRank(a, field);
    const br = enumRank(b, field);
    if (ar == null && br == null) return 0;
    if (ar == null) return 1;
    if (br == null) return -1;
    return ar - br;
  }
  return 0;
}

// Stable sort, ascending or descending, unaffected fields fall back to position so
// ties don't jitter on every render.
export function sortCards(cards, sortBy, direction, { users, enumFields } = {}) {
  if (!sortBy || sortBy === SORT_NONE) return cards;
  const dir = direction === 'desc' ? -1 : 1;
  return [...cards].sort((a, b) => {
    const c = compareBy(a, b, sortBy, users, enumFields);
    if (c !== 0) return c * dir;
    return (a.position ?? 0) - (b.position ?? 0);
  });
}
