---
title: Lumina Comments API — integration guide (for the Luminotes app)
tags: [lumina, ext-api, comments, mentions, luminotes, LM-4131]
status: delivered
createdAt: 2026-08-12
jira: LM-4131
---

# Lumina Comments API — integration guide (Luminotes)

Server-to-server HTTP API for the **Luminotes** SEM-buyer notes app to attach
notes to Lumina line items, on behalf of the signed-in buyer, and @mention
teammates. Built on the existing Lumina external service-auth surface
(`/ext/*`). Self-contained — everything to call it and model responses is here.

---

## 1. Auth (two headers)

Luminotes is the SEM team's app, so it uses the **same SEM team service token**
Juan already has (`ext_sem…`, env `EXT_SEMTEAM_TOKEN`) — no separate credential.
Every request sends it as a Bearer credential AND, because these are on-behalf
endpoints, the acting buyer's Lumina username:

```
Authorization: Bearer ext_sem_<secret>          # the existing SEM team token
X-On-Behalf-Of-User: <buyer-lumina-username>
```

- The token identifies the **SEM team app** (not a person) — server-side only,
  never in a browser/URL/client code. Set via env `EXT_SEMTEAM_TOKEN`.
- `X-On-Behalf-Of-User` is the Lumina username the note is authored as. Lumina
  trusts the app to assert *which* user, but still checks that user is a real,
  non-suspended Lumina user (unknown → `200 {found:false}`; suspended/inactive →
  `403`). The comment's `createdBy` is this user.
- SEM team token scopes: `data:read:sem` (existing cohort read) plus
  `data:read:comments`, `data:write:comments` (added for Luminotes).

---

## 2. Base URL

```
https://townsquarelumina.com/lumina/orders/api/ignite/ext
```

Sanity check (needs the token; returns `{"ok":true,"clientId":"semteam"}`):

```bash
curl -H "Authorization: Bearer $TOKEN" "$BASE/health"
```

---

## 3. Endpoints

| Method & path | Scope | Purpose |
|---|---|---|
| `GET /user/lineitems/{lineitemId}/comments` | `data:read:comments` | List the buyer notes on a line item (oldest first). |
| `POST /user/lineitems/{lineitemId}/comments` | `data:write:comments` | Add a note to a line item. |
| `PATCH /user/comments/{commentId}` | `data:write:comments` | Edit your own note. |
| `DELETE /user/comments/{commentId}` | `data:write:comments` | Soft-delete your own note (marked deleted, never removed). |
| `GET /user/mentions/autocomplete?q={text}` | `data:read:comments` | Username typeahead for `@mention`. |

- **`lineitemId`** is the Lumina line-item id — the same `lineitemId` you get from
  `/sem/lineitems` (see the SEM API guide). Notes and Lumina's internal line-item
  activity share one store, so a buyer note also appears in Lumina's activity tab.
- **List is scoped to Luminotes' own notes** — internal Lumina workflow/task
  system comments on the same line item are NOT returned.
- **Author-only edit/delete.** Editing or deleting a note you didn't author (or one
  already deleted / nonexistent) returns `404 {found:false}` — existence is hidden.

---

## 4. Add a note — `POST /user/lineitems/{lineitemId}/comments`

Body:

```jsonc
{
  "content": "Bumped budget after the client call",   // required, 1..10000 chars
  "mention": ["jane.doe@townsquaremedia.com"]          // optional: usernames to @mention
}
```

Each username in `mention` is notified through Lumina's existing mention-email
flow (same as in-app comments). A mention that can't be resolved is logged and
skipped — it never fails the note write.

Response `200`:

```json
{
  "response": "Comment Added",
  "item": {
    "commentId": "6a7d19bd2f44fc24475cf13d",
    "lineItemId": "6764fc9c77ff89a87fc05bc1",
    "origin": "Line Item",
    "action": "External Comment",
    "content": "Bumped budget after the client call",
    "mention": ["jane.doe@townsquaremedia.com"],
    "createdBy": "pat@sweetroofing.com",
    "createdDate": "2026-08-13T01:11:25.883Z",
    "createdByDisplay": {
      "username": "pat@sweetroofing.com",
      "firstName": "Pat", "lastName": "Sweet",
      "fullName": "Pat Sweet", "accountName": "Pat Sweet"
    }
  }
}
```

