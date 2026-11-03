# SPEC-0003 — verified-recovery independent review remediation

Local work only; no GitHub changes. Reviewed candidate:
`bdbc9603823ef506198cec340019cebd85f81bde`, prerequisite
`4b9e40cc185cdbceb3ef248248e440c08f25fa82`. Both independent whole-contract
reviews are final. Their separate maps cover all 26 original ACs and 18 revised
criteria. Neither report confers specification approval or release certification.

Reports are in the main repository's `.local-docs/`:
`spec0003-recovery-review-codex-20261103/{REPORT,MATRIX,COMMANDS}.md` and
`spec0003-recovery-review-claude-code-20261103/{REPORT,MATRIX,COMMANDS}.md`.
Remediation evidence is `spec0003-recovery-remediation-20261103/` (`E`).

The [November 4 acceptance refresh](spec-0003-recovery-acceptance-2026-11-04.md)
records verification at runtime head `00b4a5c2`, the completed bounded rechecks,
all original 26 / revised 18 mappings, and the still-unresolved F-2 decision.
It supersedes the progress statements below, without changing their historical
test results or granting specification approval.

## Feedback disposition

| Finding | Correction / disposition | Verification |
|---|---|---|
| Codex C-R1 P1 — lost integrity objects become trusted again | Durable additive schema-14 installation/gap markers distinguish initial installation from lost tables/triggers. Reopening does not recreate missing evidence. Recovery/checkpoint/allocation refuse a gap; usable raw/current reads remain available. | New continuity tests reproduced all failures before editing. Missing trigger, witness table, all evidence objects and duplicate returned history are covered. Public HTTP lost-tracking/read/admission case and physical-damage positive controls are being refreshed. |
| Codex C-R2 P1 — part merge blesses contradictory bytes | Preview/merge validate incoming identity history before target changes. Source retired identities become non-current target reservations, with source tuple/book provenance, through the same witness/slot mechanism. No source proof is transplanted as target recovery authority; no historical target row is overwritten/deleted. | Shared service regression compares the complete target files on refusal; current/retired page, answer and quiz-option IDs remain reserved. Actual source project ZIP with physical damage now refuses merge; explicit repaired-source control succeeds (`E/results/part-evidence.json`). |
| Codex C-R3 P2 — intrinsic assets omitted from complete packages | Shared package dependency proof includes image inputs and SVG `use` href/xlink references. | Required-file unit tests cover missing/present/cache/deleted resources and local fragments. Real package API returns409 and retains the prior publication for missing input/SVG assets. Healthy ZIP loads both resources with200 in Chromium; cache preserves HTML; deleting a packaged SVG makes status incomplete and rebuild restores it (`E/results/package-elements.json`). |
| Claude F-1 Medium — storage/memory/per-page scan overhead | Exact witness envelopes use built-in Node compression; old plain envelopes remain readable. SQL filters node/item scope, row iteration bounds snapshot memory, and extant witnessed rows are returned once. | Same 120-page/750-record/40.4MB-payload probe: DB44.1MB versus123.0MB; page-scoped scan0.6–2.5ms versus104–161ms; all-history output750 rows versus1500. Root’s warm-process inspection delta34MB is **not a peak bound**. The independent fresh-process recheck measured +254.56MiB high-water RSS and325.45MiB total peak. These different memory metrics do not justify a percentage comparison or a low-end-device certification. `E/logs/performance2.log`. |
| Claude F-2 Medium — old-build unwitnessed deletion dead end | **Pending owner decision.** The old runtime deletes image files before SQLite writes. A database refusal would leave a partially deleted book; that attempted guard was removed. The owner has been asked to choose automatic capture of readable legacy history on first open (amending explicit checkpointing) or an explicit destructive-old-writer compatibility restriction. Neither is assumed. | Confirmed old source `deletePage` and `clearExtractedData` ordering; review's separate old-build probe. No claim that read/Preview/export compatibility proves destructive older-build safety. |
| Claude F-3 Info — already-damaged unwitnessed history | Retain the authorized safe refusal and backup requirement. No fabricated proof, positional ownership, or automatic reconstruction. No expanded CLI doctor/resume subsystem is added. | Existing missing-witness/history tests and early admission protections remain. |
| Claude F-4 Low — valid direct SQL changes can be checkpointed | The new incarnation cannot be repaired using the earlier incarnation. Its earlier verified IDs remain reserved. Explicit capture of a readable new incarnation does not approve generation/freshness. | Existing tuple-reuse tests plus the new single-incarnation/retained-original-ID regression. |
| Claude F-5 Low — recovery endpoint errors | New endpoint missing-book/unknown-audit responses use typed404 codes; invalid labels use the typed request error. Two new messages translated in all five locales. | Common HTTP/SSE mapper, strict Lingui compile, public API refusal tests. |
| Claude H-1 — part retired-history hypothesis | Addressed with C-R2, not assigned to a downstream spec. | Imported historical content/quiz/page reservations do not become current content. |

