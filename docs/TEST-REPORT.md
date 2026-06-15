# Test Report — ADT Studio

**Date:** 2026-06-03
**Branch:** `main`
**Environment:** Windows 10, Node.js 24, Electron 41.2.0, Playwright 1.60.0, Vitest 4.0.18

---

## Executive Summary

| Layer | Files | Total | ✅ Passing | ❌ Failing | ⏭ Skip |
|---|---|---|---|---|---|
| Unit (Vitest) | 88 | 1,109 | 1,108 | 1 | — |
| E2E Desktop (Playwright) | 5 | 46 | 45 | 0 | 1 |
| **Total** | **93** | **1,155** | **1,153** | **1** | **1** |

**Overall pass rate: 99.9%**

---

## Unit Tests (Vitest)

### By area

| Area | Test files | Description |
|---|---|---|
| `packages/pipeline` | 22 | All 8 pipeline stages — PDF extraction, sectioning, quizzes, speech, render, glossary, translation, accessibility |
| `packages/llm` | 7 | Cache, multi-provider client (OpenAI/Anthropic/Gemini), rate limiter, prompts, speech |
| `packages/pdf` | 5 | Text and image extraction, clipping, spread mode, Sinhala support |
| `packages/types` | 5 | Zod schemas, book label, pipeline effects, section tree ops |
| `packages/storage` | 2 | SQLite via WASM, book storage, node versioning |
| `apps/api` — routes | 13 | `books`, `pages`, `stages`, `health`, `glossary`, `debug`, `tts`, `package`, `adt-preview`, `reviewer-validation`, `prompts` |
| `apps/api` — services | 4 | `book-service`, `stage-runner`, `export-service`, `page-edit-service` |
| `apps/studio` — logic | 10 | Hooks, lib utils, stage configs, pipeline i18n |
| `apps/studio` — accessibility | 2 | `ToggleCard` and `DeleteBookDialog` with axe-core (WCAG 2.1) |
| `apps/adt-runtime` | 2 | Audio tokenizer, keyboard navigation |

### Known flaky test

| Test | File | Type | Cause |
|---|---|---|---|
| `stores accessibility assessment output after packaging` | `apps/api/src/routes/package.test.ts` | Flaky | Sporadic timeout caused by missing `canvas` package in jsdom — fails ~20% of runs |

---

## E2E Desktop Tests (Playwright + Electron)

All E2E tests use the compiled Electron app (`pnpm build:desktop`) and connect via CDP (`chromium.connectOverCDP`). Each test receives an isolated `--user-data-dir` under `tmp/`.

### By file

| File | Tests | Status | What it verifies |
|---|---|---|---|
| `electron-bridge.spec.ts` | 13 | ✅ all | IPC context bridge — `window.api`, `window.electron`, `process.type`, `windowControls`, `updates` |
| `pipeline.spec.ts` | 17 | ✅ all | API health, book CRUD, `step-status` shape, SPA with no JS errors in console |
| `stage-queue.spec.ts` | 9 | ✅ all | `/stages/run` validation (no key, invalid body, book not found), run queue, SSE stream, tasks endpoint |
| `versioning.spec.ts` | 6 | ✅ 5 / ⏭ 1 | Step run history, book isolation, delete lifecycle, source-pdf info |
| `accessibility.spec.ts` | 5 | ✅ all | WCAG 2.1 AA audit on the real app via axe-core, Tab navigation, no keyboard trap |

> **Intentional skip** in `versioning.spec.ts`: the version fingerprint test requires the `RAVEN_EXTRACTED_BOOK_DIR` env var pointing to a pre-extracted book. Not run in the default environment.

---

## Code Coverage

> Generated with `@vitest/coverage-v8`. HTML report available at `coverage/index.html`.
> Run: `pnpm test --coverage`

### Totals

| Metric | % | Covered lines |
|---|---|---|
| Statements | 29.28% | 7,116 / 24,295 |
| Branches | 21.52% | 3,546 / 16,475 |
| Functions | 21.82% | 1,081 / 4,954 |
| Lines | 30.34% | 6,699 / 22,074 |

### By area

| Area | Stmts | Branch | Funcs | Lines | Files |
|---|---|---|---|---|---|
| `packages/pdf` | 77% | 62% | 81% | **78%** | 6 |
| `packages/pipeline` | 68% | 66% | 69% | **69%** | 40 |
| `packages/types` | 68% | 68% | 80% | 68% | 28 |
| `packages/llm` | 60% | 35% | 66% | 61% | 9 |
| `apps/api` | 48% | 39% | 53% | 49% | 32 |
| `packages/storage` | 39% | 40% | 46% | 40% | 3 |
| `apps/studio` | **6%** | **5%** | **5%** | **6%** | 328 |

