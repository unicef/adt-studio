# SPEC-0001 October 22 timing and editor corrections

This record covers the correction of findings (a)–(c) and the associated spec
inconsistencies against PR #879 head `c8553add731ef6338b8b747e96fa30047ce04ab7`.
It does not replace historical acceptance records or certify the entire branch
for release. SPEC-0001 remains in review and ADR-024 remains proposed.

## Scope and decisions

Sources: [elasticsounds' three findings](https://github.com/unicef/adt-studio/pull/879#issuecomment-6332386481)
and [rechkunov's before-merge assessment](https://github.com/unicef/adt-studio/pull/879#issuecomment-6340376966).
The PR owner requested these three corrections locally, superseding their initial
later-follow-up disposition. No push, PR comment, review request or merge is part
of this batch.

- **Legacy timing identity:** issue a read-time receipt from the stored audio
  metadata and actual locale namespace. No media bytes are read or hashed to
  create the receipt. Saving validates both that receipt and the timing collection
  version. Existing clients with a valid audio hash remain compatible. Ambiguous,
  changed or missing audio is rejected without applying the draft.
- **Physical preservation:** opening timings does not create an audio snapshot.
  A successful modifying save uses the existing speech publication/preservation
  service; that service can take the first physical snapshot so prior audio and
  timing versions remain restorable. This is separate from the metadata-only
  first-open baseline. No additional writer lock or generation call was added.
- **Pending edits:** only the save's own returned entry/version may advance a
  successor draft's guard. A later refetch cannot acknowledge that draft. Timing
  drafts participate in existing navigation protection, remain mounted through
  collapse and collection changes, and block conflicting language/voice/actions.
  Failed or stale writes retain the draft.
- **Scope remains bounded:** older Note 7 speech publication, provider classifier,
  positional-ID carry-over, ownership repair and performance follow-ups remain
  deferred. Neither #958 nor #966 replaces the manual timing-edit contract.

## Finding-to-evidence matrix

| Finding / acceptance requirement | Status in this batch | Evidence |
| --- | --- | --- |
| (a): AC-7 legacy timing edits without an audio hash | Passed | `apps/api/src/routes/tts.test.ts`: read receipt without media reads/version writes, save with absent or empty hash, primary/secondary separation and `pt_BR` storage. Chromium saves a hashless English recording through the real API. |
| (a): AC-9 stale input/version rejection | Passed | API tests reject changed audio metadata, timing version, locale namespace, voice and missing files. Duplicate saves reject. The real UI retains its draft after a competing writer causes HTTP 409. |
| (a): AC-11 physical history preservation | Passed for timing correction | Real filesystem/SQLite tests restore original audio and timings after the modifying save, preserve the other voice and roll back a failed physical publication. This does not certify recovery of already-lost historical files. |
| (b): AC-7/9 pending-save draft recovery | Passed | `WordTimestampViewer.test.tsx` and `LanguageView.save.test.tsx`: delayed acknowledgement, newer unblurred edits, later-writer refetch, network/conflict errors, overlapping clicks, collapse, external source/audio removal, editor identity and Save & leave. Same-batch first-edit plus language/voice switch is covered. Real UI verifies delayed acknowledgement, second save and concurrent-write rejection. |
| (c): four OutputReview test harnesses | Passed | CaptionCard, EasyReadEditor, EasyReadEditor.restore and retained-stage-views supply the required book-run context; retained-stage-views also supplies its pipeline label adapter. Original assertions execute in the passing full suite. |
| Spec feedback 1–6: labels, narrative/AC mapping, generator scope, first-open exception, terminology and organization | Passed document review | Four labels agree with Studio. The clarification-to-AC map identifies concrete regressions and limits. Named linked decisions replace dated session prose; doctor and acceptance books are defined. |
| Spec feedback 7: metadata / approver | Corrected; approval pending | Updated date is October 22; fake integration placeholder removed. Product reviewer remains named, integration approver remains explicitly unassigned, status stays in-review. |
| Spec feedback 8: Speech/Word Highlighting cancellation | Deferred, not implemented | Spec retains the ratified staged-publication limitation and the requirement to track its follow-up at merge. #958/#966 are coordination references, not evidence of completed publication changes. |
| Other AC-1–6/8/10/12–16 journeys | Not rerun as complete acceptance journeys | Their existing automated regressions ran in the full suite. This batch does not re-certify all four worked examples, private historical books or release behavior. |

The initial regression run reproduced both runtime failures before production
changes: legacy timing save returned 400, and the successor `0.200` edit disappeared
after the first acknowledgement. The untouched `c8553add` harness baseline had
10 failing tests plus one suite import failure.

## Real UI verification

Playwright 1.58.2 drove Chromium against the actual Vite Studio and Hono API with
book-local SQLite and physical audio files. The synthetic book has four pages,
two languages and two voice slots, legacy audio/timing rows without `audioHash`,
and locally generated valid PCM WAV files. This covers the relevant legacy schema
shape, locale/voice separation and real persistence; it does not reproduce every
historical book, legacy ownership pattern, codec or provider response.

1. Open legacy timings; receive metadata identity without an audio hash.
2. Save `0.100`; hold the real successful HTTP response after persistence; type
   `0.200` before releasing it. Language, voice and delete controls stay disabled.
   The newer draft survives acknowledgement, refetch and collapse/reopen.
3. Save the successor draft. Persist `0.200` with manual timing provenance;
   secondary-voice timing remains `0.000`.
4. Write `0.400` from a competing API client, then save the UI's stale `0.300`.
   Receive HTTP 409 with an error message and the `0.300` draft still present.

All four journeys passed, with no browser page errors and no browser generation
or transcription requests. Navigation-dialog behavior and external row removal
were verified by React integration tests, not an additional browser walkthrough.
The synthetic fixture is not De-codable pg006, Frankenstein or the Tanzania sample.

## Commands and results

Local environment: macOS, Node 24.13.0, pnpm 10.32.1. Hosted CI uses Node 22/Linux;
local checks do not constitute a hosted CI run. Provider credentials were removed
from the test process to exercise credential-absence branches without live calls.

| Check | Result |
| --- | --- |
| `pnpm test` (includes `pnpm build` via pretest) | 4,531 tests passed in 361 files. |
| Affected React rerun after final synchronous first-edit guard changes | 24 tests passed in WordTimestampViewer and LanguageView.save. The full suite preceded these final guard lines; all affected tests, typecheck, lint and Studio build were rerun afterward. |
| `pnpm typecheck` | Passed. |
| `pnpm --filter @adt/runtime typecheck` | Passed. |
| `pnpm --filter @adt/studio build` | Passed; bundler reports large-chunk warnings. |
| `pnpm lint` | Passed, zero errors and eight unused-suppression warnings. Running the same command on untouched `c8553add` reproduced the same eight warnings in the same files. |
| `pnpm --filter @adt/studio extract` | Passed; 3,762 messages and zero missing translations in all five locales. |
| `pnpm --filter @adt/studio compile --strict` | Passed. |
| `docker build --target api -t adt-spec0001-oct22-api:local .` | Passed. This is the CI Docker build target, not the combined release `app` runtime check. |
| `git diff --check` | Passed. |
| Separate invariant command | Not available in this checkout; no such command is claimed to have passed. Existing type, test and lint coverage ran. |

Raw local logs, synthetic book, browser script and screenshots are under
`/private/tmp/spec0001-oct22-fixes/`; they are not repository artifacts and may be
removed by the OS. Durable regressions are in the test files named above.

## Independent review and remaining acceptance

A separate read-only reviewer examined the correction diff, regression assertions,
final focused-test output and browser result artifact. Two valid findings from
its first pass—parent navigation/draft retention and empty legacy audio hashes—were
fixed and tested. Its final pass found no remaining blocking source defects in
this remediation. It did not independently rerun the full suite or browser session,
and did not perform an exhaustive new review of the full accumulated PR.

No known defect remains in the authorized (a)–(c) correction scope. The whole PR
still requires develop-conflict resolution and fresh hosted CI after a separately
authorized push. The remote branch was rechecked at `c8553add` before local commits;
no concurrent remote update was observed. This batch does not claim Desktop
packaging, a clean combined Docker `app` runtime, Tanzania doctor acceptance,
elasticsounds' historical-book spot checks, non-author integration approval or
completion of the explicitly deferred work.
