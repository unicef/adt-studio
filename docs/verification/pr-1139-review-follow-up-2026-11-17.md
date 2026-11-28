# PR #1139 review follow-up — 17 November 2026

## Summary

The [latest review of PR #1139](https://github.com/unicef/adt-studio/pull/1139#pullrequestreview-5927557222) approves commit `44d4ea73ac5278f0c3fc91dc71098aab4434f55f`. It reports no outstanding findings. The earlier keyboard-selection and repeated-add findings were already fixed on that commit; the remaining keyboard focus gaps are tracked in [#1146](https://github.com/unicef/adt-studio/issues/1146).

This follow-up checked the reviewer's unverified Storyboard entry point in running Studio. No product code or test was changed. This report records the result and limits of that check.

**Issue:** #1138 (existing PR)
**Lane:** fast
**Tier:** untriaged (as stated in the PR)
**Acceptance criteria closed (spec lane):** n/a

## Verification

- [ ] `pnpm typecheck` — not run in this follow-up; the latest review reports it clean at `44d4ea73`.
- [ ] `pnpm test` (affected packages) — not run in this follow-up.
- [x] Focused dialog test — `pnpm exec vitest run --project studio apps/studio/src/components/pipeline/stages/storyboard/components/SegmentPreviewDialog.test.tsx`: 1 file, 12 tests passed.
- [ ] `pnpm lint` (UI changes) — not run in this follow-up; the latest review reports no finding in the component.
- [ ] Regression test added (behaviour bugs) — no new behaviour or test was added in this follow-up; the PR already contains the dialog regression tests.
- [x] Verified in running Studio / desktop where UI-facing — running Studio in headless Chromium, using the local book `Shoqeria-dhe-mjedisi-4-Baze`. From a Storyboard page image, the **Segment** toolbar action opened the dialog with a stubbed analysis response. The `photo` region had button role, accessible name, and `aria-pressed="false"`; programmatically focusing it and pressing Enter changed `aria-pressed` to `true`, and Delete removed it while retaining `drawing`. Nine consecutive **Add region** actions produced nine distinct displayed positions. Cancel closed the dialog. One analysis request was stubbed; zero Apply requests were sent. This check did not run the desktop app.

The browser smoke script was temporary and removed after the run. The working tree was clean before this report was added.

## Not verified

- Electron desktop UI, Firefox, Safari, or a screen reader. Browser role and attribute checks are not a screen reader test.
- A real segmentation model call or applying, cropping, and saving segments. The analysis response was stubbed and no Apply request was sent.
- The Extract entry point in this follow-up. The existing PR body records an earlier running Studio check there.
- The full Studio test project, typecheck, lint, and catalog extraction in this follow-up. Their results in the review are attributed to the reviewer, not this check.

## Docs & decisions

- [x] This report documents the follow-up verification; no product behaviour or contract changed.
- [x] No standing decision changed; no ADR is needed.
- [x] i18n: no user-visible strings or catalogs changed in this follow-up.
