# CLAUDE.md - Ignite Buyer Board

This file contains everything Claude needs to build the Ignite Buyer Board app.
Read this entire file before writing any code.

---

## What You Are Building

A kanban-style account management tool to replace Asana for Ignite buying teams.
Buyers use it to track advertiser accounts, log optimization notes, and maintain
historical records. It must feel fast and simple, never like a chore.

Full requirements are in SPEC.md. This file contains the build instructions.

---

## Tech Stack

- **Frontend**: React + Vite + Material UI (MUI v5)
- **Backend**: Node.js (JavaScript only, no TypeScript anywhere)
- **Database**: MongoDB (Atlas)
- **Auth**: Microsoft SSO via MSAL (shared with Lumina)
- **Drag and drop**: @dnd-kit/core
- **HTTP client**: axios (frontend)
- **API**: Express.js
- **Hosting**: Vercel (initial), migrating to Lumina environment later

Do not introduce TypeScript, GraphQL, Mongoose, or any framework not listed here.
Use the MongoDB Node.js driver directly, no ORM or ODM.
Match the stack Lumina uses exactly.

---

## Project Structure

```
/
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Board/         # Board, Column, Card components
│   │   │   ├── Card/          # Card detail, comments, subtasks
│   │   │   ├── Fields/        # Custom field renderers and editors
│   │   │   └── common/        # Buttons, modals, inputs
│   │   ├── pages/             # Route-level page components
│   │   ├── hooks/             # Custom React hooks
│   │   ├── context/           # Auth context, board context
│   │   ├── api/               # Axios API call functions
│   │   └── utils/             # Helpers, formatters
│   └── index.html
│
├── server/                    # Node.js + Express backend
│   ├── routes/                # Express route files
│   ├── controllers/           # Route handler logic
│   ├── middleware/            # Auth, error handling
│   ├── db/
│   │   ├── index.js           # MongoDB client connection
│   │   └── seeds/             # Seed scripts including Asana import
│   └── index.js               # Express app entry point
│
├── migration/                 # Asana migration scripts (standalone)
│   ├── asana-explore.js
│   ├── asana-migrate.js
│   └── asana-seed.js          # Loads JSON export into MongoDB
│
└── SPEC.md
```

---

## Database

Use the official MongoDB Node.js driver with a connection pool.
No Mongoose, no ODM. Write queries directly against the driver.

### Collections

```
users
boards
columns
custom_fields
cards
subtasks
comments
card_templates
```

### Indexes to create on startup

```javascript
// users
db.collection('users').createIndex({ email: 1 }, { unique: true });
db.collection('users').createIndex({ microsoftId: 1 }, { unique: true, sparse: true });

// boards
// (no special indexes needed beyond _id)

// columns
db.collection('columns').createIndex({ boardId: 1, position: 1 });

// custom_fields
db.collection('custom_fields').createIndex({ boardId: 1, position: 1 });

// cards
db.collection('cards').createIndex({ boardId: 1 });
db.collection('cards').createIndex({ columnId: 1, position: 1 });
db.collection('cards').createIndex({ assigneeId: 1 });
db.collection('cards').createIndex({ asanaGid: 1 }, { sparse: true });
db.collection('cards').createIndex({ title: 'text' }); // for search

// subtasks
db.collection('subtasks').createIndex({ cardId: 1, position: 1 });

// comments
db.collection('comments').createIndex({ cardId: 1, createdAt: 1 });
```

### Document Shapes

