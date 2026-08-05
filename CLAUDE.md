# CLAUDE.md — Ignite Buyer Board

Everything needed to rebuild this app to its **current state**. Read it fully before
coding. It describes what IS built; a "Planned / not yet built" section at the end
lists what is intentionally deferred. No aspirational code lives in this file.

## Keep this file current (read this)

This is the source of truth — update it in the **same change** that alters behavior, so
it never drifts:
- New/changed **DB fields** → *Database*; new **endpoints** → *API Routes*; new **env
  vars** → *Environment Variables*; **design/behavior** decisions → *Design* /
  *Key Business Rules*; new **dependencies** → *Tech Stack*.
- When you finish something from **Planned / Not Yet Built**, move it into the built
  sections.
- Keep it lean and accurate — document only what IS built; no aspirational code or BS.
- If the code and this file disagree, the **code wins** — fix the doc.

---

## What You Are Building

A kanban-style account-management tool that replaces Asana for Ignite buying teams.
Buyers track advertiser accounts across columns, log optimization notes (comments,
often with pasted performance-dashboard images), attach files, and keep historical
records migrated from Asana. It must feel fast and simple.

Each board = one Asana "project" (e.g. "The A Team (Team Rachel)"). Columns, custom
fields, and templates are **per board** (nothing is shared across boards), mirroring
Asana where sections and task templates are project-scoped.

---

## Tech Stack

- **Frontend**: React 19 + Vite + Material UI (MUI v9), `@dnd-kit` (drag/drop),
  axios, **TipTap** (rich text editor), **DOMPurify** (sanitize migrated HTML),
  react-router-dom v7.
- **Backend**: Node.js (JavaScript only, CommonJS), Express 5. MongoDB official
  driver (no Mongoose/ODM). `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
  for file storage.
- **Database**: MongoDB Atlas.
- **File/image storage**: AWS S3 (see "Files & Images").
- **Auth**: **currently a stub** (hardcoded dev user). Microsoft SSO via MSAL is planned.
- **Hosting**: Vercel (client built static + Express as a serverless function).

Do not introduce TypeScript, GraphQL, Mongoose, or other frameworks. Frontend uses
ES modules; backend uses CommonJS. Async/await everywhere. No inline styles — MUI `sx`.

---

## Project Structure

```
/
├── client/                          # React + Vite frontend
│   └── src/
│       ├── api/                     # axios calls: boards, columns, fields, cards,
│       │                            #   subtasks, comments, templates, users, uploads, client
│       ├── components/
│       │   ├── Board/               # BoardColumn, BoardCard, CardFace, ArchivedCard,
│       │   │                        #   ArchivedGrid, CalendarView, BoardFilters
│       │   ├── Card/                # CardDrawer, CardComments, CardSubtasks
│       │   ├── common/              # Sidebar, RichEditor, RichTextField, RichContent,
│       │   │                        #   Collapsible, DueDatePicker
│       │   └── settings/            # LuminaFieldPicker (shared by the global + board pickers)
│       ├── context/                 # AppContext (theme light/dark)
│       ├── pages/                   # BoardListPage (dashboard), BoardPage,
│       │   │                        #   BoardSettingsPage, AdminUsersPage,
│       │   │                        #   AdminLuminaFieldsPage
│       │   └── settings/            # ColumnsTab, FieldsTab, TemplatesTab, LuminaTab
│       ├── utils/                   # tagColor, userColor, linkify, lastBoard,
│       │                            #   boardCache, luminaFields, dueDate, cardFilters
│       ├── theme.js                 # light/dark MUI themes
│       ├── App.jsx                  # router + fixed app-shell layout
│       └── main.jsx
├── server/                          # Express backend
│   ├── app.js                       # builds + exports the Express app (no listen)
│   ├── index.js                     # local dev: connectDb + app.listen
│   ├── routes/                      # one file per resource (+ uploads)
│   ├── controllers/                 # handler logic
│   ├── middleware/                  # auth (stub), error
│   ├── lib/                         # s3.js (presign + delete + publicUrl)
│   └── db/                          # index.js (connection + indexes), test-connection.js
├── api/index.js                     # Vercel serverless entry → exports server/app
├── migration/                       # asana-explore.js, asana-migrate.js, asana-seed.js,
│                                    #   lumina-match.js, README.md (runbook)
│                                    #   (+ asana-export-rachel.json, gitignored)
├── scripts/screenshot.mjs           # dev-only: CDP screenshot of a running page (see below)
├── vercel.json                      # build client → client/dist, route /api/* to function
└── CLAUDE.md / SPEC.md / API.md
```

---

## Database

Official MongoDB Node driver with a cached connection pool. `getDb()` lazily calls
`connectDb()` (so serverless invocations work without a startup hook).

### Collections
`users, boards, columns, custom_fields, cards, subtasks, comments, card_templates,
app_settings`

### Document shapes (current)

```javascript
// users
{ _id, name, email /*unique*/, role /*'admin'|'member'*/, microsoftId, defaultBoardId, createdAt }

// boards
{ _id, name, description, createdBy, createdAt, asanaProjectGid, isArchived,
  luminaFields: { hiddenLineItemFields:[String], hiddenAdvertiserFields:[String],
                  updatedAt, updatedBy } | absent }   // absent = inherit the global setting

// columns  (per board)
{ _id, boardId, name, position, color /*hex*/, asanaGid, createdAt }

// custom_fields  (per board)
{ _id, boardId, name, type /*'text'|'number'|'date'|'url'|'enum'*/, options:[String],
  isRequired, position, asanaGid }

// cards
{ _id, boardId, columnId, title,
  assigneeId, dueDate, position,
  description,            // plain text
  descriptionHtml,        // rich HTML (migrated/inline images); null if plain
  isArchived,             // archive = lives in an archive-named column / manual archive
  isCompleted, completedAt, // completion is SEPARATE from archive
  tags: [String],
  attachments: [ { name, url /*S3*/, isImage, inline /*true=shown inside description/comment*/, createdAt } ],
  fieldValues: [ { fieldId, valueText, valueNumber, valueDate, valueEnum } ],
  lumina: { lineitemId, advertiserId, name, attachedAt } | null,  // link ONLY — see Lumina
                          // legacy shape (pre-line-items) has advertiserId only; still renders
  asanaGid, asanaProjectGid, createdAt, updatedAt }

// subtasks
{ _id, cardId, title, assigneeId, dueDate, isComplete, notes, position, asanaGid, createdAt }

// comments
{ _id, cardId, authorId /*null for migrated*/,
  body,                   // plain text
  bodyHtml,               // rich HTML w/ inline images (null if plain)
  isMigrated, migratedAuthorName, migratedAuthorEmail,
  asanaGid, createdAt /*preserve original Asana timestamp on migration*/ }

// app_settings  — app-wide config as single named docs (string _id). NOT per-board,
//                 so nothing here is touched by the board delete cascade.
{ _id: 'luminaFields', advertiserFields: [String], lineItemFields: [String],
  updatedAt, updatedBy }   // absent doc = show every Lumina field

