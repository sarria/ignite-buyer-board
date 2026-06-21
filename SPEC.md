# Ignite Buyer Board - Project Specification
**Version**: 0.3
**Date**: June 10, 2026
**Prepared by**: Juan Sarria / Claude
**Stakeholders**: Chris Maffei, Dakota Hiatt, Stephen Alba, Sun Sachs

---

## 1. Purpose

Replace Asana for Ignite buying teams who use it to track account optimizations and maintain historical notes. The replacement will be a custom internal tool built on the same stack as Lumina (React + Vite + Material UI frontend, Node.js backend), living in a new wrapper app that will house future Ignite tools.

This is purely a tool for buyers. As soon as it stops being a tool and becomes a chore, it has failed its purpose.

---

## 2. Scope

### Phase 1
- Optimization boards for the four buying teams (Dakota's use case)
- Full historical data migration from Asana (all 244+ active projects plus archived)
- User authentication via Microsoft SSO (MSAL, shared with Lumina)
- Custom columns per board (fully editable)
- Custom fields per board (fully editable)

### Phase 2
- Lumina data integration (auto-populate advertiser name, line item data)
- Campaign launch workflow boards (Social Boards, SEM Boards, etc.)
- Mobile layout
- Notifications

### Migration Strategy (Batched)
```
Batch 1: 4 buying team boards (validate everything works)
Batch 2: Active Social Boards (~30)
Batch 3: Active SEM + Display Boards (~50)
Batch 4: Active individual/misc boards (~160)
Batch 5: Archived projects (unknown count)
```

---

## 3. Data Model

### 3.1 Hierarchy
```
App
└── Board  (one per team, replaces Asana "project")
    ├── Column  (status category, fully customizable per board)
    ├── CustomField  (fully customizable per board)
    └── Card  (one per advertiser account)
        ├── CardFieldValue  (values for each custom field)
        ├── Subtask
        └── Comment
```

### 3.2 Board
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| name | string | team-chosen name e.g. "Team Rachel" |
| description | string | optional |
| createdBy | ObjectId ref User | |
| createdAt | Date | |

### 3.3 Column
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| boardId | ObjectId ref Board | |
| name | string | e.g. "Edited and Under Pacing" |
| position | number | drag-to-reorder |
| color | string | hex color, optional |
| asanaGid | string | nullable, for migrated columns |
| createdAt | Date | |

### 3.4 CustomField
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| boardId | ObjectId ref Board | fields are per-board |
| name | string | e.g. "Health", "Budget", "Lumina Link" |
| type | string | text / number / date / url / enum |
| options | Array of strings | for enum type only |
| isRequired | boolean | default false |
| position | number | display order on card |
| asanaGid | string | nullable, for migrated fields |

**Field types:**
- `text` - freeform text (GTM container email, notes)
- `number` - numeric value (budget)
- `date` - date picker (campaign start/end)
- `url` - clickable link (Lumina line item link)
- `enum` - dropdown from options list (Health: Good / Ok / Needs Work / Waiting on DCM)

### 3.5 Card
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| boardId | ObjectId ref Board | |
| columnId | ObjectId ref Column | current position |
| title | string | advertiser name |
| assigneeId | ObjectId ref User | the buyer |
| dueDate | Date | optional, card-level |
| description | string | freeform, preserve Lumina links etc. |
| position | number | order within column |
| isArchived | boolean | set via Archive button on card |
| fieldValues | Array | [{fieldId, value}] embedded |
| asanaGid | string | nullable, original Asana GID |
| asanaProjectGid | string | nullable, source project |
| createdAt | Date | preserve original on migration |
| updatedAt | Date | |

### 3.6 Subtask
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| cardId | ObjectId ref Card | |
| title | string | e.g. "15-day op", "May 2026" |
| assigneeId | ObjectId ref User | nullable |
| dueDate | Date | optional |
| isComplete | boolean | |
| notes | string | optional |
| position | number | |
| asanaGid | string | nullable |
| createdAt | Date | |

### 3.7 Comment
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| cardId | ObjectId ref Card | |
| authorId | ObjectId ref User | nullable for migrated comments |
| body | string | the optimization note |
| createdAt | Date | preserve original timestamp on migration |
| isMigrated | boolean | |
| migratedAuthorName | string | original author name for migrated comments |
| migratedAuthorEmail | string | nullable |
| asanaGid | string | nullable |

### 3.8 User
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| name | string | |
| email | string | unique |
| role | string | admin / member |
| microsoftId | string | from MSAL, unique |
| defaultBoardId | ObjectId ref Board | nullable |
| createdAt | Date | |

### 3.9 CardTemplate
| Field | Type | Notes |
|---|---|---|
| _id | ObjectId | |
| boardId | ObjectId ref Board | |
| name | string | |
| defaultSubtasks | Array | [{title, dueDateOffsetDays}] |
| descriptionTemplate | string | prefilled scaffold |

---

## 4. Feature List

### 4.1 Boards
- Each team has one board (admins can create more)
- All users see all boards, open access
- Board name and description editable by admins
- Boards can be created from scratch or seeded from migration

### 4.2 Columns
- Fully customizable per board, add / rename / reorder / delete
- Color labelable
- Cards move between columns via drag-and-drop or status toggle
- All movement is manual, no automation rules
- New boards start with a default column set

### 4.3 Custom Fields
- Fully customizable per board, add / edit / reorder / delete
- Field types: text, number, date, url, enum
- Enum fields have editable options list
- Fields can be marked required
- Displayed on card detail view in order
- Migrated from Asana custom fields automatically

**Default fields suggested (not enforced):**
- Health (enum: Good / Ok / Needs Work / Waiting on DCM)
- Lumina Link (url)
- Budget (number)

### 4.4 Cards
- One card per advertiser generally
- Required on creation: title, board, column
- Optional: assignee, due date, description
- Cards archived via Archive button in card detail drawer
- Cards never hard deleted (unless empty), archived instead
- Cards moveable between boards (market/team reassignments)
- Template duplication: create from template, fill unique fields
- Filter by assignee, health, column

### 4.5 Subtasks
- Add / edit / reorder / delete within a card
- Each subtask: title, optional assignee, optional due date, optional notes, checkbox
- Completion does NOT auto-move the card
- Standard labels from templates: "15-day op", "30-day op", month-based ("May 2026")
- Ad hoc subtasks added freely

### 4.6 Comments
- Chronological activity log per card
- Author name and timestamp displayed
- Never deleted by members, admin can delete
- Migrated comments show original author and original timestamp clearly
- Migrated comments visually distinct with "Imported from Asana" label

### 4.7 Templates
- Per-board card templates
- Define default subtask list and description scaffold
- Duplicate template, fill unique fields (title, assignee)
- Managed by admins

### 4.8 Filtering and Search
- Per-board filter by assignee (primary: "show me my book")
- Per-board filter by column
- Per-board filter by any enum custom field (e.g. Health)
- Global search by card title across all boards

### 4.9 User Management
- Admin: manage boards, columns, fields, templates, users
- Member: create/edit cards, comments, subtasks, move cards
- All users see all boards

---

## 5. Migration Plan

### 5.1 Why This Is the Critical Blocker
Years of historical optimization notes live in Asana comment threads. If this data cannot be migrated cleanly, with original timestamps and author attribution, the project cannot proceed.

### 5.2 Confirmed Data from Test Export (Team Rachel)
From the completed test migration of The A Team (Team Rachel):
- 2,411 cards (716 active, 1,695 archived)
- 19,691 comments across 2,195 cards
- 7,662 subtasks across 1,862 cards
- 0 errors
- 10 unique buyers
- 1 custom field: Health (enum, Good / Ok / Needs Work / Waiting on DCM)
- 11 columns

### 5.3 Full Migration Scope
- All 244 active Asana projects
- All archived Asana projects (count TBD)
- Estimated total: 10,000 to 20,000+ cards

### 5.4 What Migrates
| Data | Priority |
|---|---|
| Cards (title, description, assignee, due date) | Required |
| Comments with author and timestamp | Required |
| Subtasks | Required |
| Column placement | Required |
| Custom fields and values | Required |
| Asana GID (traceability) | Required |
| Tags | Nice to have |
| Attachments | Phase 2 |

### 5.5 Column Mapping at Import
Each migrated board goes through a column mapping step:
- Admin reviews imported columns
- Marks which columns are "archive" columns (cancelled/completed accounts)
- Cards in those columns are seeded with isArchived: true
- All other columns import as active

### 5.6 Author Mapping
Migrated comments store migratedAuthorName and migratedAuthorEmail as strings. A second pass links migrated comments to real user accounts after onboarding.

### 5.7 Migration Scripts
Three scripts, run in sequence:
1. `asana-explore.js` - read-only, validates access (complete)
2. `asana-migrate.js` - exports Asana data to JSON (complete for Team Rachel)
3. `asana-seed.js` - loads JSON into MongoDB (next step)

### 5.8 Timeline
Asana subscription paid through March 2027. No hard deadline, but migration should complete well before then.

---

## 6. Authentication
Microsoft SSO via MSAL, shared implementation with Lumina. No email/password auth.

---

## 7. Tech Stack
| Layer | Technology |
|---|---|
| Frontend | React + Vite + Material UI (MUI v5) |
| Backend | Node.js (JavaScript, no TypeScript) |
| Database | MongoDB (Atlas) |
| Auth | Microsoft SSO via MSAL (shared with Lumina) |
| Drag and drop | @dnd-kit/core |
| HTTP client | axios |
| API | Express.js |
| Hosting | Vercel initially, migrate to Lumina environment later |

---

## 8. What Success Looks Like
From Dakota Hiatt, kickoff meeting:
1. Blank-slate kanban grid per team, custom columns, custom fields, cards with due dates, subtasks
2. Historical Asana data migrated cleanly, no starting from scratch
3. Lumina data auto-population (Phase 2)
4. It remains a tool, not a chore

---

## 9. Open Questions
| # | Question | Owner | Status |
|---|---|---|---|
| 1 | Vercel vs Lumina environment, confirm initial hosting plan | Stephen Alba | Open |
| 2 | Total user count | Chris Maffei | Open |
| 3 | Lumina API available for Phase 2? | Stephen Alba | Open |
| 4 | Archived project count in Asana | Juan Sarria | Open |
| 5 | MSAL config details to share from Lumina | Stephen Alba | Open |

---

## 10. Out of Scope (Phase 1)
- Timeline, Gantt, or Calendar views
- Dashboard or reporting
- Automated rules or triggers
- Email or push notifications
- Mobile layout
- Asana-style My Tasks cross-board view
- Attachments (Phase 2)

---

## 11. AI Agents

The app uses the Anthropic SDK for all AI features. Agents run server-side only,
never called from the frontend directly. All agents use claude-sonnet-4-20250514.

### Agent 1: Sync Agent

Keeps the new tool in sync with Asana during the transition period when some buyers
are still using Asana or switching back and forth.

**Trigger:** on-demand only, never on a schedule.
- User logs in -> sync that user's assigned cards
- User views another buyer's board or filters by another buyer -> sync that buyer's cards

**Sync lock:** prevents double syncs when two users log in simultaneously and both
would trigger a sync for the same buyer's cards.

Each user record tracks:
- lastSyncedAt: when their cards were last successfully synced
- syncStatus: 'idle' or 'in_progress'
- syncStartedAt: timestamp when current sync started (for crash recovery)
- syncSessionId: which login session started the sync

**Logic before syncing User X:**
1. If syncStatus is 'in_progress' and syncStartedAt is less than 10 minutes ago, skip (another session is syncing)
2. If syncStatus is 'in_progress' and syncStartedAt is more than 10 minutes ago, assume crashed and reset to idle
3. If lastSyncedAt was set during this login session, skip (already fresh)
4. Otherwise, acquire lock and sync

**What syncs:**
- New comments on that user's cards (append only, never overwrite)
- Field changes: assignee, due date, column, description
- New subtasks
- Completion status changes

**Conflict resolution:**
If a card was updated in both Asana and the new tool since last sync, comments from
both sources are appended and labeled. Field changes use last-write-wins based on
timestamp. Nothing is silently overwritten.

**Kill switch:**
When Asana is fully retired, set ASANA_SYNC_ENABLED=false. Sync routes return
immediately without calling Asana. The Asana PAT can then be revoked.

### Agent 2: Optimization Note Agent

Helps buyers write structured optimization notes faster. Buyer types raw notes,
agent formats them cleanly, suggests a health status update, and flags if a
follow-up subtask is needed.

The buyer always reviews and confirms before anything is saved. Agent suggests,
buyer decides.

**Trigger:** buyer clicks "AI assist" next to the comment box on a card.

**Input:** raw note text, current health status, last 3 comments for context.

**Output:** formatted note, suggested health status, suggested subtask title or null.

### Agent 3: Account Health Agent

Reads a card's full comment and subtask history and surfaces a plain-English summary.
Useful when a buyer inherits an account or needs to quickly catch up on history going
back years.

**Trigger:** buyer clicks "Summarize history" on a card detail view.

**Input:** all comments with dates and authors, all subtasks, current field values.

**Output:** 3-5 sentence summary, last optimization date, open issues, recommended next action.

### Parallel vs Sequential Execution

Agents that operate on independent data run in parallel:
- Multiple users logging in simultaneously each sync their own cards with no overlap

Agents that depend on a previous result run sequentially:
- Sync Agent: check lock, fetch changes, apply to MongoDB, release lock
- Note Agent: agent formats note, buyer reviews, buyer saves

### Environment Variables
- ANTHROPIC_API_KEY
- ASANA_PAT (secret, stored in Vercel environment variables only, never committed to git)
- ASANA_SYNC_ENABLED (set to false when Asana is retired)
- ASANA_WORKSPACE_GID
