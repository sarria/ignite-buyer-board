# Board migration runbook (Asana → Ignite Buyer Board)

How to import an Asana project as a board, re-import one cleanly, and link cards to
Lumina. Written to be followed step by step months from now.

**Design notes and the "why" live in `CLAUDE.md`** (*Migration*, *Lumina*, *Deletion &
Cleanup Rules*). This file is the operational procedure. If they disagree, the code wins —
fix both.

---

## Prerequisites

In `.env` (see `.env.example`):

| Var | Needed for |
|---|---|
| `ASANA_PAT` | reading Asana (`asana-migrate.js`) |
| `MONGODB_URI` | writing the DB (`asana-seed.js`) |
| `AWS_*`, `S3_BUCKET`, `S3_PREFIX` | attachment uploads. Needs `s3:PutObject` **and** `s3:DeleteObject` |
| `LUMINA_API_TOKEN` | `lumina-match.js` (unset → it exits) |
| `DNS_SERVERS` | only if `querySrv ECONNREFUSED` locally (hotspot/VPN). Blank in prod |

Run every command from the repo root.

---

## 1. Find the project GID

```bash
node migration/asana-explore.js
```

Or read it off the Asana URL: `app.asana.com/0/<gid>/list`.

Known boards:

| Board | GID |
|---|---|
| The A Team (Team Rachel) | `1156457376337923` |
| The Dream Team (Team Conrad) | `1205337491932114` |
| Team Kathy | `1208888075650797` |
| Team T Tots (Team Travis) | `1205337491932125` |

