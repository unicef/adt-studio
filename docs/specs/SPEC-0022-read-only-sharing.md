---
id: SPEC-0022
title: Read-only sharing — publish a book without comments or reader presence
status: in-review
owner: "@Eliezir"
approvers: []
issues: []
prs: []
adr: ""
created: 2026-10-31
updated: 2026-10-31
---

## Problem (with evidence)

Every shared book is a feedback room. An author cannot hand a finished book to readers without also inviting comments and showing each reader to everyone else.

- **Publishing always switches comments on.** The export is patched with `features.comments: true` before upload (`apps/api/src/services/publish-service.ts:440`). There is no input on the publish request, the share form or Link settings to turn it off.
- **That one flag drives comments *and* presence in the reader.** `useCommentsContext` returns `null` unless `features.comments === true` (`apps/adt-runtime/src/features/comments/hooks/useCommentsContext.ts:21`). `Comments.tsx` hangs the comment overlay, the presence room (`usePresenceRoom`), live cursors, "N other people reading" and follow mode off that context.
- **The reader service has no notion of a comment-free book.** `publications` has no such column (`apps/publish-service/migrations/0001_init.sql:1-10`). Every publication answers `POST /p/:token/session`, `GET|POST /p/:token/comments` and `GET /p/:token/room` (`comments.ts:127-471`, `room-routes.ts:168`).
- **The access gate always asks for a name** and says "You've been invited to read this book and leave comments" (`apps/publish-service/src/gate-i18n.ts:30-31`). The name exists only to sign comments and appear in the room.

Asked for directly by product: a mode where people who open the book don't see comments, can't add them, and don't see other readers.

## Goals

- An author can share a book in **read-only** mode: readers can read it, but see no comments, can't add any, and don't see or appear to other readers.
- The choice is offered when sharing, and can be changed later on the same link.
- The reader service enforces it, so a read-only link can't be used to read or write comments through the API, even ones left while comments were on.
- The access gate for a read-only book still asks for the reader's name (and the code, when there is one), without the comment wording, so the author keeps knowing who opened the book.
- Comments left before switching to read-only stay with the author in Studio; switching back makes them visible to readers again.

## Non-goals

