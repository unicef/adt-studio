# Prompt persistence operations

SPEC-0011 is implemented for review in PR #887. The specification and ADR 027
remain in review/proposed. Shared freshness integration is unavailable: saving
starts no generation, and affected outputs need regeneration. Studio shows that
notice in the editor and warns that imported projects use this host's global
settings. It does not automatically compare imported outputs with host globals.

## Roots and compatibility

- Book overrides stay in `<BOOKS_DIR>/<label>/prompts` and travel in project ZIPs.
- Server and CLI globals use `PROMPT_OVERRIDES_DIR`, defaulting to
  `<BOOKS_DIR>/.adt-studio/prompt-overrides`.
- Electron supplies `<userData>/prompt-overrides`, separate from packaged resources.
- Bundled defaults use `PROMPTS_DIR` and remain read-only. Layout templates still
  use `path.join(path.dirname(PROMPTS_DIR), "templates")`; moving overrides does
  not change that path. `TEMPLATES_DIR` is not a supported override.

Writable roots must not overlap bundled resources or each other, including through
symlink aliases. The deployment root itself may be a symlink, but paths beneath
it cannot traverse symlinks. Use a filesystem that supports exclusive creation,
atomic same-directory rename and directory creation. Independent processes on one
local filesystem are tested; distributed/network filesystems are not validated.

Docker's API and combined image default to `/app/books/.adt-studio/prompt-overrides`,
inside the persistent books volume. For a separate mount, set
`PROMPT_OVERRIDES_DIR=/app/prompt-overrides` and mount a writable persistent volume
at that path. Keep `PROMPTS_DIR` pointed at the resources containing the sibling
`templates` directory. Recreating a container without its persistent volumes
cannot preserve application settings.

All readers search requested model candidates across book/global/bundled roots
before searching generic candidates across those roots. Thus a shipped model
variant can outrank a book generic override. The configured base prompt model
uses the generic candidate. Studio displays the resolved candidate and source.

## Mutation protocol

GET the prompt and retain its opaque `revision`. Save, reset and restore must send
that revision; omitted preconditions return `428 PROMPT_PRECONDITION_REQUIRED`,
stale ones return `409 PROMPT_CONFLICT` with the current readable state. Do not
substitute the newest cached revision for a draft's loaded revision. Review the
newer state and explicitly reload or keep/retry the draft. After a lost response,
re-read before retrying: a successful prior commit may already exist. Identical
content is a no-op only when the supplied revision is current.

Writers acquire exclusive filesystem gates for all involved writable roots in a
stable order, re-read the revision, exclusively create a timestamped version and
publish an immutable UUID selection followed by the atomic `.current` pointer.
The root gate serializes candidates more conservatively than a per-candidate
lock; it also protects inherited global revisions and migration. There is no
lock timeout that steals ownership from a paused writer. A held gate returns a
retryable `503 PROMPT_BUSY` after bounded retries.

Every reset/restore records a fresh selection identity, including A → B → A.
Version bytes and previous selections remain available. A failed publication can
leave an unselected version or selection record; neither becomes current by
filename ordering. Missing/corrupt new-format pointers fail explicitly. Legacy
pointer-less discovery is materialized before new writes. No automatic garbage
collection deletes these records.

Project export captures prompt files under the same gate, then streams the ZIP
from that snapshot. It omits the ephemeral writer gate, so importing an archive
cannot inherit a lock or pair a concurrently changed pointer with an older list.
Used prompt messages remain in the existing book SQLite call log.

## Migration, recovery and rollback

Startup copies legacy global `.versions` and valid model metadata into the
writable root without deleting source files or replacing newer target selections.
Existing target flat overrides also retain precedence. Migration is idempotent;
same-named different bytes, corrupt metadata or model-folder collisions stop with
`PROMPT_MIGRATION_CONFLICT`. Keep both roots intact for deliberate reconciliation.
New candidate directories are staged and renamed as a unit. Interrupted migration
can be retried; partially staged directories never enter resolution.

For an abandoned `.prompt-write.lock`, first stop **all** API, Desktop and CLI
writers sharing that root and retain a backup. Inspect its `owner.json` and remove
only the abandoned lock directory. Restart/re-read before editing. Never remove a
live lock based on its age. A cancelled/lost HTTP response does not prove a write
was rolled back; the normal resolver is authoritative.

For a corrupt pointer, stop writers and preserve the root. Validate a retained
`.selections/<uuid>.json` and its referenced version before recovery. Publish a
new selection ID using the shared `publishPromptSelection` helper under
`withPromptGates`, referencing the retained record as `previous`; do not copy an
old revision back verbatim or select the latest orphan by filename. All retained
versions must remain intact. This is operator recovery, not an automatic merge.

Keep migrated roots/history when rolling back. Older binaries may not understand
JSON selections and may implement destructive reset. An in-place downgrade is
unsupported. If older software must be inspected, use a separate pre-upgrade
backup with prompt directories made read-only and edits disabled; retain the
post-upgrade books and application settings untouched for the compatible reader.

## Development acceptance commands

`pnpm test --maxWorkers=4`, `pnpm typecheck`, `pnpm lint` and `pnpm build` cover the
available invariant checks. `pnpm lint:invariants` is not implemented in this repo.
Run `pnpm --filter @adt/studio extract` and check zero missing entries in all locales.

For the Desktop harness, build an unpacked app, compile
`scripts/prompt-persistence-desktop-smoke.ts` with the existing API esbuild, then
run it with Electron, passing the packaged `Contents/Resources` path and a new,
disposable user-data directory. Make the packaged prompts read-only before the
run. The harness exercises the real Electron utility-process API, writable host
paths, save/restart and unchanged templates; it selects packaged adapter mode
explicitly and does not launch the installed application against a user's profile.
It does not establish installer, notarization, Windows/Linux or release acceptance.
