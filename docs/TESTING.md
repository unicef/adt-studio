# Test Execution Guide — ADT Studio

Quick reference with all test commands in logical sequence.

**Requirements:** Node.js 20+, pnpm 10+

---

## 1. Initial setup

```bash
# Install all dependencies
pnpm install

# Build shared packages (required before any test)
pnpm build
```

---

## 2. Unit tests (Vitest)

### Run all tests

```bash
pnpm test
```

### Run in watch mode (re-runs on save)

```bash
pnpm test:watch
```

### Run with code coverage

```bash
pnpm test --coverage
```

> The HTML coverage report is generated at `coverage/index.html`.

### Run a specific area only

```bash
# Pipeline tests
pnpm test packages/pipeline

# API tests
pnpm test apps/api

# Studio tests
pnpm test apps/studio

# A single file
pnpm test apps/api/src/routes/books.test.ts
```

### Run accessibility unit tests only

```bash
pnpm test -- --testNamePattern="accessibility|a11y"
```

---

## 3. E2E desktop tests (Playwright + Electron)

> E2E tests require the compiled Electron app. Run the build once before running.

### Build the desktop app (prerequisite)

```bash
pnpm build:desktop
```

### Run all E2E tests

```bash
pnpm test:e2e
```

### Run a specific file

```bash
# IPC bridge tests (window.api, window.electron)
pnpm test:e2e tests/desktop/electron-bridge.spec.ts

# API and pipeline tests
pnpm test:e2e tests/desktop/pipeline.spec.ts

# Stage queue tests (stage-queue, SSE)
pnpm test:e2e tests/desktop/stage-queue.spec.ts

# Book versioning and lifecycle tests
pnpm test:e2e tests/desktop/versioning.spec.ts

# WCAG accessibility tests on the real app
pnpm test:e2e tests/desktop/accessibility.spec.ts
```

### Run with pre-extracted book fixture (advanced tests)

```bash
RAVEN_EXTRACTED_BOOK_DIR=./tests/fixtures/raven-extracted pnpm test:e2e
```

---

## 4. Visual reports

### Open Playwright HTML report

```bash
npx playwright show-report
# Opens at http://localhost:9323
```

### Open coverage report (after running with --coverage)

```bash
# Windows
start coverage/index.html

# macOS
open coverage/index.html

# Linux
xdg-open coverage/index.html
```

---

## 5. Accessibility (axe-core)

### Unit tests with axe (React components)

```bash
# All .a11y.test files
pnpm test -- --reporter=verbose apps/studio/src/components/pipeline/components/ToggleCard.a11y.test.tsx
pnpm test -- --reporter=verbose apps/studio/src/components/books/DeleteBookDialog.a11y.test.tsx
```

### WCAG audit on the Electron app (E2E)

```bash
pnpm test:e2e tests/desktop/accessibility.spec.ts
```

### axe audit on generated books (requires processed books)

```bash
# Audit with text report
pnpm a11y:regression

# Audit with JSON output
pnpm a11y:regression:json

# Browser audit (color-contrast + layout-dependent rules)
pnpm a11y:browser-recheck

# Browser audit with JSON output
pnpm a11y:browser-recheck:json
```

---

## 6. Generate test report (document)

```bash
# Generates docs/test-report.xlsx and docs/test-report.docx
# Requires coverage/coverage-summary.json (run pnpm test --coverage first)
node scripts/generate-test-report.mjs
```

---

## 7. Full sequence (from scratch)

Run the commands below in order to execute the full suite from zero:

```bash
# 1. Install dependencies
pnpm install

# 2. Build all packages
pnpm build

# 3. Unit tests with coverage
pnpm test --coverage

# 4. Build the Electron app
pnpm build:desktop

# 5. E2E tests
pnpm test:e2e

# 6. Generate report documents
node scripts/generate-test-report.mjs
```

---

## 8. Available scripts summary

| Command | What it does |
|---|---|
| `pnpm test` | All unit tests (Vitest) |
| `pnpm test --coverage` | Unit tests + coverage in `coverage/` |
| `pnpm test:watch` | Tests in watch mode |
| `pnpm test:e2e` | All Playwright E2E tests |
| `pnpm test:e2e <file>` | Specific E2E file |
| `pnpm a11y:regression` | axe audit on generated books |
| `pnpm a11y:browser-recheck` | axe audit via browser (color-contrast) |
| `node scripts/generate-test-report.mjs` | Generates `.xlsx` and `.docx` report |
| `npx playwright show-report` | Opens Playwright HTML report |

---

## 9. Reference files

| File | Description |
|---|---|
| `vitest.config.ts` | Vitest configuration (include, coverage, timeout) |
| `playwright.config.ts` | Playwright configuration (testDir, workers, reporters) |
| `tests/desktop/setup.ts` | Shared E2E fixtures (Electron launcher) |
| `tests/fixtures/raven.pdf` | PDF fixture used in E2E tests |
| `coverage/index.html` | HTML coverage report (generated after `--coverage`) |
| `playwright-report/index.html` | Playwright HTML report (generated after `test:e2e`) |
| `docs/test-report.xlsx` | Test report spreadsheet |
| `docs/test-report.docx` | Test report Word document |
| `docs/TEST-REPORT.md` | Test report in Markdown |