- **Changing reader-service hosting, the Cloudflare login, or access codes.** Read-only is independent of "with a code / anyone with the link".
- **Per-reader permissions** (some readers may comment, others not), moderation, or comment approval queues.
- **Read-only for the author.** Studio's Feedback tab keeps working on existing comments; the author can still resolve them.
- **Deleting comments** when switching to read-only. They are hidden from readers, not removed.
- **Offline or disconnected access to comments** (#1030 covers stopped and expired links).
- **The friendly page for stopped or expired links** (#914). It ships in the same reader-service release (see Rollout), but it is specified there, not here.

## Proposed design

### Options

| Option | What | Rough cost |
|---|---|---|
| **A. Bundle flag only** | Publish with `features.comments: false`. The reader hides comments and presence. | ~40 lines, 3 files. **No enforcement:** the API still serves and accepts comments for anyone with the link. The gate still asks for a name. Changing the mode means a new version. |
| **B. Server setting + bundle flag** *(chosen)* | A per-publication `comments` setting in the reader service. It is enforced on the comment, session and room routes and shapes the gate. The bundle flag follows it, so the reader UI matches. | ~550 lines across ~15 files plus tests, a D1 migration, and a reader-service release. Split into 2–3 PRs. |
| **C. Server setting, reader asks at runtime** | Like B, but the reader asks the service for the mode on load instead of trusting the bundle, so a switch never needs a new version. | B plus a new public endpoint and a loading state in the reader. More moving parts for a setting that changes rarely. |

**B is chosen** because read-only has to be real: hiding comments in the UI while the API still serves them would leak feedback that readers were never meant to see. C buys only "switch without a new version", which B gets by sending a fresh copy automatically.

### Decisions to ratify

1. **One setting, `comments: "on" | "off"`, stored per publication.** Off means both no comments *and* no presence. Two independent switches ("Readers can comment", "Readers see each other") were considered and declined by product: one switch.
2. **Default stays "on".** Existing publications and old Studios keep today's behaviour; the migration adds the column with default `'on'`.
3. **Enforcement in the reader service.** With `comments = 'off'`, these routes answer `403 { error: "comments_off" }` for readers:
   - every `/p/:token/comments*` route
   - `GET /p/:token/room` and `POST /api/publications/:token/room-ticket`

   Sessions (`POST /p/:token/session`, `/session/claim`) stay open: readers still give their name, so the author's "Who joined" list keeps working. Names are never shown to other readers, because there is no room. The author's management key keeps access to comments, so Studio's Feedback tab still works.
4. **The gate** for a read-only book keeps the name field (and the code field, when there is a code) with a reading-only intro instead of "read this book and leave comments", in all five gate languages.
5. **The bundle flag follows the setting.** Publishing patches `features.comments` to the publication's mode instead of always `true`. Changing the mode in Link settings updates the setting, then sends a fresh copy to the same link and code, so the reader UI matches.
6. **Switching to "off" closes open rooms** (`evictRoomReaders`, as a code change does today), so readers already in the book stop seeing others immediately.
7. **Studio:**
   - The share form gets a "Let readers comment and see each other" switch, on by default.
   - Link settings shows the same switch.
   - The dashboard says "Comments are off for readers", and keeps Feedback for existing comments and Readers for who joined.
8. **Version floor.** Studio offers read-only only when the account's reader service is at the version that enforces it. Otherwise it shows the existing "sharing update" notice first.

## Impact map

- **`packages/types`** (`publication.ts`): `comments` on `Publication`, `PublicationCreate*`, `PublicationUpdateRequest`, the Studio status record and publish request; error code `comments_off`; `PUBLISH_WORKER_VERSION` bump.
- **`apps/publish-service`**:
  - migration `0010_publication_comments.sql`;
  - `d1-store.ts` / `store.ts` read and write the column;
  - guards in `comments.ts` and `room-routes.ts`;
  - `app.ts` PATCH accepts `comments` and evicts room readers;
  - `access.ts` + `gate-i18n.ts` serve the reading-only gate wording.
- **`apps/api`**:
  - `publish-service.ts`: the publish request carries `comments`, and the bundle patch uses it;
  - `routes/publications.ts`: a PATCH for the mode that triggers a fresh-copy run;
  - `publish-worker-client.ts`.
- **`apps/studio`**: the share form (`setup/SettingsFields`, `useShareForm`), Link settings, the dashboard states, i18n in all locales.
- **`apps/adt-runtime`**: no logic change expected (it already hides everything without `features.comments`); a test that a read-only bundle mounts no comment UI and opens no room.
- **Invariants:** none of entity versioning, stable IDs, staleness or prompt contracts. Layering is unchanged: Studio → API → reader service.
- **Data migration:** one additive D1 column with a default. The book's local publication record gains a `comments` field; older records default to "on".
- **Collides with:**
  - SPEC-0006 (Cloudflare publishing scope, draft): this spec could be folded in as a section if SPEC-0006 is picked up first.
  - #914, which ships in the same reader-service release.
  - #1030 / PR #1031, which also touches the dashboard: this spec's Studio PR lands after it.

## Acceptance criteria

- [ ] AC-1: A publication created without a `comments` value is "on", and behaves exactly as today.
- [ ] AC-2: With `comments = 'off'`, a reader request to every comment and room route in Decision 3 answers 403 `comments_off`, including reading comments left while comments were on; starting a named session still works.
- [ ] AC-3: With `comments = 'off'`, the author's management key can still list and resolve comments.
- [ ] AC-4: The gate for a read-only book asks for the name (and the code, when set) with no comment wording, in en, pt-BR, es, fr and sq; the reader then appears in the author's "Who joined" list.
- [ ] AC-5: A read-only bundle shows no comment button, pins, comment list, cursors or roster, and opens no room connection.
- [ ] AC-6: Sharing with the switch off publishes `features.comments: false` and stores `comments: "off"` on the publication and in the book's local record.
- [ ] AC-7: Changing the mode in Link settings updates the publication, sends a fresh copy to the same link and code, and readers already in the room are disconnected from it.
- [ ] AC-8: Switching back to "on" makes the earlier comments visible to readers again.
- [ ] AC-9: Studio's Feedback tab still lists and resolves existing comments on a read-only book, and the dashboard says comments are off for readers.
- [ ] AC-10: Studio does not offer read-only until the account's reader service reports the enforcing version; it offers the update first.
- [ ] AC-11: All new Studio text is translated in every supported locale.

## Test plan

| AC | Level | Test file | Test title |
|----|-------|-----------|------------|
| AC-1 | integration (workerd) | `apps/publish-service/src/comments.integration.test.ts` | `AC-1: a publication without a comments setting keeps comments on` |
| AC-2 | integration (workerd) | `apps/publish-service/src/comments.integration.test.ts`, `room.integration.test.ts` | `AC-2: read-only refuses comments and the room, keeps sessions` |
| AC-3 | integration (workerd) | `apps/publish-service/src/comment-routes.integration.test.ts` | `AC-3: the management key still reads and resolves on a read-only book` |
| AC-4 | integration + unit | `apps/publish-service/src/access.integration.test.ts`, `gate-i18n.test.ts` | `AC-4: the read-only gate keeps the name, drops the comment wording` |
| AC-5 | unit (jsdom) | `apps/adt-runtime/src/features/comments/components/Comments.test.tsx` | `AC-5: a read-only bundle mounts no comments and opens no room` |
| AC-6 | API | `apps/api/src/services/publish-service.test.ts` | `AC-6: sharing read-only bakes comments off and records it` |
| AC-7 | API + integration | `apps/api/src/routes/publications.test.ts`, `room.integration.test.ts` | `AC-7: changing the mode updates, re-sends and empties the room` |
| AC-8 | integration (workerd) | `apps/publish-service/src/comments.integration.test.ts` | `AC-8: switching back on shows earlier comments` |
| AC-9 | component | `apps/studio/.../dashboard/sharing-dashboard.test.tsx` | `AC-9: a read-only book keeps its feedback for the author` |
| AC-10 | component | `apps/studio/.../setup/ShareSetup.test.tsx` | `AC-10: read-only waits for the enforcing reader service` |
| AC-11 | CI | i18n job (`lingui extract` + `compile --strict`) | — |

## Rollout

1. **PR 1 — reader service + types.** Migration, setting, enforcement, gate, version bump. Bundled with #914's friendly stopped/expired page so accounts update once. Ships no visible change until Studio sends the setting; existing publications stay "on". Revert: roll the reader service back; the extra column is ignored.
2. **PR 2 — API + Studio.** Publish request field, bundle patch, the share-form and Link-settings switch, dashboard state, version floor, translations. Revert: Studio stops offering the switch; existing read-only publications keep enforcing until switched back from an older Studio via the API, or left as they are.

Each PR stays inside the ~400-line review budget; tests are the bulk of PR 1.

## Open questions

Resolved by product (@Eliezir, 2026-10-31):
- **One switch or two?** One switch: read-only turns off comments and presence together.
- **Names on read-only books?** Keep asking for the name, so the author sees who opened the book.

Open:
1. **Fold into SPEC-0006?** — maintainers, at review. Default: keep it as its own spec, and link it from SPEC-0006 when that is written.
