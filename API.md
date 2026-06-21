# Ignite Buyer Board — API Reference

Base URL: `http://localhost:3001/api`

All endpoints require auth (currently bypassed — dev user attached automatically).
Admin-only endpoints are marked **[admin]**.

---

## Boards

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/boards` | List all boards (with column count) |
| GET | `/boards/:boardId` | Get board + columns + fields |
| POST | `/boards` | Create board **[admin]** |
| PUT | `/boards/:boardId` | Update board **[admin]** |
| DELETE | `/boards/:boardId` | Delete board **[admin]** |

### POST /boards
```json
{
  "name": "Team Rachel",
  "description": "Rachel buying board"
}
```

### PUT /boards/:boardId
```json
{
  "name": "Updated Name",
  "description": "Updated description"
}
```

---

## Columns

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/boards/:boardId/columns` | List columns for a board |
| POST | `/boards/:boardId/columns` | Create column |
| PUT | `/boards/:boardId/columns/reorder` | Reorder columns |
| PUT | `/columns/:columnId` | Update column |
| DELETE | `/columns/:columnId` | Delete column (must be empty) |

### POST /boards/:boardId/columns
```json
{
  "name": "Pacing Well",
  "color": "#4caf50"
}
```

### PUT /columns/:columnId
```json
{
  "name": "Renamed Column",
  "color": "#ff9800"
}
```

### PUT /boards/:boardId/columns/reorder
```json
{
  "columnIds": ["<id1>", "<id2>", "<id3>"]
}
```

---

## Custom Fields

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/boards/:boardId/fields` | List fields for a board |
| POST | `/boards/:boardId/fields` | Create field |
| PUT | `/boards/:boardId/fields/reorder` | Reorder fields |
| PUT | `/fields/:fieldId` | Update field |
| DELETE | `/fields/:fieldId` | Delete field |

Field types: `text` `number` `date` `url` `enum`

### POST /boards/:boardId/fields — text / number / date / url
```json
{
  "name": "Budget",
  "type": "number",
  "isRequired": false
}
```

### POST /boards/:boardId/fields — enum
```json
{
  "name": "Health",
  "type": "enum",
  "options": ["Good", "Ok", "Needs Work", "Waiting on DCM"],
  "isRequired": false
}
```

### PUT /fields/:fieldId
```json
{
  "name": "Renamed Field",
  "options": ["Good", "Ok", "Needs Work", "Waiting on DCM", "New Option"],
  "isRequired": true
}
```

### PUT /boards/:boardId/fields/reorder
```json
{
  "fieldIds": ["<id1>", "<id2>", "<id3>"]
}
```

---

## Cards

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/boards/:boardId/cards` | List cards for a board |
| POST | `/boards/:boardId/cards` | Create card |
| PUT | `/boards/:boardId/cards/reorder` | Reorder cards within a column |
| GET | `/cards/:cardId` | Get card detail + comments + subtasks |
| PUT | `/cards/:cardId` | Update card |
| DELETE | `/cards/:cardId` | Archive card (soft delete) **[admin]** |
| PUT | `/cards/:cardId/move` | Move card to a different column |
| PUT | `/cards/:cardId/move-board` | Move card to a different board |
| PUT | `/cards/:cardId/fields` | Set custom field values on a card |

### GET /boards/:boardId/cards — query params
| Param | Type | Description |
|-------|------|-------------|
| `assignee` | userId | Filter by assignee |
| `column` | columnId | Filter by column |
| `archived` | `true` / `false` | Show archived cards (default: hides archived) |
| `search` | string | Full-text search on title |

Example: `GET /boards/:boardId/cards?archived=false&search=acme`

### POST /boards/:boardId/cards
```json
{
  "title": "Account: Acme Corp",
  "columnId": "<columnId>",
  "assigneeId": "<userId>",
  "dueDate": "2026-07-01",
  "description": "Initial optimization notes"
}
```

### PUT /cards/:cardId
```json
{
  "title": "Updated Title",
  "assigneeId": "<userId>",
  "dueDate": "2026-08-01",
  "description": "Updated notes",
  "isArchived": false
}
```

### PUT /cards/:cardId/move
```json
{
  "columnId": "<columnId>",
  "position": 0
}
```
> Cards are archived via the Archive button in the card drawer, not by column placement.

