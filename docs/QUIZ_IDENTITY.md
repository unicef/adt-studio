# Quiz identity

A quiz owns a book-local `quizId` from `qz001` through `qz999`. The ID names
its HTML page and its question/answer catalog keys, which also identify
translations and audio files. `quizIndex` is a compatibility position field;
it is normalized on save and never determines identity after allocation.

## Allocation and regeneration

All application quiz writes go through `saveQuizOutput` in
`packages/pipeline/src/quiz-ids.ts`. It reads every retained quiz version,
reserves explicit IDs and legacy positional IDs, allocates additions, and saves
a new version in one storage transaction. The reservation includes the current
version and versions newer than a restored version.

- Editing, deleting, or repositioning an existing quiz preserves its ID.
- Generate-one replacement and full-stage regeneration create new quizzes with
  fresh IDs. Identical or cached model output does not reuse an old identity.
- Restoring a version selects its existing quizzes and IDs. It does not allocate
  new entities or release IDs used by later versions.
- Exhaustion fails without a partial save. Removing quizzes, restoring a version,
  or rerunning extraction does not release IDs. The current three-digit output
  contract supports 999 distinct quiz identities over a book's retained lifetime.

Full quiz reruns keep prior quiz output until successful persistence. A failed
run leaves that output available; a successful run with no eligible pages saves
an empty quiz set. This also applies to the CLI DAG generation path.

Upstream invalidation and extraction resets retain quiz history and append a
`null` invalidation version. Both storage and API current-row readers interpret
that selected version as absent output, without falling back to an older quiz
set. Repeated invalidation is idempotent. Other nodes retain their existing reset
behavior, including preservation of font configuration during extraction.

New IDs prevent regenerated quizzes from adopting an old quiz's translation or
manual recording, even when the run retains the Speech manifest. Regeneration
does not overwrite the old ID-derived audio files. Quiz history is not a full
pipeline snapshot: restoring a quiz version still invalidates downstream
catalogs and Speech under the existing restore contract.

The guarantee covers retained history and all subsequent application writes.
History already erased by older releases, external database edits, or replacing
a book with an older archive cannot be reconstructed by this change.

## API and read models

`GET /books/:label/quizzes` resolves legacy IDs in each quiz's original array
position without writing a backfill version. Clients should retain those IDs
when saving edits. PUT accepts only canonical, unique IDs and rejects an
explicit retired ID unless its version has first been restored.

For older clients that omit IDs, unchanged quizzes are matched against the
current set by their complete content and provenance. Unambiguous retries,
deletions, reorders, and appends preserve identity. Ambiguous edits or identical
candidate quizzes return HTTP 400 and instruct the caller to reload and include
IDs. Edits during active quiz generation return HTTP 409; generate-one checks
again after its model call before saving.

The version picker requests `resolveQuizIds=true` together with `includeData=true`
from the history endpoint, so legacy and stamped versions compare using the
same identity. The default debug response remains the exact stored JSON.
Studio consumes resolved IDs from the API; Storyboard URL parsing stays in
Studio rather than importing runtime quiz helpers from shared packages.

Catalog generation, preview, and packaging validate complete quiz arrays,
including duplicate IDs and collisions between explicit and legacy positional
IDs. Packaging validates before removing an existing export and separately
checks that each quiz's destination stays in the export directory. This protects
books imported directly from storage as well as API-created content.

## Regression coverage

`apps/api/src/routes/quiz-identity-regressions.test.ts` exercises real routes,
SQLite, stage reset, quiz generation, catalogs, preview, packaging, and Speech
file writing. Only remote model responses and synthesized audio bytes are
stubbed. It checks rollback, full regeneration, legacy replacement, retries,
exhaustion, corrupt imports, export containment, comparison normalization, and
preservation of manual recording bytes. Storage tests additionally cover
invalidation transaction rollback and both current-row readers.