## Verification progress and corrections

- `E/results/checks.jsonl` records exact commands, exits and elapsed times.
- Before fixes, `history-proof-continuity.test.ts` exposed five failures. The final
  four tests cover C-R1 plus duplicate current history; the older-writer refusal
  experiment was removed once its filesystem hazard was established.
- `focused2`: **149 tests passed in seven files** (storage, history recovery,
  continuity, part service, required files, package routes and localized errors).
- Build, root typecheck, lint and strict five-locale compilation pass. `public-recovery4` additionally passed the typed HTTP errors, lost-tracking
  admission/read control, genuine physical-damage journeys in both layouts and
  part windows, and contradictory/retired part-import cases.
- The initial positive recovery HTTP fixture had dropped a tracking trigger and
  relied on bootstrap to recreate it. The corrected C-R1 behavior rightly refused
  it. The replacement fixture modifies a single byte in the exact SQLite table
  leaf cell while leaving tracking intact. A global byte search was ambiguous
  because other rows retained the same snapshot; the helper resolves the table
  B-tree and exact rowid. A subsequent stale expected audit-byte literal was also
  corrected. These harness attempts remain in the logs and are not product passes.
- Package browser proof intercepts requests from the actual exported ZIP with
  JavaScript disabled. It proves intrinsic resource requests and cache repair,
  not a complete reader interaction journey. Zero external fetch attempts.
- The performance wrapper's first attempt used a relative path from the wrong
  working directory; `performance2` used absolute paths and completed. It did not
  modify source to pass the benchmark.

## Acceptance status

The [original26/revised18 mapping](spec-0003-round4-remediation.md) and
[recovery requirement map](spec-0003-history-recovery.md) remain explicit; previous
verdicts belong to their recorded heads. C-R1/C-R2 affect RAC4–8/15/18, C-R3 affects
RAC12/13, F-1 affects large-book usability, F-2 remains a compatibility contract
decision, and F-5 affects RAC16. Final whole-branch/platform verification and a
bounded independent recheck of this repaired candidate remain pending. No full B1
completion or final-review readiness is claimed here.

B2, automatic cross-page merge and expanded existing-book CLI resume retain only
their existing exact spec/human exclusions. SPEC-0001 legacy-owner qualification
and SPEC-0002's explicit D1–D6 are unchanged. The hardened Electron launch and
cross-origin SCORM findings remain known platform findings, not accepted deferrals.


## Bounded independent recheck at 189cf83d

The independent report is in
`.local-docs/spec0003-recovery-recheck-20261103-codex/{REPORT,COMMANDS}.md`.
It verified C-R1/C-R2/C-R3 corrections using its own negative/positive probes,
including target byte preservation and future target-version reuse after imported
reservations. **48 focused tests passed**. No new P1/P2 was confirmed.

It found RC-1 (P3): when `history_recovery_requests` was missing, request and audit
SQL ran before schema validation and returned an untyped500. The correction checks
schema continuity at the common recovery transaction entry before any request,
receipt or audit query. New public regressions cover missing request, audit and
permit tables, requiring the existing localized409 and unchanged content. Receipt
replay after later content damage remains valid as a report of the prior operation,
not a claim of present health. Before/after results are in `E/logs/before-rc1.log`
and `E/logs/rc1.log`; the final result is recorded in `E/results/checks.jsonl`.

F-2 remains the pending product decision above. No full acceptance or publication
is inferred from the bounded recheck.