### Why the overall total (~30%) appears low

`apps/studio` contains **328 React component files** with no unit tests — they dominate the denominator of the calculation. The functional core of the product (`packages/*` and `apps/api`) has real coverage between **39% and 78%**, which is more representative of business logic test quality.

### Files with 100% coverage

| File | Lines |
|---|---|
| `components/ui/dialog.tsx` | 22 |
| `llm/rate-limiter.ts` | 25 |
| `pdf/fm-sinhala.ts` | 25 |
| `pdf/png-utils.ts` | 32 |
| `pipeline/dag.ts` | 56 |
| `pipeline/image-captioning.ts` | 30 |
| `pipeline/image-meaningfulness.ts` | 28 |
| `pipeline/render-template.ts` | 35 |
| `pipeline/text-catalog.ts` | 82 |
| `types/pipeline-effects.ts` | 43 |

### Files with lowest coverage (< 30% lines, ≥ 20 source lines)

All files below belong to `apps/studio` and are React components with no unit tests:

- `components/ErrorScreen.tsx` (0%)
- `components/LanguagePicker.tsx` (0%)
- `components/debug/DebugPanel.tsx` (0%)
- `components/debug/LlmLogsTab.tsx` (0%)
- `components/import/ImportProject.tsx` (0%)
- `components/onboarding/OnboardingFlow.tsx` (0%)
- `components/onboarding/scenes/ApiKeyScene.tsx` (0%)
- `components/pipeline/components/LandingPageShell.tsx` (0%)

---

## Accessibility (WCAG 2.1)

The project already had an axe-core audit layer for **generated output** (HTML books). In 2026-06, accessibility tests for the **Studio UI itself** were added.

### Tests implemented

| Type | Tool | File | What it ensures |
|---|---|---|---|
| Component | axe-core + jsdom | `ToggleCard.a11y.test.tsx` | Zero axe violations in 3 states; `role=switch`; `aria-checked`; Space/Enter activation; `inert` on decorative switch; `aria-labelledby`/`aria-describedby` |
| Component | axe-core + jsdom | `DeleteBookDialog.a11y.test.tsx` | Zero axe violations; `role=dialog` with accessible name; Escape closes; buttons focusable; pending state announced to AT |
| E2E | axe-core + Electron CDP | `accessibility.spec.ts` | Zero critical/serious WCAG 2.1 AA violations on home page and book detail page |
| E2E | Playwright | `accessibility.spec.ts` | Interactive elements reachable by Tab; no keyboard trap |

### Bug found and fixed

During implementation, axe detected a **WCAG 4.1.2 — Name, Role, Value (serious)** violation in the `ToggleCard` component:

**Cause:** The internal decorative switch used `aria-hidden="true"` + `tabIndex="-1"` on a `<button>` element (rendered by Radix UI). This combination does not fully remove the element from the accessibility tree in some screen readers operating in virtual cursor mode.

**Fix applied** in `ToggleCard.tsx`:
```tsx
// Before
<BrandedSwitch checked={checked} decorative disabled={disabled} />

// After
<span aria-hidden="true" inert>
  <BrandedSwitch checked={checked} decorative disabled={disabled} />
</span>
```

The `inert` attribute is the modern HTML standard for making an element and its entire subtree completely inaccessible to AT, keyboard, and pointer events.

---

## How to run

```bash
# All unit tests
pnpm test

# With code coverage
pnpm test --coverage
# → HTML report at coverage/index.html

# E2E tests (requires prior build)
pnpm build:desktop
pnpm test:e2e

# Accessibility unit tests only
pnpm test -- --testNamePattern="a11y"

# Accessibility E2E tests only
pnpm test:e2e tests/desktop/accessibility.spec.ts

# Visual E2E report
npx playwright show-report
```

---

## Recommended next steps

| Priority | Area | Suggested action |
|---|---|---|
| 🔴 High | `apps/studio` (6% coverage) | Add component tests for main pipeline pages using `@testing-library/react` + axe |
| 🟠 Medium | `packages/llm` branches (35%) | Exercise fallback paths: Anthropic, Gemini, retry on rate-limit, cache miss |
| 🟠 Medium | `packages/storage` (39%) | Cover SQLite edge cases: schema migration, concurrent writes, large datasets |
| 🟡 Low | E2E UI flows | Tests that click buttons and navigate Studio routes (onboarding, PDF upload) |
| 🟡 Low | Flaky fix | Fix `package.test.ts` — install `canvas` in CI or mock `HTMLCanvasElement` |