> Careful: T Tots is `…932125` and Dream Team is `…932114` — one digit apart. Paste, don't type.
> (T Tots wasn't visible to the `ASANA_PAT` user until 2026-08-04; if a board can't be
> found, that's usually project membership rather than a wrong name.)

---

## 2. Export from Asana → JSON

```bash
node migration/asana-migrate.js --project=<gid> [--out=<file>]
```

- `--project` is **required, no default** — a default meant an accidental run re-exported
  the wrong board over the file you wanted, and each board is thousands of API calls.
- `--out` optional; otherwise derived from the project's real name
  (`asana-export-team-kathy.json`). Always written into `migration/`.
- **This is the slow, expensive step**: it uploads every Asana attachment to S3, and since
  2026-08-04 it also fetches comments for **every subtask** — one extra API call each
  (~7.7k for Rachel's board, roughly 20 extra minutes). Asana exposes no comment count to
  filter on, so there's no way to ask only the subtasks that have them. Worth it: ~32% of
  subtasks carry comments and they were being dropped entirely.
  Resumable — S3 keys are deterministic (`buyer-board/{taskGid}/{attGid}-{name}`) and
  existing objects are skipped via HeadObject, so Ctrl-C then re-run costs little.
- External-link attachments (Google Drive/Dropbox) have no bytes and are skipped.
- Export JSONs are gitignored (they hold real client data).

**Don't overwrite your only good export.** Let the derived name be used, or `--out` to a
new file, so the previous export survives until the new one succeeds.

---

## 3. Seed JSON → MongoDB

```bash
node migration/asana-seed.js <export-file.json>          # interactive (recommended)
node migration/asana-seed.js <export-file.json> --auto   # no prompts
```

Idempotent — upserts by `asanaGid`, so re-running updates rather than duplicates.
Creates the board (keyed on `asanaProjectGid`), columns, custom fields, cards, subtasks,
comments, tags, attachments. Users are upserted from assignees.

### Use interactive mode on a board you haven't imported before

`--auto`'s patterns were tuned to Rachel's column names and **silently mis-handle others**:

```
asana-seed.js:110   archivePatterns = ['cancelled', 'completed campaign']
asana-seed.js:111   skipPatterns    = ['duplicate']
```

A column named plain `Completed` does **not** match `'completed campaign'`, so it stays an
active column and dumps historical campaigns onto the live board. Columns are per board by
design (business rule 5), so no global pattern list can be right for all of them.

Decisions for the known boards (confirmed 2026-08-03):

| Board | Archive | Skip |
|---|---|---|
| The A Team (Team Rachel) | `Cancelled Clients`, `Completed Campaigns` | `Duplicate Task Board` |
| The Dream Team (Team Conrad) | `Completed` | — |
| Team Kathy | `Completed`, `Cancelled Clients` | `Template / Example` |
| Team T Tots (Team Travis) | `Completed`, `Cancelled Clients` | `Template / Example` |

T Tots has 13 columns including two that aren't workflow stages — `University of Alabama`
(one client) and `OOO Section`. Left active by default; decide at the prompt whether
buyers still work out of them.

`Template / Example` holds Asana task templates, which we don't import (still in
*Planned*) — left in, they'd become ordinary cards.

**Archiving a column ≠ marking cards complete** (business rule 1). Archive hides the
column behind the archive toggle; `isCompleted` comes from Asana independently.

---

## 4. Link cards to Lumina

```bash
node migration/lumina-match.js --board=<boardId>            # dry run — writes a report
node migration/lumina-match.js --board=<boardId> --apply    # write the links
```

Mines identifiers buyers already paste into descriptions. Writes **only** the `lumina`
link subdoc, never Lumina data. Dry run is the default; read
`migration/lumina-match-report.json` before applying.

Other flags: `--relink` (reconsider already-linked cards) · `--limit=N` ·
`--pace=400` (ms between cards) · `--revert=<report>`.

- **`lookup-failed` in the output = Lumina throttling (HTTP 429), not bad data.** Re-run
  with `--pace=400`; successes are already linked so it only retries failures.
- **`wo-not-found` is usually real** — short old WO numbers for campaigns aged out of
  Lumina's SEM cohort.
- **Ambiguous cards are skipped on purpose.** A WO is an *order* number → several line
  items; the tie is broken only on the product tag in the card title (`[SEM]`/`[PMAX]`).
  If that doesn't single one out, no link is written. A wrong link is worse than none,
  because the drawer presents it as fact.
- Re-seeding does **not** clobber `lumina` (it isn't in the seeder's `$set`), so links
  survive a re-seed and match order doesn't matter.

### Undo an apply

```bash
node migration/lumina-match.js --revert=migration/lumina-match-applied-<ts>.json
```

Apply runs write their own timestamped report — that file is the only record of what to
undo, so don't delete it. Revert only touches cards that run linked, and only if the link
still matches, so links buyers attached by hand survive.

Baseline for comparison — Rachel's board, 2026-08-03, measured while still pointing at
**release**: 2,412 cards, 484 carrying an identifier, 390 linked (354 pasted URL, 33
description WO, 3 title WO); skipped 94. Expect **better on production** — release's data
stopped ~2026-05-22, so every recent campaign counted as `url-unresolved` or
`wo-not-found`. Re-run any board that was matched before the 2026-08-03 switch.

---

## 5. Verify

- Open a card with migrated images — **inline images are the most likely thing to break.**
- Check a card's Lumina panel resolves (`WY Cheyenne Brown N Gold [SEM]` is a good probe).
- Confirm archived columns are behind the archive toggle, not on the board.
- Confirm the board appears in the sidebar and dashboard.

---

## Clean re-import of an existing board

For **testing only** — this destroys buyer-entered data on that board. Once teams are
working in the app, see *Once the boards are in real use* below.

> ### ⚠️ Delete the board and you delete its S3 images
> After deleting, you **must re-run `asana-migrate.js`** — you cannot re-seed from an old
> export. That JSON's `<img>` URLs point at objects the cascade just deleted, so every
> migrated comment renders a broken image **with no error anywhere**. Because S3 keys are
> deterministic, re-migrating restores the exact same URLs.

1. **Archive the board** — dashboard → board ⋯ → *Archive*. Delete is refused on a
   non-empty active board (`409 BOARD_NOT_EMPTY`, `boards.js:83`).
2. **Delete it** — same ⋯ menu → *Delete*. Cascades cards, subtasks, comments, columns,
   custom fields, templates, plus S3 deletion of attachments **and** inline images in
   descriptions and comment bodies.
   Deliberately survives: the `users` collection (shared) and `app_settings.luminaFields`
   (app-wide, not per board).
3. **Re-export** — step 2 above. Expect drift from your last export: this pulls whatever
   changed in Asana since.
4. **Re-seed** — step 3.
5. **Re-link Lumina** — step 4.

> **Boards imported before 2026-08-04 are missing subtask comments and assignees.** The
> assignees can be backfilled from the existing export (they were captured, just dropped by
> the seeder), but **comments were never exported** — recovering those needs a full
> re-migrate of that board.
6. **Verify** — step 5.

Note the board gets a **new `_id`**, so old deep links (`?card=…`) and bookmarks break.

---

## Once the boards are in real use — change the strategy

Re-seeding is safe against *duplication* (upsert by `asanaGid`) but **not** against
*overwriting*. Card fields are `$set` unconditionally (`asana-seed.js:318`), so a re-seed
replaces `description`, `descriptionHtml`, `tags`, `assigneeId`, `dueDate`, `isCompleted`
and `isArchived` with Asana's version — silently discarding buyer edits made here.

The fix is field-level, not "stop re-seeding": move buyer-mutable fields to
`$setOnInsert` and leave `$set` carrying only what Asana still owns. Comments are the
harder half — they upsert by `asanaGid` so native comments are safe, but there's no rule
yet for an Asana comment edited after import.

**Not built** (2026-08-03), deliberately: the right rules depend on whether Asana stays
authoritative during the transition, and guessing now means building the wrong thing.
Decide that before the first team cuts over.

Attachments already do the right thing: a re-seed keeps user-uploaded files (native, under
`buyer-board/uploads/`) and replaces only the Asana-migrated ones.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `querySrv ECONNREFUSED` | Flaky local DNS. Set `DNS_SERVERS=1.1.1.1,8.8.8.8`. Never in prod. |
| `Lumina 429` / `lookup-failed` | Throttling. Re-run with `--pace=400`. |
| Lots of `url-unresolved`, all recent campaigns | Check `LUMINA_API_BASE` is **production** (`townsquarelumina.com`), not `release11` — release's data was frozen ~2026-05-22, so anything newer returns `{found:false}`. Not a data problem. Note prod needs its own token; changing the base alone 401s everything. |
| Broken images after a re-import | Re-seeded from a stale export after the S3 files were deleted. Re-run `asana-migrate.js`. |
| `Archive the board before deleting it` (409) | Working as designed (rule 7). Archive first. |
| `Export file not found` | Path is resolved relative to `migration/`. Pass just the filename. |
| `--project must be an Asana project GID` | Digits only; it's the middle number in the Asana URL. |
| Attachment uploads fail with 403 | IAM user needs `s3:PutObject`/`s3:DeleteObject` on `buyer-board/*`. |
| Historical campaigns on the live board | Ran `--auto` on a board whose archive column isn't named `Cancelled …`/`Completed Campaign…`. Re-seed interactively. |