// card_templates  (per board)
{ _id, boardId, name, descriptionTemplate, defaultColumnId, defaultAssigneeId,
  dueDateOffsetDays, defaultFieldValues:[...], defaultSubtasks:[{title, dueDateOffsetDays}],
  position, createdAt }
```

### Indexes (created on startup, in `server/db/index.js`)
```
users.email unique; users.microsoftId unique sparse
columns {boardId, position}
custom_fields {boardId, position}
cards {boardId}; {columnId, position}; {assigneeId}; {asanaGid} sparse; {title: 'text'}
subtasks {cardId, position}
comments {cardId, createdAt}
```

---

## API Routes

All under `/api`, behind auth middleware (stub). `requireAdmin` where noted.

```
Boards     GET /boards (each w/ columnCount + cardCount) · GET /boards/:id (board+columns+fields)
           POST(admin) (seeds default To Do/Doing/Done columns) · PUT(admin) {name,description,isArchived}
           DELETE(admin) — cascades ALL children (cards, subtasks, comments, columns, fields, templates
             + best-effort S3 attachment cleanup); 409 if the board has cards and isn't archived yet
Columns    GET/POST /boards/:id/columns · PUT /boards/:id/columns/reorder · PUT /columns/:id · DELETE /columns/:id
Fields     GET/POST /boards/:id/fields · PUT /boards/:id/fields/reorder · PUT /fields/:id (name,type,options) · DELETE /fields/:id
Cards      GET /boards/:id/cards?assignee&column&archived&search · POST /boards/:id/cards
           GET /boards/:id/card-counts → { cardId: {subtaskCount,subtaskDone,commentCount} }
             (SEPARATE from listCards on purpose: ~2s on 2.4k cards, so the client fetches
              it after first paint and merges it in — the board stays frame-first)
           PUT /boards/:id/cards/reorder
           GET /cards/:id (card+comments+subtasks) · PUT /cards/:id · DELETE(admin)
           PUT /cards/:id/move {columnId,position} · PUT /cards/:id/move-board {boardId,columnId}
           PUT /cards/:id/fields { fieldId: value, ... }
           POST /cards/:id/attachments {name,url,isImage} · DELETE /cards/:id/attachments {url} (also deletes from S3)