---

## 5. List notes — `GET /user/lineitems/{lineitemId}/comments`

```json
{
  "lineItemId": "6764fc9c77ff89a87fc05bc1",
  "count": 1,
  "items": [ { /* same comment shape as §4 item, plus updatedBy/updatedDate if edited */ } ]
}
```

Oldest first. Soft-deleted notes are excluded.

---

## 6. Edit a note — `PATCH /user/comments/{commentId}`

Body (at least one of):

```jsonc
{ "content": "edited text", "mention": ["jane.doe@townsquaremedia.com"] }
```

Returns `{ "response": "Comment Updated", "item": { ... } }` with `updatedBy` /
`updatedDate` set and `createdDate` preserved. If `mention` is included, those
users are re-notified. Not your note / unknown id → `404 {found:false}`.

---

## 7. Delete a note — `DELETE /user/comments/{commentId}`

Soft-delete only. Returns `{ "response": "Comment Deleted", "commentId": "..." }`.
The note stops appearing in the list. Not your note / already deleted → `404`.

---

## 8. Mention autocomplete — `GET /user/mentions/autocomplete?q={text}`

Case-insensitive **contains** match over `username`, `firstName`, `lastName`,
`fullName`. Suspended/inactive users excluded. `limit` optional (default 10,
max 25).

```json
{
  "q": "jane",
  "count": 2,
  "items": [
    { "username": "jane.doe@townsquaremedia.com", "firstName": "Jane",
      "lastName": "Doe", "fullName": "Jane Doe", "email": "jane.doe@townsquaremedia.com" }
  ]
}
```

Feed the chosen `username` into the `mention` array on create/edit.

---

## 9. Status codes

| Code | Meaning |
|---|---|
| `200` | OK. |
| `400` | Bad input (empty `content`, no-op PATCH, missing `q`) or missing `X-On-Behalf-Of-User`. |
| `401` | Missing / invalid Bearer token. |
| `403` | Token lacks scope, or the on-behalf user is suspended/inactive. |
| `404` | Comment not found, already deleted, or not authored by the on-behalf user. |
| `503` | External API disabled server-side (no token registry). |

---

## 10. Quick curls

```bash
TOKEN="ext_sem_<secret>"   # the existing SEM team token (EXT_SEMTEAM_TOKEN)
BASE="https://townsquarelumina.com/lumina/orders/api/ignite/ext"
LI="6764fc9c77ff89a87fc05bc1"
U="pat@sweetroofing.com"
AUTH=(-H "Authorization: Bearer $TOKEN" -H "X-On-Behalf-Of-User: $U")

curl "${AUTH[@]}" "$BASE/user/lineitems/$LI/comments"
curl "${AUTH[@]}" -H "Content-Type: application/json" \
  -d '{"content":"note","mention":["jane.doe@townsquaremedia.com"]}' \
  "$BASE/user/lineitems/$LI/comments"
curl "${AUTH[@]}" -X PATCH -H "Content-Type: application/json" \
  -d '{"content":"edited"}' "$BASE/user/comments/<commentId>"
curl "${AUTH[@]}" -X DELETE "$BASE/user/comments/<commentId>"
curl "${AUTH[@]}" "$BASE/user/mentions/autocomplete?q=jane"
```

---

## 11. Deploy note (Lumina side)

**No new token.** Luminotes uses the existing SEM team token
(`EXT_SEMTEAM_TOKEN`), already set on the **igniteorders** Deployment secret in
lumina-deploy (port 3210). LM-4131 only *adds scopes* to that client
(`data:read:comments`, `data:write:comments`) in `config/config-external.js` —
no secret change to deploy. Revoking/rotating the SEM token affects both the SEM
cohort reads and Luminotes comments (same client).
```
