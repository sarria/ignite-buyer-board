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
│       │   ├── Board/               # BoardColumn, BoardCard, CardFace, ArchivedCard
│       │   ├── Card/                # CardDrawer, CardComments, CardSubtasks
│       │   └── common/              # Sidebar, RichEditor, RichTextField, RichContent, Collapsible
│       ├── context/                 # AppContext (theme light/dark)
│       ├── pages/                   # BoardListPage (dashboard), BoardPage,
│       │   │                        #   BoardSettingsPage, AdminUsersPage
│       │   └── settings/            # ColumnsTab, FieldsTab, TemplatesTab
│       ├── utils/                   # tagColor, userColor, linkify, lastBoard
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
├── migration/                       # asana-explore.js, asana-migrate.js, asana-seed.js
│                                    #   (+ asana-export-rachel.json, gitignored)
├── vercel.json                      # build client → client/dist, route /api/* to function
└── CLAUDE.md / SPEC.md / API.md
```

---

## Database

Official MongoDB Node driver with a cached connection pool. `getDb()` lazily calls
`connectDb()` (so serverless invocations work without a startup hook).

### Collections
`users, boards, columns, custom_fields, cards, subtasks, comments, card_templates`

### Document shapes (current)

```javascript
// users
{ _id, name, email /*unique*/, role /*'admin'|'member'*/, microsoftId, defaultBoardId, createdAt }

// boards
{ _id, name, description, createdBy, createdAt, asanaProjectGid }

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
  asanaGid, asanaProjectGid, createdAt, updatedAt }

// subtasks
{ _id, cardId, title, assigneeId, dueDate, isComplete, notes, position, asanaGid, createdAt }

// comments
{ _id, cardId, authorId /*null for migrated*/,
  body,                   // plain text
  bodyHtml,               // rich HTML w/ inline images (null if plain)
  isMigrated, migratedAuthorName, migratedAuthorEmail,
  asanaGid, createdAt /*preserve original Asana timestamp on migration*/ }

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
Boards     GET /boards · GET /boards/:id (board+columns+fields) · POST(admin) · PUT(admin) · DELETE(admin)
Columns    GET/POST /boards/:id/columns · PUT /boards/:id/columns/reorder · PUT /columns/:id · DELETE /columns/:id
Fields     GET/POST /boards/:id/fields · PUT /boards/:id/fields/reorder · PUT /fields/:id (name,type,options) · DELETE /fields/:id
Cards      GET /boards/:id/cards?assignee&column&archived&search · POST /boards/:id/cards
           PUT /boards/:id/cards/reorder
           GET /cards/:id (card+comments+subtasks) · PUT /cards/:id · DELETE(admin)
           PUT /cards/:id/move {columnId,position} · PUT /cards/:id/move-board {boardId,columnId}
           PUT /cards/:id/fields { fieldId: value, ... }
           POST /cards/:id/attachments {name,url,isImage} · DELETE /cards/:id/attachments {url} (also deletes from S3)
Subtasks   POST /cards/:id/subtasks · PUT /cards/:id/subtasks/reorder · PUT /subtasks/:id · DELETE /subtasks/:id
Comments   GET/POST /cards/:id/comments {body, bodyHtml} · PUT /comments/:id {body, bodyHtml} · DELETE(admin) /comments/:id
Users      GET /users · POST(admin) · PUT /users/:id · DELETE(admin)
Templates  GET/POST /boards/:id/templates · PUT /boards/:id/templates/reorder
           PUT /templates/:id · DELETE /templates/:id · POST /templates/:id/apply {columnId?}