Subtasks   POST /cards/:id/subtasks · PUT /cards/:id/subtasks/reorder · PUT /subtasks/:id · DELETE /subtasks/:id
Comments   GET/POST /cards/:id/comments {body, bodyHtml} · PUT /comments/:id {body, bodyHtml} · DELETE(admin) /comments/:id
Users      GET /users · POST(admin) · PUT /users/:id · DELETE(admin)
Settings   GET /settings/lumina-fields → {catalog, hiddenLineItemFields, hiddenAdvertiserFields, updatedAt}
           PUT(admin) {hiddenLineItemFields[], hiddenAdvertiserFields[]} · DELETE(admin) = back to "show all"
           GET /boards/:id/lumina-fields → same + {inherited} (board's own selection, else global)
           PUT(admin) = set this board's override · DELETE(admin) = inherit the global one again
Templates  GET/POST /boards/:id/templates · PUT /boards/:id/templates/reorder
           PUT /templates/:id · DELETE /templates/:id · POST /templates/:id/apply {columnId?}
Uploads    POST /uploads/presign {filename, contentType} → {uploadUrl, publicUrl, key}
Lumina     GET /lumina/status → {configured}
           GET /lumina/lineitems?q&limit (search: campaign / advertiser / WO)
           GET /lumina/lineitems/:id → { lineItem, fetchedAt } — full order-form doc
           GET /lumina/advertisers?q&limit · GET /lumina/advertisers/:id (legacy cards)
Health     GET /health  (no auth)
```

`PUT /cards/:id` accepts: title, assigneeId, dueDate, description, descriptionHtml,
isArchived, isCompleted (also stamps completedAt), tags.

---

## Auth (current: STUB)

`server/middleware/auth.js` attaches a hardcoded `DEV_USER` (admin) to `req.user` on
every request — there is no real login yet. `requireAdmin` checks `req.user.role`.
Replace this file with MSAL token verification when SSO is built (see Planned).

**TEMPORARY shared-password gate (remove when MSAL SSO lands).** So we can demo with
real, sensitive imported data before SSO exists, `requireAuth` enforces a single shared
password when the `ACCESS_PASSWORD` env var is set: every `/api` request must send it as
`x-access-password` (or `Authorization: Bearer <pw>`), else `401`. If `ACCESS_PASSWORD`
is unset (local dev), the gate is disabled and the app opens freely. Everyone still
shares `DEV_USER`. Frontend: `AccessGate` (wraps the app in `App.jsx`) hits
`GET /api/auth/check` — 200 opens the app, 401 shows a lock screen; the password is
stored in localStorage and sent by the axios request interceptor (`api/client.js`). Set
`ACCESS_PASSWORD` in Vercel for the preview. All the temporary pieces are marked
`TODO(auth)` / "TEMPORARY".

**Lock (the stand-in for log out).** The sidebar's user area has a lock button →
`lockApp()` in `api/client.js`: it clears the stored password and hard-navigates to `/`,
so the gate re-locks AND nothing survives in memory (board cache, open card, cached
settings) for whoever uses the machine next. A confirm dialog spells out that the
password is shared, so locking doesn't sign anyone else out. There is no server session
to end — the password is the whole gate. Becomes a real sign-out with MSAL SSO.

---

## Environment Variables

`.env` locally (gitignored), Vercel project settings in prod. See `.env.example`.

```
MONGODB_URI=                 # Atlas connection string (required)
DNS_SERVERS=                 # optional, e.g. 1.1.1.1,8.8.8.8 — fixes querySrv ECONNREFUSED
                             #   on flaky local networks (hotspot/VPN). Blank in prod.
# AWS S3 (file/image uploads)
AWS_REGION=us-east-1
S3_BUCKET=townsquareignite
S3_PREFIX=buyer-board/
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# Lumina SEM API (read-only). TOKEN IS SERVER-ONLY — never expose to the browser.
LUMINA_API_BASE=https://townsquarelumina.com/lumina/orders/api/ignite/ext
                           # PRODUCTION (switched 2026-08-03). It used to point at
                           #   release11, whose data was frozen ~2026-05-22: every
                           #   pasted line-item id created on/before that date resolved
                           #   and every one after returned {found:false} — a clean date
                           #   split, zero overlap. New campaigns therefore couldn't be
                           #   viewed OR attached, which is exactly what buyers work on.
                           #   Release and production need DIFFERENT tokens: pointing the
                           #   base at prod with a release token 401s everything. If you
                           #   ever switch back, change BOTH.
LUMINA_API_TOKEN=          # unset → /lumina/* returns 503, panel shows nothing
LUMINA_WEB_BASE=https://townsquarelumina.com   # host prepended to Lumina's deepLinkPath
# Asana (migration only)
ASANA_PAT=
ASANA_WORKSPACE_GID=461175262246056
# Planned (not yet used by code)
ANTHROPIC_API_KEY=
MSAL_CLIENT_ID=  MSAL_TENANT_ID=  MSAL_CLIENT_SECRET=
PORT=3001  CLIENT_URL=http://localhost:5173
```

---

## Frontend

### Pages / routes
- `/` → redirect to last-viewed board (localStorage) or `/dashboard`
- `/dashboard` → home: greeting + Projects (boards) + People (users) widgets. **Board
  management lives here**: "New board" (dialog → seeds default columns → opens it), and a
  per-board ⋯ menu (Rename / Archive / Delete). Archived boards drop into a collapsible
  "Archived" section (dimmed, Unarchive/Delete) and are hidden from the sidebar. Delete is
  offered only when a board is deletable (empty OR archived); otherwise the menu item is
  disabled with a hint to archive first. Board changes fire a `boards:changed` window event
  the Sidebar listens for.
- `/boards/:id` → kanban board (`?card=<id>` deep-links straight to a card's drawer;
  `?view=calendar` opens the Calendar view).
  **Frame-first loading**: board/columns load first and render immediately (skeleton
  columns while the board loads, skeleton cards while cards load); cards, users, and
  templates load independently so the page never shows a blank full-page spinner —
  important as the dataset grows (Asana import).
  **Tab-lived board cache** (`utils/boardCache.js`): BoardPage unmounts when you leave
  for the dashboard/users/settings, so its state would otherwise refetch on return.
  Loaded data (board, columns, cards, templates, archivedLoaded per board id; users
  globally) is cached and used SWR-style — on return the board hydrates **instantly**
  from cache (no skeleton) then revalidates silently in the background. The cache stays
  current because every mutation flows through BoardPage's setState, which writes a
  snapshot. Lives for the browser tab (cleared on full reload).
  The board **title in the top bar is click-to-edit** (inline rename → `PUT /boards/:id`;
  updates board state + cache, and dispatches a `board:renamed` window event the Sidebar
  listens for so its list updates without a refetch).
- `/boards/:id/settings` → Columns / Fields / Templates / Lumina tabs, rendered as a centered
  **outlined panel** (header: back button + board name + "Board settings", per-tab hint
  line). Columns/Fields rows are card-like (hover bg, color dot / type chip, actions
  revealed on hover) with a divider-separated add composer at the bottom. All three tabs
  are **drag-to-reorder** (dnd-kit, grip handle) → `columns/reorder`, `fields/reorder`,
  `templates/reorder` (optimistic).
- `/admin/users` → user management

### Layout (app shell — important)
`App.jsx` `SidebarLayout` is a viewport-locked shell: `position: fixed; inset: 0;
display: flex; overflow: hidden`. Sidebar fixed left, **drag-resizable** (right-edge
handle, 180–420px, persisted in localStorage `sidebar.width`) and **collapsible** to a
60px icon-only rail via the header chevron (persisted in `sidebar.collapsed`; collapsed
rows show icons/avatars + right-placed tooltips). Main area `flex:1; minWidth:0`
so the columns container (`overflow-x:auto`) scrolls **horizontally on its own**.
The page never scrolls. The card drawer is `position: fixed` to the viewport's right.
This 3-panel behavior (fixed sidebar, scrolling columns, fixed drawer) must hold no
matter how many/wide the columns are.

Each column fills the **full board height**: the header (name + count) is pinned at
the top and the **Add card** composer is pinned at the bottom (`flexShrink:0`), and
only the card list between them scrolls vertically (`overflowY:auto`). The columns
container uses `alignItems:'stretch'` + `overflowY:'hidden'` so only the inner card
lists scroll, never the page (mirrors Asana).

### Key components
- **BoardCard / CardFace / ArchivedCard** — board cards. `CardFace` is the shared
  visual; `BoardCard` adds dnd-kit `useSortable`; `ArchivedCard` is read-only & NOT
  sortable (so large archives render fast). Cards show: tag glyphs (colored `Sell`
  icons, name on hover), Health chip, title (dimmed + ✓ if completed),
  assignee avatar (per-user color), due date (red if overdue), subtask & comment counts,
  and a brand-blue **link glyph when the card is linked to Lumina** (same glyph in the
  calendar — one meaning, learned once) (tooltip names the
  campaign from the stored `lumina.name` — no per-card Lumina fetch on the board).
  Blue rather than muted like the counts: it's a property of the card, not a tally, so
  it reads at a glance when scanning a column for what still needs linking.
- **BoardFilters** — the Filter button + popover (filter set listed under *Design*).
  Rows are add/remove: a filter row shows because it has a value or because you added it.
  Owns no state — `BoardPage` holds one `filters` object (`EMPTY_FILTERS` shape) plus
  completion separately, since the archive view ignores completion.
- **CalendarView** — calendar of cards by **due date**, mirroring Asana's. Two modes via
  a **Weeks / Months** toggle (persisted, Months by default): Months is the 6x7 grid; **Weeks is one tall row
  where every card shows**, so no "N more" there. Both are driven by a single date anchor,
  and prev/next steps by whichever unit is showing.
  **Weekends are OFF by default** and toggleable (persisted), dropping the grid to Mon–Fri — 5 columns
  instead of 7, so each weekday gets ~30% more width, and buying work is weekday-shaped
  anyway. Hiding them hides any card DUE on a weekend, so a **`Weekend · N` chip** reports
  how many are out of sight in the current view — same rule as the no-due-date chip: never
  drop cards silently.
  **`+ Add task` sits on the same footer row as `N more`** (revealed on hover) and creates a card with that day as its
  due date — the point of a calendar is that the date is implied by where you clicked.
  New cards land in the FIRST column (the calendar has no column context) and the composer
  stays open after Enter so a run of cards can be typed. It deliberately does NOT open the
  drawer: you're usually adding several at once.
  Cards are Asana-height: assignee avatar, 2-line title, then a meta row (Lumina link
  glyph, subtask + comment counts, tag dots). A day with more than 3 cards shows a quiet grey
  **`N more` / `Show less`** toggle (Asana's wording and weight, not a bold blue link);
  expanding grows the whole **week row** via `gridAutoRows: max-content` rather than
  scrolling or clipping the cell — the cell must NOT be `overflow:hidden`, or an expanded
  day hides cards outright. Today's number is a filled blue circle, adjacent-month cells are shaded. Weeks start **Monday**
  here while `DueDatePicker` starts **Sunday** — deliberate, Asana itself differs between
  its calendar and its date picker.
  **Three signals, three channels — don't collapse them into colour:** the card *fill* is
  "Color by" (Health / Column / None, persisted in localStorage), *Health* also holds the
  left edge, and *Lumina-linked* is the *same blue link glyph as the board card*. Encoding
  the Lumina link as a colour was considered and rejected: colour already means two things
  here, and a third would be unlearnable — an icon reused from the board is learned once.
  **"Color by" defaults to Health** because seeded columns are all the same default grey
  (Asana sections have no colour), so Column only becomes useful once someone sets colours
  in Board settings → Columns.
  **A completed card drops its colour entirely** — no fill, no Health edge, faded, with a
  small grey tick before the title (Asana's treatment). Colour on this board means "needs
  attention", so a finished card keeping a bright Health fill competes with live work.
  **Hovering a card slides in a complete button from the left** (width transition, so it
  pushes rather than overlaps — Asana's behaviour) It is hover-only in BOTH states: done-ness is carried by
  the grey tick, while the button is purely the toggle, showing filled-green on a done
  card to mean "complete — click to undo". The toggle is optimistic and rolls back on failure: a card that looks done but
  isn't is worse than a click that visibly didn't take.
  **Cards with no due date can't be placed, so they're shown as a `No due date · N` count,
  never silently dropped** — on these boards most cards have no due date (Rachel's: 1,262
  of 2,423 do), so hiding them without saying so would badly mislead.
  Only the day grid scrolls, so the page still never does.
- **ArchivedGrid** — the archive view (archive toggle in the top bar) is a flat,
  responsive **grid/gallery** of `ArchivedCard`s, NOT the column layout. Cards are
  read-only; each shows a small uppercase **column-name label** (the column it lived
  in) since the grid isn't grouped, and the drawer shows it too. Honors the
  search/assignee/health filters; shows complete + incomplete together (no completion
  filter in archive view).
- **DueDatePicker** — Asana's due-date control: the row is a calendar glyph + the due
  label + a clear ×, and clicking opens a popover with a typed field (`6/4/26`,
  `2026-06-04`), a month grid, and Clear. Replaced a raw `<input type="date">`. Emits
  `'YYYY-MM-DD'` or `null`, the shape the API already took.
- **CardDrawer** — right drawer. Mark complete toggle, Status/Assignee/Due, Tags
  (combobox), custom fields (only those with a value, "+ Add field" to reveal more).
  Field inputs are **borderless until hover** (border on hover, blue on focus — Asana).
  Description (rich HTML render; click-to-edit when no inline images), Attachments
  (non-inline files: image thumbnails + file tiles), Subtasks, Comments. Move-to-
  project dialog. Archived OR completed cards are read-only (links/images still clickable).
  The header (title + complete/archive/move/close actions) and the archived/completed
  banner are **pinned** (`flexShrink:0`); only the body scrolls (`flex:1; overflowY:auto`).
  Drawer is **drag-resizable** (left-edge handle, min 420px, persisted in localStorage
  `cardDrawer.width`), has a **full-screen** toggle, and a **copy-link** button that
  yields a deep link to the card.
- **CardSubtasks / SubtaskDialog** — a subtask row shows done state, title, **due date**
  (relative label, red when overdue) and assignee avatar, with delete on hover. **Clicking
  the title opens `SubtaskDialog`**; the checkbox stays a separate hit target so ticking
  something off never opens a dialog you didn't ask for.
  `Add subtask` sits at the **END of the list** (Asana's placement — you decide to add one
  after reading what's there, not from a header `+`) and the composer stays open after
  Enter, since subtasks arrive in runs ("Opts 6.3", "Opts 7.3", …).
  **SubtaskDialog** edits title / assignee / due date / notes — all four were already in
  the schema and accepted by `PUT /subtasks/:id`, but unreachable, so a subtask was a bare
  title. A modal, not a nested drawer: the card drawer is already a right-hand panel and
  sliding a second one out of it makes "close" ambiguous. Read-only follows the parent card
  (completed/archived), which is why a completed card shows no `Add subtask`.
  **Subtask comments are NOT supported** — `comments` are keyed by `cardId`, so they need a
  schema change; worth doing deliberately rather than smuggling into a UI change.
- **CardComments** — rich editor composer (RichEditor) + comment list (RichContent,
  inside Collapsible "See more"). Migrated comments show "Imported from Asana".
- **RichEditor** (TipTap) — bold/italic/lists/link/image; image paste/drag/pick →
  presigned S3 upload → inline. Outputs HTML.
- **RichContent** — sanitized (DOMPurify) render of migrated/edited HTML with inline
  images + hover-download.
- **Collapsible** — "See more/less" for long content (re-measures after images load).
  Bottom fade reads `--fade-bg` (falls back to `background.paper`); a parent sets that
  CSS var to its own background — including on `:hover` — so the fade always matches
  the underlying color in any theme.
- **utils/tagColor** — deterministic color per tag name. `tagColor()` returns a swatch
  (`bg` pastel, `text` dark, `dot` vivid); `tagSolid()` returns the vivid `dot` fill +
  contrast-safe text. Card glyphs and drawer tag pills both use the **same `dot`** color,
  so a tag looks identical everywhere.
- **utils/userColor** — deterministic per-user avatar color (keyed email→name),
  consistent everywhere.

### Custom field rendering (by type)
text → input · number → number input · date → date picker · url → text input,
clickable link when shown · enum → MUI Select. Health enum chip colors:
Good `#4caf50`, Ok `#ff9800`, Needs Work `#f44336`, Waiting on DCM `#2196f3`.

**Decision — no "rich text" custom field type (intentional).** Custom fields are for
short, structured, scannable/filterable data (text, number, date, url, enum). All
long-form rich content (formatting + inline images + files) lives in the **description**
and **comments**. Rationale: (1) Asana itself has no rich-text custom field — long
content goes in the description; (2) a rich-text field overlaps the description and
invites buyers to scatter long notes across many fields, cluttering the card and
fighting "keep it simple"; (3) real cost (new `valueHtml` storage, an editor per field,
read/edit rendering, and it complicates "show only fields with a value" + filtering).
Revisit only if buyers genuinely need a **second distinct rich section** per card
(e.g. a "Strategy notes" block separate from the description) — then add a `richtext`
type deliberately.

---

## Design

Familiar to Asana users (board reference), but with our color rules.

- **Accent / brand color: BLUE `#4573d2`** — buttons, avatars, active states,
  toggles, focused inputs, selected card. **Red is reserved strictly for errors/
  alerts** (overdue dates, "Needs Work", delete). Do not use red for normal UI.
- Dark sidebar `#1d1f25` (both themes). Light bg `#f9f9f9`, columns `#f1f1f1`,
  cards `#fff`. Dark: bg `#1a1a1a`, columns `#242424`, cards `#2d2d2d`.
- Tags: small colored `Sell` glyphs on cards (name on hover); colored chips in the
  drawer combobox. Color derived from tag name (consistent everywhere).
- Users: colored initial avatars, one consistent color per person (no photos yet).
- Long comments/descriptions truncate with "See more".
- **Due dates are CALENDAR DATES, not instants** — stored at UTC midnight, so they must
  be read/written via `utils/dueDate` (`formatDue`, `isOverdue`, `toInput`). Never
  `toLocaleDateString`/`getDate()` on one: in any negative-offset timezone that prints the
  PREVIOUS day, which is exactly how every board card came to show due dates a day early
  (America/New_York rendered "Jun 3" for Asana's "Jun 4"). Overdue means strictly BEFORE
  today's local date — a card due today is not overdue.
- **Due dates read as relative labels within a week**: `Yesterday` / `Today` /
  `Tomorrow` / `in 3 days` / `4 days ago`, falling back to `Aug 11` (and `Jun 30, 2025`
  out of year) beyond ±6 days — past a week "in 23 days" is harder to act on than the
  date. `formatDueRelative()` on both the board card and the drawer; **always paired with
  `dueExact()` in a tooltip** (`Thursday, June 4, 2026`), because a relative label is
  easier to scan but drops information. Overdue stays red; today is bold, not red — it
  isn't late yet, and red is reserved for errors.
- Completed cards are shown by default (Tasks filter = All).
- Completed = green ✓ + **dimmed** title, never strikethrough (Asana does the same, and
  many subtask titles are short dates like `5/8` that a line through the middle makes
  hard to read). Applies to card faces, the drawer title, and subtasks — keep them
  consistent. Board "Tasks" filter: Incomplete / All /
  Completed, defaulting to All.
- Theming: MUI light/dark in `theme.js`, primary `#4573d2`; user preference in
  AppContext (defaults to dark / OS pref), persisted in localStorage.
- **`theme.js` is the single source of truth — do NOT hardcode `fontSize` or the brand
  hex in components.** Use `<Typography variant="…">` and `color="primary"` /
  `'primary.main'` (`'primary.dark'` for contained-button hover). Raw CSS strings that
  need the brand (e.g. a selection-ring `boxShadow`, image `outline`) use a theme
  callback (``theme => `…${theme.palette.primary.main}` ``). `theme.js` exports `BRAND`
  for the rare literal case. (Intentional non-brand color sets stay literal:
  `BOARD_COLORS` in BoardListPage, the `userColor` palette.)
  - **Typography** — compact, Asana-like scale (base 13px): `h5` 17/600 (page/board
    title), `h6` 15/600 (section header), `subtitle1` 14/600, `subtitle2` 13/600,
    `body1` 14, `body2` 13 (default body/cards), `caption` 12, `button` 13/600.
  - **Buttons** — flat (no elevation), **sentence-case** (`textTransform:none`), 6px
    radius, set globally via `MuiButton`. Primary actions = `variant="contained"`
    (brand blue automatically; no per-button `sx` color). Asana-like.
  - **Shape** — default radius 8px.
- Board toolbar (BoardPage top bar): slim row — board title (`h5`), a divider, then
  understated **filled "pill" controls** (search + filter selects) whose border appears
  only on hover/focus; filter selects render a muted `Label: Value` (no floating labels).
  **Filters live in ONE popover** behind a `Filter` button with a count badge
  (`BoardFilters`), Asana's model — a row of inline pills worked at three filters and
  would not at a dozen. Inside: **Tasks** (completion), **Quick filters** (Overdue, Due
  today, No due date, **Not linked to Lumina**), **Tags** (multi-select, match-any/OR,
  `dot` swatch per item), then add/remove rows via **+ Add filter**: Due date, Assignee,
  Column, **every enum custom field** (not just Health), Lumina link, Created / Last
  modified / Completed within 7/30/90 days. Search stays inline (constant use) and
  matches **title only** — everything else is a filter, not search.
  **Deliberately absent, because the data can't back them:** Asana's *Created by* (cards
  have no `createdBy`) and *Just my tasks* (auth is a stub, so everyone IS the same dev
  user). Both unlock with MSAL SSO; offering them now would lie.
  All filters run through `utils/cardFilters` and apply to board, calendar and archive
  grid alike (archive ignores completion).

**Views (decided 2026-08-04, reversing the earlier "no view tabs" call):** the board gets
**three** — **List, Board, Calendar** — switched from a toggle in the toolbar. Board and
Calendar are built; List is next. All three share ONE filter predicate
(`utils/cardFilters`) so a filter can't work on one view and not another. The view is
remembered per board in localStorage and mirrored to `?view=` so a link carries it.
**Timeline is still out** — it needs start dates, which we don't have.

Do NOT build: Portfolios/Goals/Inbox,
My Tasks, premium prompts, mobile-responsive layout.

---

## Files & Images (S3)

- Bucket `townsquareignite`, prefix `buyer-board/`, region `us-east-1`. **Public-read
  for now** (planned: move to a private bucket via presigned/CloudFront later).
- IAM user needs `s3:PutObject, s3:GetObject, s3:DeleteObject` on `buyer-board/*`
  (`DeleteObject` is REQUIRED — used by remove-attachment and every cascade delete;
  see *Deletion & Cleanup Rules*). Bucket CORS must allow browser `PUT`/`GET` from the
  app origins (localhost:5173, *.vercel.app).
- **Two kinds of attachments:** (1) **inline images** embedded in comment/description
  HTML (`<img>` rewritten to S3 URLs); (2) **standalone files** (any type — images,
  Excel, PDF…) shown in the card's Attachments section. The `inline` flag separates them.
- **Uploads** (native, in the rich editor): browser asks `/api/uploads/presign`, then
  PUTs the file directly to S3 (avoids Vercel's body-size limit), stores the public URL.

---

## Lumina (SEM line-item link)

A card can be linked to a **Lumina line item** so buyers see its live data on the card
**and get the Lumina link handed to them** - the goal is to end the copy/paste from
Lumina into Asana/here, not to reproduce it.

**Why the line item (not the advertiser) is the unit:** the migrated Asana cards prove
it - 241 of 2415 cards contain a pasted `.../lumina/view/lineitem/{seg}/{id}` URL, and
card titles are the advertiser's platform-account name. Buyers work per campaign.

**Core decision - we store the LINK, not the DATA.** The card holds only
`lumina: { lineitemId, advertiserId, name }`; every drawer open re-pulls the full
order-form document from Lumina. No copy in Mongo -> nothing to sync, nothing to go
stale, nothing to clean up on delete. (`name` is display-only, so the header renders
before the fetch lands.) Revisit only if we need offline/historical snapshots.

### API shape (rewritten by Lumina 2026-07-27 - every field was renamed)

Old -> new: `luminaAdvertiserId`->`advertiserId`, `luminaAdvertiserName`->`companyName`,
`luminaLineitemId`->`lineitemId`, `luminaCampaignName`->`campaignName`,
`woNumber`->`woOrderNumber`, `pacingStatus`->`reportingStatus`. The pacing-only fields
(`platform`, `platformAdvertiserId`, `advertiserType`, `platformParentId`) are **gone**.
Two consequences drove the design:

1. **Both lists support `?name=`** (case-insensitive contains) - so we do **NOT** cache
   the cohort. Search runs upstream, which also retired the "search at scale" problem.
   **Never reintroduce a full-cohort pull for search.**
2. **`GET /sem/lineitems/:id` returns the full order-form document** (~75 fields: budget,
   dates, KPI, geo targeting, Ignite team, GTM, build details). That is the card read
   path; the list endpoint is only for the attach dropdown.

Cohort is `product` in {SEM, SEM/Spark, Spark} minus known in-home (~8k line items,
~4.2k advertisers on release11). **Spark matters** - it was briefly dropped and took
real campaigns with it.

- **Server** `server/lib/lumina.js` - read-only client. Token is **server-side only**
  (`LUMINA_API_TOKEN`); the browser only ever calls our `/api/lumina/*`. Paging is
  `limit=100` **sequentially** (Lumina asked for ~100 at a time to go easy on their
  Mongo - never burst in parallel); only the legacy advertiser path pages at all.
  `searchLineItems` runs **several upstream filters in parallel and merges** them, so one
  box handles campaign name, advertiser name, **WO number** (incl. non-numeric ones like
  `EGL19483` / `TD MORRIS006`), a bare **line-item or advertiser id**, and a **pasted
  Lumina URL** (the id is extracted from `/lineitem/{seg}/{id}`). `?name=` only covers
  campaign + company name, hence the extra exact-match queries.
  `lineItemsByWo(wo)` is the batch counterpart: ONE exact `woOrderNumber` filter, errors
  allowed to **throw** (no `?name=`, so a bare numeric WO can't pull an unrelated campaign
  in by name). `searchLineItems` swallows per-filter errors on purpose — correct for the
  attach box where a human retries, wrong for `lumina-match.js` which records its verdict.
  **To add a search field:** append to `LINE_ITEM_SEARCHES` in `server/lib/lumina.js`.
  `param` must be a filter Lumina actually honours (guide §3 — unknown params are
  ignored silently, so a typo reads as "no results" rather than an error). The list is
  ordered most-precise-first because results merge in that order, so an exact hit
  outranks a name match. WO number is also the intended join key for linking imported
  cards to line items later. Detail returns `200 {found:false}` for an
  unknown id or one outside the cohort - that's "the link no longer resolves", surfaced
  as `null` -> `404`, not an error. Upstream failures -> `502`; missing token -> `503`.
- **Deep link:** Lumina supplies `deepLinkPath` on every line item (list AND detail); we
  only prepend `LUMINA_WEB_BASE`. **Do not compute the segment** - it varies
  (`sem`, `sem-spark`, `spark`, `beta`, `meta`) and Lumina already derived it.
- **API** `GET /lumina/lineitems?q=` . `GET /lumina/lineitems/:id` ->
  `{ lineItem, fetchedAt }` (the card read path) . `GET /lumina/advertisers?q=` .
  `GET /lumina/advertisers/:id` -> `{ advertiser, lineItems, fetchedAt }` (legacy cards
  linked before line items) . `GET /lumina/status` -> `{ configured }`.
- **Client** `components/Card/LuminaPanel.jsx` in the card drawer (between custom fields
  and Description). Not linked -> debounced Autocomplete over line items (works on new
  AND existing/imported cards - deliberately not in the column's one-line create
  composer). Attached -> a **collapsible box** headed `Lumina - <campaign>` with a live
  status line ("Fetching from Lumina..." -> "Updated 2:14:03 PM . Spark . Live .
  Casper"), an **Open in Lumina** button, refresh + detach. The fetch is **never awaited
  by the drawer** - the rest of the card is on screen immediately. Read-only on
  archived/completed cards.
- **Sections mirror Lumina's own line-item page** (Product, Campaign, Ignite Team,
  Platform, Build Report, Google, Budget, Geo Targeting, Build Details, Additional, plus
  our Advertiser & Order + Identifiers). `LUMINA_SECTIONS` in `utils/luminaFields.js` is
  the single source, used by BOTH `LuminaSnapshot` and the admin picker, so what you tick
  is grouped where it appears. **It is a display ORDER, not a schema** - the payload is a
  document whose field set varies by product, so unplaced keys land in "Other" and new
  Lumina fields appear with no code change. All 83 catalog keys are currently placed
  (Other is empty); when Lumina adds fields, place them rather than leaving them there.
- **`utils/luminaFields.js`** - labels + value formatting, shared by the panel and the
  admin picker so they can't drift. **Labels copy Lumina's own wording** ("Do you need to
  add a radius?", "Use their Google Ads account?") so buyers read the same thing in both
  places. Handles the shapes Lumina actually returns: people are objects
  (`{username, fullName, accountName}` -> show `fullName`), `*Budget` keys render as
  currency, `*Date` keys as zero-padded MM/DD/YYYY **from UTC parts** (Lumina's dates are
  calendar dates at UTC midnight; local getters printed the previous day, so a campaign
  whose Lumina page read 01/01/2025 showed as 12/31/2024 here - same bug class as card
  due dates), strings are trimmed (some values
  carry leading spaces), arrays join, `tactics` (keyed by tactic -> `{campaignName}`)
  flattens to the campaign-name list Lumina shows, and nested objects (`buildDetails`)
  expand into indented sub-rows instead of raw JSON. Values containing URLs become
  links; values that are HTML (`creativeInstructions`, `additionalDetails`) render
  through `RichContent` rather than printing tags.
  `LUMINA_HIDDEN` drops audit trails (`statusHistory`, `stepHistory`), upload fields
  (bare ObjectIds with no download URL — Lumina's page shows "(Uploaded: date)" + a link;
  matching that needs a file URL from them), the raw `*Username` keys we render via
  `*UsernameDisplay`, and exact duplicates (`campaignType`==`type`,
  `workflowStepName`==`status`, `advertiserName`==`companyName`,
  `tacticDetails`==`tactics`).
- **Blank values are omitted, not printed as an empty row** — Lumina's page does the
  same. `false` and `0` are values and still render.
- **Which fields show is an admin setting, global with a PER-BOARD override.** The
  global default lives at `/admin/lumina-fields` (`AdminLuminaFieldsPage`, sidebar ->
  "Lumina fields") in `app_settings._id='luminaFields'`; a board can override it in
  Board settings -> **Lumina** (`pages/settings/LuminaTab.jsx`), stored as
  `luminaFields` on the **board doc**. Resolution is **board -> global -> show
  everything**, done server-side in `getBoardLuminaFields`, which also returns
  `inherited` so the tab can say which one you're looking at. "Use the global
  selection" `$unset`s the override — that is NOT the same as "show everything",
  which only the global setting can say. Effective on the next card open. Read path is
  cached per board id in `api/settings.js` - one request per board, not one per card
  open; a failure falls back to showing everything rather than hiding data.
  Both pickers render the SAME `components/settings/LuminaFieldPicker.jsx` so they
  can't drift; the staleness/hide-list rules live in one `usableSelection()` in
  `server/controllers/settings.js` for the same reason.
  The override rides on the board doc **on purpose**: the board delete cascade takes it
  along automatically, so there's no new per-board collection to wire in.
- **The setting stores what is HIDDEN, not what is kept** (`hiddenLineItemFields` /
  `hiddenAdvertiserFields`). This is load-bearing, not a style choice: the line item is a
  document whose field set varies per record, and the picker's catalog is only a sample,
  so with an allow-list any field the sample missed (`states`, `zipcodes`,
  `creativeInstructions`) could never be ticked and therefore vanished from every card.
  A hide-list means unknown and newly-added fields show by default. **Don't invert it
  back.** Hidden keys are stored unfiltered — filtering them through the catalog would
  un-hide exactly the fields sampling missed.
- **The catalog is discovered + a known-optional list.** The server samples 5 line items
  per product and unions their keys (cached 1h; falls back to a static list if Lumina is
  unreachable), then unions `KNOWN_OPTIONAL` for fields that only appear on records that
  use them (geo targeting especially). Sampling alone can never be complete — that's
  fine for display (hide-list), it only affects what's *selectable* in the picker.
- **Old selections are NOT migrated.** Anything saved before 2026-07-27 (the rename) or
  in the old allow-list shape reads as "show everything" and the admin re-picks once.
  Both plausible migrations are actively harmful: filtering a pre-rename list key-by-key
  collapses "all 13 old fields" to the 3 whose names survived (`market`, `product`,
  `subProduct`), and converting an allow-list via "hidden = catalog - kept" hides every
  field the old catalog never offered.
- **Gotcha:** the real channel is `subProduct` (Bing appears as `["Bing Search"]`), and
  it's an array.

**Why a setting instead of a curated list:** rather than guessing which of Lumina's
fields buyers need, they pick - and can change it any time without a deploy. Default
stays "show everything" until someone narrows it.

## Migration (Asana → MongoDB)

Standalone scripts in `migration/` (read Asana, write JSON, then seed Mongo). Both
honor `DNS_SERVERS`. The export JSON is gitignored.

**→ `migration/README.md` is the step-by-step runbook**: import a new board, clean
re-import an existing one, per-board column decisions, known project GIDs, and
troubleshooting. This section covers what the scripts *are*; the runbook covers how to
*run* them. Keep both current.

### `asana-migrate.js` (Asana → `asana-export-<project-name>.json`)
- **One project per run: `--project=<gid>` is REQUIRED** (no default — a default meant
  an accidental run re-exported Rachel's board over the file you wanted, and each board
  is thousands of API calls plus S3 uploads). `--out=<file>` optional; otherwise the
  name is derived from the project's real name. Writes into `migration/` regardless
  of CWD.
- **Parallel** worker pool (`MIGRATE_CONCURRENCY`, default 6) + a **global rate
  limiter** (`RATE_LIMIT_MS`, default 150) so Asana calls stay spaced under concurrency.
- Per task captures: fields, assignee, due, tags, `is_completed`/`completed_at`,
  custom fields, comments (`text` + `html_text`), subtasks, `html_notes`.
- **Attachments**: uploads EVERY Asana-hosted file (images + docs) to S3 with a
  deterministic key `buyer-board/{taskGid}/{attGid}-{name}`. **Skips re-upload if the
  object already exists** (HeadObject) → idempotent/resumable. Then **rewrites inline
  `<img data-asana-gid>` src in comment/description HTML to the S3 URLs**, and flags
  which attachments are inline.
- External-link attachments (Google Drive/Dropbox) have no bytes → skipped.

### `asana-seed.js` (JSON → MongoDB, idempotent, upsert by `asanaGid`)
- Takes the export file positionally or as `--file=` (defaults to
  `asana-export-rachel.json`): `node migration/asana-seed.js asana-export-foo.json --auto`.
- Creates board (by asanaProjectGid), columns (preserve order), custom fields —
  including per-card "disconnected" fields not in the project (e.g. SEM-KPI; enum vs
  url vs text inferred from values).
- `--auto` skips prompts: archive columns matching `cancelled`/`completed campaign`,
  skip `duplicate`. **Archived = archive-named column only** (NOT completion).
- Seeds cards (preserve createdAt), subtasks, comments (preserve timestamps,
  `migratedAuthorName`, `bodyHtml`), tags, attachments, `isCompleted/completedAt`,
  `descriptionHtml`.
- Merges attachments on re-seed: keeps user-uploaded (native, under
  `buyer-board/uploads/`) attachments and replaces only the Asana-migrated ones.

### `lumina-match.js` (link seeded cards → Lumina line items)
Buyers already paste Lumina identifiers into the description, so we mine them instead
of asking anyone to re-link 2.4k cards by hand. Writes ONLY the `lumina` link subdoc —
never Lumina data (see *Lumina*). **Deliberately standalone, NOT part of `asana-seed.js`**:
it re-runs as Lumina changes, works on already-seeded cards without a re-seed, and keeps
the Asana import independent of Lumina's uptime. Board-agnostic — run it after seeding
each new board.

```
node migration/lumina-match.js                    # dry run (default), all boards
node migration/lumina-match.js --apply            # write the links
node migration/lumina-match.js --board=<id>       # one board · --relink · --limit=N
node migration/lumina-match.js --pace=400         # ms between cards (raise on 429s)
node migration/lumina-match.js --revert=<report>  # undo one --apply run
```

- **Match tiers, most precise first; a card takes the first that resolves:** (1) a pasted
  `/lumina/view/lineitem/{seg}/{id}` URL → that exact line item; (2) `WO#(GPID): 6113181`
  in the description; (3) a leading WO in the title (`6693359_MT_Great Falls_…`, which is
  Lumina's own `campaignName` convention).
- **A WO is an ORDER number → 1:N line items.** The tie is broken ONLY on the product tag
  the title already carries (`[SEM]`/`[PMAX]`/`SEM-SEARCH` vs `product`/`subProduct`/
  `displayName`). If that doesn't single one out, the card is **skipped and reported** — a
  wrong link is worse than none, because the drawer presents it as fact. Don't add
  cleverer heuristics (e.g. "prefer Live over Cancelled") without buyer sign-off.
- **No name/fuzzy matching** (decided 2026-08-03). Only ~20% of Rachel's cards carry any
  identifier; the other ~1,930 stay unlinked rather than risk plausible-but-wrong links.
- **Errors must never be recorded as "not found."** A batch run writes down its verdict
  instead of letting a human retry, so it retries with backoff and reports `lookup-failed`
  (re-runnable) separately from `wo-not-found`/`url-unresolved` (final). This is why it
  uses `lineItemsByWo()` and not `searchLineItems()` — the latter swallows per-filter
  errors into an empty result, which is right for the attach dropdown and wrong here.
  Lumina answers **429** under batch load; that needs seconds of backoff, not ms.
- **Reports:** dry runs overwrite `lumina-match-report.json`; an `--apply` run writes its
  own timestamped `lumina-match-applied-<ts>.json`, because that file is the only record
  of what to undo. `--revert` unsets only the cards that run linked and only if the link
  still matches, so links buyers attached by hand in the drawer survive.
- **Result on Rachel's board (2026-08-03):** 390 of 484 identifier-bearing cards linked
  (354 by URL, 33 by desc WO, 3 by title WO) out of 2,412 total. Skips: 88 `wo-not-found`
  (short old WOs for campaigns aged out of the SEM cohort — real misses, not a parser bug),
  4 `url-unresolved`, 2 ambiguous.

---

## Key Business Rules

1. **Completed ≠ Archived.** Completion is a per-card flag (✓). The Tasks filter
   (Incomplete / All / Completed) defaults to **All** — buyers want the whole board on
   arrival, not a filtered slice. (It defaulted to Incomplete until 2026-08-04.) Archived = in an archive column / manually archived,
   shown only via the archive toggle. A card can be both.
2. Cards are hard-deleted only if empty (no description, fields, comments, subtasks);
   otherwise archived. Admin-only delete.
3. **Completed and archived cards are read-only** in the drawer (re-open via Mark
   incomplete / Unarchive); links & images stay clickable.
4. Comments: editable by author or admin (API exists); never hard-deleted by members,
   admin can delete. Migrated comment timestamps are sacred.
5. Columns/fields/templates are **per board**; column names are not standardized.
6. All users see all boards (no per-board access control).
7. **Boards mirror the card rule (Asana Archive + Delete, no trash yet):** a board is
   **archived** (reversible, hides it from sidebar/dashboard) to put it away, and
   **deleted** (irreversible, cascades all children) only when it's **empty OR already
   archived** — a non-empty active board must be archived first. Admin-only.
8. Keep it simple — no feature without clear buyer value.

---

## Deletion & Cleanup Rules (no orphans, no leaked files)

**When you delete anything, delete everything it owns — DB children AND S3 files.**
S3 cleanup is always **best-effort**: never block or fail a DB delete because an S3
call errored (a leaked object is better than a partial/failed delete). Use
`deleteUrls()` + `s3UrlsInHtml()` from `server/lib/s3.js`. Inline images live inside
HTML (`descriptionHtml`, comment `bodyHtml`), NOT the `attachments[]` array — so both
must be scanned.

Current cascade/cleanup per entity:
- **Card** (hard-delete only when empty): S3-delete its `attachments[]` + inline images
  in `descriptionHtml`, then the doc. (Non-empty cards archive instead of delete.)
- **Comment** (admin delete): S3-delete inline images in `bodyHtml`, then the doc.
- **Column**: deletable only when it holds no cards (409 otherwise) — nothing else to clean.
- **Field**: after deleting the field doc, `$pull` its `fieldValues` from every card so no
  orphaned values remain. (No files.)
- **Template**: no children/files.
- **Board** (cascade; deletable only when empty OR archived): delete all `cards`,
  `subtasks`, `comments`, `columns`, `custom_fields`, `card_templates`; S3-delete every
  card attachment + inline image (descriptions AND comments); then the board doc.

**Rule for the future — keep this current:** any NEW per-board collection, child entity,
or file-bearing field MUST be wired into (a) its own delete path and (b) the **board
cascade** in `deleteBoard`, so deleting a board leaves nothing behind. If content can
hold inline files, clean them with `s3UrlsInHtml`, not just `attachments[]`.

---

## Deployment (Vercel)

- `vercel.json`: `buildCommand` builds the client → `outputDirectory: client/dist`;
  rewrites `/api/(.*)` → `/api` (the serverless function `api/index.js` = the Express
  app) and `/(.*)` → `/index.html` (SPA).
- Client API base URL is relative `/api` (works in prod; dev uses Vite's `/api` proxy
  to `:3001`).
- Set env vars in Vercel (`MONGODB_URI` required; AWS vars for uploads). Atlas Network
  Access must allow `0.0.0.0/0` (serverless IPs are dynamic). Don't set `DNS_SERVERS`.

---

## Verifying UI changes (scripts/screenshot.mjs)

A passing `npm run build` says nothing about layout. Three layout bugs shipped blind
before this existed — most instructively, `gridAutoRows: minmax(132px, max-content)` on
the calendar, which *reads* correct and silently pins every row to its minimum.

```bash
# dev server must already be running (npm run dev)
node scripts/screenshot.mjs "/boards/<id>?view=calendar" out.png 1500 1000
```

Drives the installed Edge/Chrome over CDP with Node's built-in `WebSocket` — **no
Playwright, no browser download, no new dependencies**. It seeds `ACCESS_PASSWORD` into
localStorage first, or every page is the lock screen.

- `SHOT_WAIT_FOR="<js expr>"` — poll until it's truthy before shooting. **Use it.** A
  fixed sleep once had me "verify" an empty, still-loading calendar and conclude the
  layout was fixed.
- `SHOT_EVAL="<js expr>"` — run an expression in the page and print the result. This is
  the good bit: measure computed styles and overflow (`scrollHeight > clientHeight`), or
  A/B candidate CSS live, instead of guessing from pixels. The calendar row bug was
  settled by trying `auto` / `minmax` / `max-content` in one page visit.

**Look at the PNG.** A blank frame means it didn't load, not that it passed.

## Code Style
Plain JS. ES modules (frontend) / CommonJS (backend). Async/await. MUI `sx`, no inline
styles. PascalCase components, camelCase hooks/utils. Split components past ~150 lines.
All route handlers try/catch → central error middleware; error shape
`{ error: { message, code } }`. Axios interceptor: 401 → login (when auth exists),
5xx → toast. Never show raw errors to users.

---

## Planned / Not Yet Built

- **Microsoft SSO (MSAL):** replace the auth stub; create users on first login; load
  user theme. Until then everyone is the admin `DEV_USER`.
- **Owner-only edit permissions** (cards/comments editable only by owner) — waits on real auth.
- **User profile photos** — come with SSO; show photo, fall back to colored initials.
- **Rich text editing is BUILT** (TipTap): rich comment composer + comment editing,
  rich description editing (images preserved), and add/remove attachments in the
  Attachments section. Remove deletes from S3, so the IAM policy needs
  **`s3:DeleteObject`**. Optional, not built: slash ("/") menu, @mentions.
- **Lumina phase 2:** show the linked line item on the board card, filter a board by
  advertiser, and curate the default field selection once buyers say which of the ~75
  fields they actually use. Still missing from the API: the **budget flighting rows**
  table (only an upload id comes back), and **file URLs** for build report / creative /
  flighting uploads. Also worth querying: `contractedBudget` came back as the full
  amount on a record where Lumina's own page showed `$0`. Open question for Lumina: the form's "Buyer" showed a different name than
  `buyerSearchUsernameDisplay` on one spot-check — but every other buyer role on that
  record is null, so the screenshot was most likely stale.
- **Import Asana task templates** (templates are not exported/seeded yet).
- **Private S3 bucket** via presigned/CloudFront (currently public).
- **AI agents (Anthropic SDK), not built:** (1) Asana Sync — keep cards in sync during
  transition; (2) Optimization Note assistant — format a buyer's note + suggest health/
  follow-up; (3) Account Health summary — summarize a card's comment history. All would
  run server-side; design lives in SPEC.md / git history.
- Out of scope (Phase 1): Timeline/Dashboard analytics, automation rules,
  notifications, mobile layout, cross-board My Tasks, @mentions, activity feed.
```
