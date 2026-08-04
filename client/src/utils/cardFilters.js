// The toolbar filters, in one place. Board, archive grid and calendar all run the same
// predicate — it used to be copy-pasted per view, which is how a filter ends up working
// on one view and not another.
//
// `completion` is passed separately because the archive view deliberately ignores it
// (archived shows complete + incomplete together).

export function cardMatchesFilters(card, { assignee, health, tags, search, healthField }) {
  if (assignee && card.assigneeId?.toString() !== assignee) return false;

  if (health && healthField) {
    const fv = card.fieldValues?.find(v => v.fieldId?.toString() === healthField._id?.toString());
    if (fv?.valueEnum !== health) return false;
  }

  // Match ANY selected tag (OR), which is what "filter by tag" means to a buyer
  // holding two tags they care about.
  if (tags?.length && !tags.some(t => card.tags?.includes(t))) return false;

  // Title only. Tag/assignee/health are filters, not search.
  if (search && !card.title.toLowerCase().includes(search.toLowerCase())) return false;

  return true;
}

export function matchesCompletion(card, completion) {
  if (completion === 'incomplete') return !card.isCompleted;
  if (completion === 'completed') return !!card.isCompleted;
  return true;
}