Uploads    POST /uploads/presign {filename, contentType} → {uploadUrl, publicUrl, key}
Health     GET /health  (no auth)
```

`PUT /cards/:id` accepts: title, assigneeId, dueDate, description, descriptionHtml,
isArchived, isCompleted (also stamps completedAt), tags.

---

## Auth (current: STUB)

`server/middleware/auth.js` attaches a hardcoded `DEV_USER` (admin) to `req.user` on
every request — there is no real login yet. `requireAdmin` checks `req.user.role`.
Replace this file with MSAL token verification when SSO is built (see Planned).
The frontend has no login page; it loads straight into the app.

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
- `/dashboard` → home: greeting + Projects (boards) + People (users) widgets
- `/boards/:id` → kanban board (`?card=<id>` deep-links straight to a card's drawer).
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
- `/boards/:id/settings` → Columns / Fields / Templates tabs, rendered as a centered
  **outlined panel** (header: back button + board name + "Board settings", per-tab hint
  line). Columns/Fields rows are card-like (hover bg, color dot / type chip, actions
  revealed on hover) with a divider-separated add composer at the bottom.
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
  icons, name on hover), Health chip, title (strikethrough + ✓ if completed),
  assignee avatar (per-user color), due date (red if overdue), subtask & comment counts.
- **ArchivedGrid** — the archive view (archive toggle in the top bar) is a flat,
  responsive **grid/gallery** of `ArchivedCard`s, NOT the column layout. Cards are
  read-only; each shows a small uppercase **column-name label** (the column it lived
  in) since the grid isn't grouped, and the drawer shows it too. Honors the
  search/assignee/health filters; shows complete + incomplete together (no completion
  filter in archive view).
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
- Completed cards: green ✓ + strikethrough title; hidden by default (board "Tasks"
  filter: Incomplete / All / Completed).
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
  Filters: **Assignee**, **Health**, **Tags** (multi-select, match-any/OR; menu items
  show the tag's `dot` color swatch + checkbox; "Clear tags" entry; shown only if the
  board has tags), and **Tasks** (completion). Search matches **title only** —
  tag/assignee/health are filters, not search. Filters apply to both the board and the
  archive grid (archive ignores the completion filter).

Do NOT build: top nav tabs (Timeline/Calendar/etc.), Portfolios/Goals/Inbox,
My Tasks, premium prompts, mobile-responsive layout.

---

## Files & Images (S3)

- Bucket `townsquareignite`, prefix `buyer-board/`, region `us-east-1`. **Public-read
  for now** (planned: move to a private bucket via presigned/CloudFront later).
- IAM user scoped to `s3:PutObject, s3:GetObject` on `buyer-board/*` (add
  `s3:DeleteObject` when remove-attachment is built). Bucket CORS must allow browser
  `PUT`/`GET` from the app origins (localhost:5173, *.vercel.app).
- **Two kinds of attachments:** (1) **inline images** embedded in comment/description
  HTML (`<img>` rewritten to S3 URLs); (2) **standalone files** (any type — images,
  Excel, PDF…) shown in the card's Attachments section. The `inline` flag separates them.
- **Uploads** (native, in the rich editor): browser asks `/api/uploads/presign`, then
  PUTs the file directly to S3 (avoids Vercel's body-size limit), stores the public URL.

---

## Migration (Asana → MongoDB)

Standalone scripts in `migration/` (read Asana, write JSON, then seed Mongo). Both
honor `DNS_SERVERS`. The export JSON is gitignored.

### `asana-migrate.js` (Asana → `asana-export-rachel.json`)
- Hardcoded to one project GID; writes into `migration/` regardless of CWD.
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

---

## Key Business Rules

1. **Completed ≠ Archived.** Completion is a per-card flag (✓), shown but **hidden by
   default** (Tasks filter). Archived = in an archive column / manually archived,
   shown only via the archive toggle. A card can be both.
2. Cards are hard-deleted only if empty (no description, fields, comments, subtasks);
   otherwise archived. Admin-only delete.
3. **Completed and archived cards are read-only** in the drawer (re-open via Mark
   incomplete / Unarchive); links & images stay clickable.
4. Comments: editable by author or admin (API exists); never hard-deleted by members,
   admin can delete. Migrated comment timestamps are sacred.
5. Columns/fields/templates are **per board**; column names are not standardized.
6. All users see all boards (no per-board access control).
7. Keep it simple — no feature without clear buyer value.

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
- **Import Asana task templates** (templates are not exported/seeded yet).
- **Private S3 bucket** via presigned/CloudFront (currently public).
- **AI agents (Anthropic SDK), not built:** (1) Asana Sync — keep cards in sync during
  transition; (2) Optimization Note assistant — format a buyer's note + suggest health/
  follow-up; (3) Account Health summary — summarize a card's comment history. All would
  run server-side; design lives in SPEC.md / git history.
- Out of scope (Phase 1): Timeline/Calendar/Dashboard analytics, automation rules,
  notifications, mobile layout, cross-board My Tasks, @mentions, activity feed.
```