```javascript
// users
{
  _id: ObjectId,
  name: String,
  email: String,           // unique
  role: String,            // 'admin' or 'member'
  microsoftId: String,     // from MSAL, unique
  defaultBoardId: ObjectId,
  createdAt: Date
}

// boards
{
  _id: ObjectId,
  name: String,
  description: String,
  createdBy: ObjectId,
  createdAt: Date
}

// columns
{
  _id: ObjectId,
  boardId: ObjectId,
  name: String,
  position: Number,
  color: String,           // hex e.g. '#4caf50'
  asanaGid: String,
  createdAt: Date
}

// custom_fields
{
  _id: ObjectId,
  boardId: ObjectId,
  name: String,
  type: String,            // 'text' | 'number' | 'date' | 'url' | 'enum'
  options: [String],       // for enum type only
  isRequired: Boolean,
  position: Number,
  asanaGid: String
}

// cards
{
  _id: ObjectId,
  boardId: ObjectId,
  columnId: ObjectId,
  title: String,
  assigneeId: ObjectId,
  dueDate: Date,
  description: String,
  position: Number,
  isArchived: Boolean,
  fieldValues: [           // embedded custom field values
    {
      fieldId: ObjectId,
      valueText: String,
      valueNumber: Number,
      valueDate: Date,
      valueEnum: String
    }
  ],
  asanaGid: String,
  asanaProjectGid: String,
  createdAt: Date,
  updatedAt: Date
}

// subtasks
{
  _id: ObjectId,
  cardId: ObjectId,
  title: String,
  assigneeId: ObjectId,
  dueDate: Date,
  isComplete: Boolean,
  notes: String,
  position: Number,
  asanaGid: String,
  createdAt: Date
}

// comments
{
  _id: ObjectId,
  cardId: ObjectId,
  authorId: ObjectId,       // null for migrated comments
  body: String,
  isMigrated: Boolean,
  migratedAuthorName: String,
  migratedAuthorEmail: String,
  asanaGid: String,
  createdAt: Date           // preserve original Asana timestamp on migration
}

// card_templates
{
  _id: ObjectId,
  boardId: ObjectId,
  name: String,
  descriptionTemplate: String,
  defaultColumnId: ObjectId,        // column the card lands in when applied (optional)
  defaultAssigneeId: ObjectId,      // pre-assign to a user (optional)
  dueDateOffsetDays: Number,        // due date = apply date + N days (optional)
  defaultFieldValues: [             // pre-fill custom fields
    {
      fieldId: ObjectId,
      valueText: String,
      valueNumber: Number,
      valueDate: Date,
      valueEnum: String
    }
  ],
  defaultSubtasks: [{ title: String, dueDateOffsetDays: Number }],
  createdAt: Date
}
```

---

## API Routes

All routes prefixed with `/api`.
Auth middleware applied to all routes except `/api/auth/*`.

### Auth
```
GET    /api/auth/microsoft          redirect to Microsoft login (MSAL)
GET    /api/auth/microsoft/callback  MSAL callback, set session, redirect to app
POST   /api/auth/logout
GET    /api/auth/me                  return current user
```

### Boards
```
GET    /api/boards                   all boards (with column counts)
GET    /api/boards/:id               board + columns + custom fields
POST   /api/boards                   create board (admin only)
PUT    /api/boards/:id               update name/description (admin only)
DELETE /api/boards/:id               delete board (admin only)
```

### Columns
```
GET    /api/boards/:id/columns              all columns for board
POST   /api/boards/:id/columns              create column
PUT    /api/columns/:id                     update name/color
DELETE /api/columns/:id                     delete column (must be empty)
PUT    /api/boards/:id/columns/reorder      reorder { columnIds: [] }
```

### Custom Fields
```
GET    /api/boards/:id/fields               all fields for board
POST   /api/boards/:id/fields               create field
PUT    /api/fields/:id                      update field
DELETE /api/fields/:id                      delete field
PUT    /api/boards/:id/fields/reorder       reorder { fieldIds: [] }
```

### Cards
```
GET    /api/boards/:id/cards                all cards for board
  ?assignee=userId
  ?column=columnId
  ?archived=true/false
  ?search=term
GET    /api/cards/:id                       card detail + comments + subtasks
POST   /api/boards/:id/cards                create card
PUT    /api/cards/:id                       update card
DELETE /api/cards/:id                       soft delete (admin only)
PUT    /api/cards/:id/move                  move to column { columnId, position }
PUT    /api/cards/:id/move-board            move to board { boardId, columnId }
PUT    /api/boards/:id/cards/reorder        reorder within column
```

### Card Field Values
```
PUT    /api/cards/:id/fields                set field values { fieldId: value, ... }
```

### Subtasks
```
POST   /api/cards/:id/subtasks              create subtask
PUT    /api/subtasks/:id                    update subtask
DELETE /api/subtasks/:id                    delete subtask
PUT    /api/cards/:id/subtasks/reorder      reorder { subtaskIds: [] }
```

### Comments
```
GET    /api/cards/:id/comments              all comments (oldest first)
POST   /api/cards/:id/comments              add comment { body }
PUT    /api/comments/:id                    edit comment (author or admin only)
DELETE /api/comments/:id                    delete comment (admin only)
```