### PUT /cards/:cardId/move-board
```json
{
  "boardId": "<boardId>",
  "columnId": "<columnId>"
}
```

### PUT /cards/:cardId/fields
Keys are fieldIds, values depend on field type.
```json
{
  "<fieldId>": "Good",
  "<fieldId>": "2026-07-15",
  "<fieldId>": 12500
}
```

### PUT /boards/:boardId/cards/reorder
```json
{
  "cardIds": ["<id1>", "<id2>", "<id3>"]
}
```

---

## Subtasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/cards/:cardId/subtasks` | Create subtask |
| PUT | `/cards/:cardId/subtasks/reorder` | Reorder subtasks |
| PUT | `/subtasks/:subtaskId` | Update subtask |
| DELETE | `/subtasks/:subtaskId` | Delete subtask |

### POST /cards/:cardId/subtasks
```json
{
  "title": "Check pacing report",
  "assigneeId": "<userId>",
  "dueDate": "2026-07-01",
  "notes": ""
}
```

### PUT /subtasks/:subtaskId
```json
{
  "title": "Updated title",
  "isComplete": true,
  "dueDate": "2026-07-10",
  "notes": "Done, pacing is back on track"
}
```

### PUT /cards/:cardId/subtasks/reorder
```json
{
  "subtaskIds": ["<id1>", "<id2>", "<id3>"]
}
```

---

## Comments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/cards/:cardId/comments` | List comments (oldest first) |
| POST | `/cards/:cardId/comments` | Add comment |
| PUT | `/comments/:commentId` | Edit comment (author or admin) |
| DELETE | `/comments/:commentId` | Delete comment **[admin]** |

### POST /cards/:cardId/comments
```json
{
  "body": "Adjusted bids on top keywords, pacing improved to 95%."
}
```

### PUT /comments/:commentId
```json
{
  "body": "Updated comment text"
}
```

---

## Users

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/users` | List all users |
| POST | `/users` | Create user **[admin]** |
| PUT | `/users/:userId` | Update user |
| DELETE | `/users/:userId` | Deactivate user **[admin]** |

### POST /users **[admin]**
```json
{
  "name": "Rachel Smith",
  "email": "rachel@ignite.com",
  "role": "member"
}
```

### PUT /users/:userId
```json
{
  "name": "Rachel Smith",
  "role": "admin",
  "defaultBoardId": "<boardId>"
}
```

---

## Card Templates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/boards/:boardId/templates` | List templates for a board |
| POST | `/boards/:boardId/templates` | Create template |
| PUT | `/templates/:templateId` | Update template |
| DELETE | `/templates/:templateId` | Delete template |
| POST | `/templates/:templateId/apply` | Create card from template |

### POST /boards/:boardId/templates
```json
{
  "name": "New Account",
  "descriptionTemplate": "Account overview:\n\nGoals:\n\nNotes:",
  "defaultSubtasks": [
    { "title": "Review pacing report", "dueDateOffsetDays": 3 },
    { "title": "Check DCM trafficking", "dueDateOffsetDays": 7 }
  ]
}
```

### POST /templates/:templateId/apply
```json
{
  "columnId": "<columnId>"
}
```

---

## AI Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/sync/me` | Sync Asana cards for logged-in user |
| POST | `/sync/:userId` | Sync Asana cards for another user |
| GET | `/sync/:userId/status` | Check sync status for a user |
| POST | `/agents/note` | Format optimization note (AI assist) |
| GET | `/agents/health/:cardId` | Summarize account history |

### POST /agents/note
```json
{
  "rawNote": "bumped bids on branded terms cpm went up but ctr improved overall looks good",
  "cardId": "<cardId>"
}
```
Returns:
```json
{
  "formattedNote": "...",
  "suggestedHealth": "Good",
  "suggestedSubtask": null
}
```

### GET /agents/health/:cardId
Returns:
```json
{
  "summary": "...",
  "lastOptimizationDate": "2026-06-01",
  "openIssues": ["DCM trafficking delay"],
  "recommendedAction": "Follow up with DCM contact"
}
```

---

## Error Response Shape

All errors return:
```json
{
  "error": {
    "message": "Human-readable message",
    "code": "ERROR_CODE"
  }
}
```

Common codes: `NOT_FOUND` `VALIDATION` `CONFLICT` `FORBIDDEN` `SERVER_ERROR`