### Users
```
GET    /api/users                           all users (for assignee dropdowns)
POST   /api/users                           create user (admin only)
PUT    /api/users/:id                       update user
DELETE /api/users/:id                       deactivate user (admin only)
```

### Templates
```
GET    /api/boards/:id/templates            all templates for board
POST   /api/boards/:id/templates            create template
PUT    /api/templates/:id                   update template
DELETE /api/templates/:id                   delete template
POST   /api/templates/:id/apply             create card from template { columnId? }
                                             columnId overrides defaultColumnId if provided
                                             dueDateOffsetDays applied from current date
                                             defaultFieldValues copied to card fieldValues
```

---

## Frontend Pages and Components

### Pages
- `/login` - Microsoft SSO login page
- `/` - redirect to first board
- `/boards/:id` - main kanban board view
- `/boards/:id/settings` - board settings (columns, fields, templates)
- `/cards/:id` - card detail (can also open as drawer over board)
- `/admin/users` - user management (admin only)

### Key Components

**Board view (`/boards/:id`):**
- Horizontal scrollable column layout
- Each column shows: name, card count, cards
- Cards show: title, assignee avatar, due date, health field color, comment count, subtask progress
- Top bar: board name, filter by assignee, filter by health, search
- Archived cards hidden by default, toggle to show

**Card detail (modal/drawer):**
- Title (editable inline)
- Assignee (dropdown from users list)
- Due date (date picker)
- Column/status (dropdown)
- Description (textarea)
- Custom fields section (rendered by field type)
- Subtasks list (checkboxes, add inline)
- Comments (chronological, add at bottom)
- Migrated comments visually distinct (muted, "Imported from Asana" label with original date and author)

**Board settings:**
- Columns tab: list with drag reorder, add/edit/delete
- Fields tab: list with drag reorder, add/edit/delete, field type selector, enum options editor
- Templates tab: create/edit/delete card templates
  Each template stores: name, description pre-fill, default column, default assignee,
  due date offset (days from apply date), default custom field values, default subtasks

### Custom Field Rendering
Render field values based on type:
- `text` - plain text input
- `number` - number input
- `date` - date picker
- `url` - clickable link plus text input for editing
- `enum` - MUI Select dropdown from options list

Health enum values map to MUI Chip colors:
- Good - green (#4caf50)
- Ok - orange (#ff9800)
- Needs Work - red (#f44336)
- Waiting on DCM - blue (#2196f3)

---

## Auth Implementation

Use MSAL (Microsoft Authentication Library), the same configuration as Lumina.
Get the MSAL client ID, tenant ID, and redirect URI from Stephen Alba / Lumina config.

```javascript
// server/middleware/auth.js
// Verify MSAL token on each request
// Attach user to req.user
// Create user record on first login if not exists
```

Session stored server-side. On first Microsoft login, create a user record in MongoDB
using the Microsoft profile (name, email, microsoftId). Role defaults to 'member'.
Admins must be promoted manually by another admin.

---

## Drag and Drop

Use `@dnd-kit/core` for:
1. Reordering cards within a column
2. Moving cards between columns
3. Reordering columns on the board
4. Reordering subtasks within a card
5. Reordering columns and fields in settings

On drag end, call the reorder API endpoint to persist new order.
Optimistically update UI before API confirms.

---

## Asana Migration Seeder

`migration/asana-seed.js` reads a JSON export file (e.g. `asana-export-rachel.json`)
and loads it into MongoDB.

### Scope: everything is per-project (per-board)
Columns, custom fields, and card templates all belong to a single board (`boardId`).
Nothing is shared across boards. This mirrors Asana, where sections (columns) and
task templates are project-scoped. Each imported project gets its own columns,
fields, and templates — there is no global/shared set.

### Seeder behavior
- Idempotent, safe to re-run. Uses asanaGid as unique key, upserts on conflict.
- Creates the board if it does not exist (matched by asanaProjectGid)
- Creates columns from the export, preserving order
- Creates custom fields from the export
- Creates card templates from the export (see "Templates must be imported" below)
- Cards previously in archive-named columns (cancelled, completed campaign) are seeded with isArchived: true
- Creates cards, preserving createdAt timestamps
- Creates subtasks per card
- Creates comments per card, preserving createdAt and storing migratedAuthorName
- Prints a seeder report on completion

### Templates must be imported (TODO — not yet implemented)
Card templates are NOT currently exported or seeded. They are project-scoped in
Asana ("Task Templates"), so they must be migrated per project just like columns:
- `migration/asana-migrate.js` must fetch each project's task templates from Asana
  (`GET /projects/{project_gid}/task_templates`) and write them into the export JSON,
  mapping each to our `card_templates` shape (name, descriptionTemplate,
  defaultColumnId, defaultAssigneeId, dueDateOffsetDays, defaultFieldValues,
  defaultSubtasks).
- `migration/asana-seed.js` must upsert those templates onto the board (keyed by
  asanaGid) alongside columns and fields.

Until this is built, any sample templates created by hand are lost whenever the
database is reset and re-seeded — they are not reproducible from the Asana export.

### Column mapping prompt (interactive)
```
Board: The A Team (Team Rachel)
Columns found:
  [0] Sub 30 Day Accounts
  [1] Edited and Under Pacing
  [2] Edited and Under Performing
  [3] Pacing and Performing Appropriately
  [4] Not Serving on Google: Policy Violations
  [5] Paused
  [6] Pending Cancellation
  [7] Cancelled Clients         <- mark as archive? (y/n)
  [8] Completed Campaigns       <- mark as archive? (y/n)
  [9] Projects
  [10] Duplicate Task Board     <- skip? (y/n)
```

---

## Error Handling

### Backend
- All route handlers wrapped in try/catch
- Central error middleware in `server/middleware/error.js`
- Consistent error shape: `{ error: { message, code } }`
- Log errors to console with stack trace in development

### Frontend
- Axios interceptor for 401 - redirect to login
- Axios interceptor for 5xx - show toast error
- MUI Snackbar for toast notifications
- Never show raw error messages to users

---

## Code Style

- No TypeScript, plain JavaScript throughout
- ES modules (import/export) on frontend, CommonJS (require) on backend
- Async/await everywhere, no .then() chains
- No inline styles, use MUI sx prop or styled()
- Component files: PascalCase (BoardColumn.jsx)
- Utility/hook files: camelCase (useBoard.js)
- Keep components focused, if a component exceeds ~150 lines split it
- No console.log in committed code, use a logger utility

---

## What NOT to Build (Phase 1)

Do not build these, they are explicitly out of scope:
- Timeline, Gantt, or Calendar views
- Dashboard or reporting/analytics
- Automated rules or if-then triggers
- Email or push notifications
- Mobile-responsive layout
- Asana-style My Tasks cross-board view
- File/attachment uploads
- @mentions in comments
- Activity feed / audit log UI

---

## Key Business Rules

1. Cards are never hard-deleted (unless empty — no comments, subtasks, description, or field values). Otherwise they are archived (isArchived: true) via the Archive button in the card drawer. There are no archive columns.
2. Comments are never deleted by members, admin can delete
3. All users see all boards, no per-board access control
4. Migrated comment timestamps are sacred, preserve exactly as exported from Asana
5. Column names are not standardized, each team owns their own column structure
6. The tool must stay simple. If a feature adds complexity without clear buyer value, do not build it.

---

## Build Order

Build in this sequence:

1. Database - connect to MongoDB Atlas, create indexes
2. Auth - MSAL login/logout/me endpoints and middleware
3. Boards + Columns + Fields API - CRUD endpoints
4. Cards API - CRUD, move, filter, search
5. Comments + Subtasks API
6. Migration seeder - load asana-export-rachel.json into MongoDB
7. Frontend: Board view - columns and cards (read only first)
8. Frontend: Drag and drop - move cards between columns
9. Frontend: Card detail - comments, subtasks, fields
10. Frontend: Board settings - manage columns, fields, templates
11. Frontend: Auth - Microsoft SSO login, protected routes
12. Frontend: Admin - user management

Validate with real data (Team Rachel export) at step 6 before building frontend.

---

## AI Agents

The app uses Anthropic's SDK for all AI features. No other AI provider.
Install: `npm install @anthropic-ai/sdk`

All agents run server-side in Express route handlers. Never call the Anthropic API
from the frontend directly.

```javascript
// server/lib/anthropic.js
const Anthropic = require('@anthropic-ai/sdk');
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
module.exports = client;
```

---

### Agent 1: Asana Sync Agent

Keeps the new tool in sync with Asana during the transition period when some buyers
are still using Asana. Runs on-demand, never on a schedule.

**When it runs:**
- On login: sync the logged-in user's assigned cards
- On viewing another user's board or filtering by another user: sync that user's cards

**Sync lock (prevents double syncs):**

Add these fields to the user document:
```javascript
{
  lastSyncedAt: Date,        // last successful sync timestamp
  syncStatus: String,        // 'idle' or 'in_progress'
  syncStartedAt: Date,       // when current sync started (for timeout recovery)
  syncSessionId: String      // login session that started the sync
}
```

**Sync decision logic:**
```
Before syncing User X's cards:

1. If syncStatus = 'in_progress' AND syncStartedAt > 10 minutes ago
     -> assume crashed, reset syncStatus to 'idle', continue

2. If syncStatus = 'in_progress' AND syncStartedAt < 10 minutes ago
     -> another session is syncing, skip

3. If lastSyncedAt exists AND was synced during THIS login session
     -> already fresh this session, skip

4. Otherwise:
     -> set syncStatus = 'in_progress', syncStartedAt = now, syncSessionId = current session
     -> fetch Asana changes for User X since lastSyncedAt
     -> apply updates to MongoDB
     -> set syncStatus = 'idle', lastSyncedAt = now
```

**What the agent syncs per user:**
- New comments on cards assigned to that user (append only, never overwrite)
- Field changes: assignee, due date, column/section, description
- New subtasks added to their cards
- Completion status changes

**Conflict resolution:**
If a card was updated in BOTH Asana and the new tool since last sync:
- Comments: append both, label source ("Imported from Asana" vs no label for native)
- Field changes: last-write-wins based on updatedAt timestamp
- Never silently overwrite, always append comments

**Implementation:**
```javascript
// server/agents/syncAgent.js

const anthropic = require('../lib/anthropic');

async function syncUserCards(userId, sessionId) {
  const db = getDb();
  const user = await db.collection('users').findOne({ _id: userId });

  // Check sync lock
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  if (
    user.syncStatus === 'in_progress' &&
    user.syncStartedAt > tenMinutesAgo
  ) {
    return { skipped: true, reason: 'sync already in progress' };
  }

  // Check if already synced this session
  if (user.syncSessionId === sessionId && user.syncStatus === 'idle') {
    return { skipped: true, reason: 'already synced this session' };
  }

  // Acquire lock
  await db.collection('users').updateOne(
    { _id: userId },
    {
      $set: {
        syncStatus: 'in_progress',
        syncStartedAt: new Date(),
        syncSessionId: sessionId
      }
    }
  );

  try {
    const since = user.lastSyncedAt || new Date('2020-01-01');

    // Use Claude to intelligently process and map Asana changes
    // Claude handles edge cases, detects conflicts, formats notes cleanly
    const asanaChanges = await fetchAsanaChangesForUser(user.asanaGid, since);

    if (asanaChanges.length > 0) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: `You are a data sync agent for Ignite Buyer Board.
          You receive a list of Asana changes and a list of existing MongoDB records.
          Your job is to determine what needs to be created, updated, or flagged as a conflict.
          Respond only in JSON. Never overwrite existing comments, only append.
          Label all imported content with isMigrated: true.`,
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              asanaChanges,
              instructions: 'Return { toInsert: [], toUpdate: [], conflicts: [] }'
            })
          }
        ]
      });

      const plan = JSON.parse(response.content[0].text);
      await applySync(plan, db);
    }

    // Release lock
    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { syncStatus: 'idle', lastSyncedAt: new Date() } }
    );

    return { synced: true, changes: asanaChanges.length };

  } catch (err) {
    // Release lock on error
    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { syncStatus: 'idle' } }
    );
    throw err;
  }
}

module.exports = { syncUserCards };
```

**API routes for sync:**
```
POST /api/sync/me              trigger sync for logged-in user (called on login)
POST /api/sync/:userId         trigger sync for another user (called on board view)
GET  /api/sync/:userId/status  check sync status for a user
```

**When to disable the Sync Agent:**
When the team is fully migrated and Asana is retired, set an env variable:
```
ASANA_SYNC_ENABLED=false
```
The sync routes return early without calling Asana. The Asana PAT can then be revoked.

---

### Agent 2: Optimization Note Agent

Helps buyers write structured optimization notes faster. Buyer pastes raw notes,
agent formats them cleanly, suggests a health status update, and flags if a follow-up
subtask is needed.

**When it runs:** buyer clicks "AI assist" next to the comment box on a card.

**What it receives:**
- The raw note the buyer typed
- The card's current health status
- The last 3 comments for context

**What it returns:**
- A cleaned, structured version of the note
- A suggested health status (Good / Ok / Needs Work / Waiting on DCM)
- A suggested subtask title if follow-up is needed (or null)

**Implementation:**
```javascript
// server/agents/noteAgent.js

async function processOptimizationNote(rawNote, cardContext) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: `You are an assistant for digital advertising buyers at Ignite.
      You help format optimization notes clearly and consistently.
      Keep the buyer's voice. Do not add information they did not provide.
      Respond only in JSON.`,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          rawNote,
          currentHealth: cardContext.health,
          recentComments: cardContext.lastComments,
          instructions: `Return {
            formattedNote: string,
            suggestedHealth: 'Good' | 'Ok' | 'Needs Work' | 'Waiting on DCM' | null,
            suggestedSubtask: string | null
          }`
        })
      }
    ]
  });

  return JSON.parse(response.content[0].text);
}

module.exports = { processOptimizationNote };
```

**API route:**
```
POST /api/agents/note     { rawNote, cardId } -> { formattedNote, suggestedHealth, suggestedSubtask }
```

The buyer always reviews and confirms before anything is saved. The agent suggests,
the buyer decides.

---

### Agent 3: Account Health Agent

Reads a card's full comment history and surfaces a plain-English summary of what
has been happening with the account. Useful when a buyer inherits an account or
needs to quickly catch up on history.

**When it runs:** buyer clicks "Summarize history" on a card detail view.

**What it receives:**
- All comments on the card (with dates and authors)
- All subtasks (completed and pending)
- Current field values (health, assignee, due date)

**What it returns:**
- A 3-5 sentence plain English summary
- Key dates (last optimization, last DCM contact, etc.)
- Any open issues flagged

**Implementation:**
```javascript
// server/agents/healthAgent.js

async function summarizeAccountHistory(card, comments, subtasks) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: `You are an assistant for digital advertising buyers at Ignite.
      You summarize account optimization history clearly and concisely.
      Focus on what was done, when, and what is still open.
      Write in plain English, 3-5 sentences max.
      Respond only in JSON.`,
    messages: [
      {
        role: 'user',
        content: JSON.stringify({
          cardTitle: card.title,
          comments: comments.map(c => ({
            date: c.createdAt,
            author: c.migratedAuthorName || 'buyer',
            body: c.body
          })),
          subtasks: subtasks.map(s => ({
            title: s.title,
            isComplete: s.isComplete,
            dueDate: s.dueDate
          })),
          instructions: `Return {
            summary: string,
            lastOptimizationDate: string | null,
            openIssues: [string],
            recommendedAction: string | null
          }`
        })
      }
    ]
  });

  return JSON.parse(response.content[0].text);
}

module.exports = { summarizeAccountHistory };
```

**API route:**
```
GET /api/agents/health/:cardId   -> { summary, lastOptimizationDate, openIssues, recommendedAction }
```

---

### Agent Execution: Parallel vs Sequential

```
PARALLEL (independent data, run at same time):
  Login sync (my cards) + page load = user reaches board with fresh data

  Multiple users logging in simultaneously:
    User A sync -> User A's cards only
    User B sync -> User B's cards only
    No overlap, fully parallel

SEQUENTIAL (depends on previous result):
  Note Agent -> buyer reviews -> save comment
  Health Agent -> buyer reads -> no action needed

  Sync Agent on board view:
    Step 1: check sync lock (must complete before step 2)
    Step 2: fetch Asana changes (must complete before step 3)
    Step 3: apply to MongoDB (must complete before releasing lock)
```

---

### Environment Variables for Agents

Never commit secrets to the repo. Store all secrets in environment variables.
Reference `.env.example` for the full list of required variables.

On Vercel: set these in the Vercel project dashboard under Settings, Environment Variables.
Locally: copy `.env.example` to `.env` and fill in real values. `.env` is gitignored.

```
ANTHROPIC_API_KEY=        # Anthropic API key
ASANA_SYNC_ENABLED=true   # set to false when Asana is retired
ASANA_WORKSPACE_GID=      # 461175262246056
```

ASANA_PAT is a secret. Store it only in Vercel environment variables or your local .env file.
Never put it in any file that gets committed to git.
Rotate the PAT immediately if it is ever exposed (committed, screenshot, shared in chat).


---

## Design

The UI should feel familiar to Asana users. Buyers will use both tools side by side
during the transition period, so visual similarity reduces confusion and speeds adoption.
Reference Asana's board view as the design benchmark, not a pixel-perfect clone but
close enough that an Asana user feels immediately at home.

### Layout

Follow Asana's board layout closely:
- Dark left sidebar for navigation (board list, user menu)
- Top bar with board name, filters, and search
- Main area: horizontal scrollable columns
- Each column has a header with name and card count
- Cards are compact in board view, full detail opens in a right-side drawer (like Asana)
- Drawer overlays the board without navigating away

### Colors and Typography

- Dark sidebar: #1d1f25 (Asana's near-black sidebar)
- Sidebar text: white and light gray
- Main background: #f9f9f9 (off-white, not pure white)
- Column headers: white cards with subtle shadow
- Cards: white with subtle border and hover shadow
- Primary action color: #f06a6a (Asana's coral/salmon red) for buttons and highlights
- Font: use MUI default (Roboto), same weight and sizing as Asana

### Cards (board view)

Each card in the board shows:
- Title (bold, truncated at 2 lines)
- Assignee avatar (circle with initials, bottom left)
- Due date (bottom, red if overdue)
- Health field as a colored MUI Chip (Good=green, Ok=orange, Needs Work=red, Waiting on DCM=blue)
- Comment count icon (bottom right)
- Subtask progress (e.g. 3/5 checkmark icon, bottom right)

### Card detail (right drawer)

Matches Asana's task detail panel:
- Title at top, editable inline on click
- Assignee, due date, column status as field rows on the left
- Custom fields below in the same field row style
- Description text area in the middle
- Subtasks section below description
- Comments/activity at the bottom
- "Imported from Asana" label on migrated comments, slightly muted style

### Columns

- White column headers with column name and card count badge
- Light gray column background to separate from cards
- Add card button at bottom of each column
- Drag handle visible on hover

### Do not replicate

These Asana UI elements should NOT be built:
- Top navigation tabs (Overview, List, Timeline, Calendar, Workflow, Dashboard)
- Portfolio and Goals sidebar items
- Inbox
- My Tasks view
- Any premium/upgrade prompts

---

## Theming

The app supports both light and dark themes. Users pick their own preference and it
persists across sessions. Never force a theme on anyone.

### Theme toggle
- Small toggle button in the top bar or user menu (sun/moon icon)
- Preference saved to the user record in MongoDB (theme: 'light' or 'dark')
- Loaded on login so the user always gets their preferred theme immediately
- Defaults to the user's OS preference on first login (prefers-color-scheme)

### Light theme
Close to Asana's default light UI:
- Sidebar: #1d1f25 (dark sidebar stays dark even in light mode, same as Asana)
- Main background: #f9f9f9
- Column background: #f1f1f1
- Cards: #ffffff with subtle border
- Text: #1d1f25
- Primary action: #f06a6a

### Dark theme
- Sidebar: #1d1f25 (unchanged, already dark)
- Main background: #1a1a1a
- Column background: #242424
- Cards: #2d2d2d with subtle border
- Text: #e0e0e0
- Primary action: #f06a6a (same coral, works on both themes)

### Implementation
Use MUI's built-in theming system with createTheme and ThemeProvider.
Define both themes in `client/src/theme.js` and switch based on user preference.

```javascript
// client/src/theme.js
import { createTheme } from '@mui/material/styles';

const commonTokens = {
  palette: {
    primary: { main: '#f06a6a' },
  },
};

export const lightTheme = createTheme({
  ...commonTokens,
  palette: {
    ...commonTokens.palette,
    mode: 'light',
    background: { default: '#f9f9f9', paper: '#ffffff' },
    text: { primary: '#1d1f25' },
  },
});

export const darkTheme = createTheme({
  ...commonTokens,
  palette: {
    ...commonTokens.palette,
    mode: 'dark',
    background: { default: '#1a1a1a', paper: '#2d2d2d' },
    text: { primary: '#e0e0e0' },
  },
});
```

Store active theme in AuthContext so it is available everywhere without prop drilling.