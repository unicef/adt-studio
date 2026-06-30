<div align="center">
  <h1>ADT Studio</h1>
  <p>Turn any PDF into an accessible web publication — audio, translations, structured HTML layouts — all generated from your source file, all editable, all yours.</p>
   <p>
     <img width="563" height="426" alt="Diagram showing a 238-page PDF being transformed by ADT into an accessible digital book with audio narration in English, Portuguese and Spanish, sign language in ASL and LIBRAS, image alt text, a glossary, and translation features." src="https://github.com/user-attachments/assets/2df657a0-6023-48ae-acd8-3f7a86f1a1b4" />
  </p> 

  [![Download for Windows](https://img.shields.io/badge/Download-Windows-0078D6?logo=windows&logoColor=white)](https://github.com/unicef/adt-studio/releases/download/v0.3.0-electron/adt-studio.exe)
  [![Download for macOS](https://img.shields.io/badge/Download-macOS-000000?logo=apple&logoColor=white)](https://github.com/unicef/adt-studio/releases/download/v0.3.0-electron/adt-studio.dmg)
  ![Platform](https://img.shields.io/badge/platform-desktop-5E3370?logo=electron&logoColor=white)
  ![OS](https://img.shields.io/badge/os-windows%2C%20macos-pink)
  [![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-green)](../LICENSE)
  [![ADT Initiative](https://img.shields.io/badge/ADT_Initiative-accessibletextbooksforall.org-1CABE2)](https://www.accessibletextbooksforall.org/)

<h2>Supported by</h2>

<p align="center">
  <a href="https://www.unicef.org/" title="UNICEF">
    <img src="https://upload.wikimedia.org/wikipedia/commons/e/ed/Logo_of_UNICEF.svg" alt="UNICEF" height="40">
  </a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://openai.com/" title="OpenAI">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/openai-dark.svg">
      <img src=".github/assets/openai-light.svg" alt="OpenAI" height="40">
    </picture>
  </a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://nees.ufal.br/" title="NEES — Núcleo de Excelência em Tecnologias Sociais">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/nees-dark.png">
      <img src=".github/assets/nees-light.png" alt="NEES" height="44">
    </picture>
  </a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
  <a href="https://www.ceibal.edu.uy/" title="Ceibal">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset=".github/assets/ceibal-dark.svg">
      <img src=".github/assets/ceibal-light.svg" alt="Ceibal" height="42">
    </picture>
  </a>
  &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
</p>

</div>



## Key features

### From PDF to structured content
- **Extracts everything** — text, figures, layout structure from any PDF.
- **AI sectioning** — labels chapters, headings, and pedagogic content automatically.
- **Smart filtering** — keeps what matters, drops what doesn't.
- **Complex figure handling** — detects and extracts multi-part figures, with multilingual support.

### Built for accessibility
- **WCAG-validated output** — accessibility checked, not just claimed.
- **Multiple render modes** — readers choose how content is displayed.
- **Context-aware alt text** — image descriptions that actually describe the image.
- **Localized text-to-speech** — natural narration in the right voice for each language.
- **Multilingual translation** — one source, many languages.

### Generated learning material
- **Comprehension quizzes** — accessible, auto-generated from chapter content.
- **Pedagogically aligned glossary** — key terms surfaced and defined.
- **Table of contents** — navigable, structured, automatic.
- **Interactive activities** — static exercises converted into web-native interactions.
- **Original-matching design** — AI rebuilds the book's visual identity, accessibly.

### Author-friendly tooling
- **Visual editor** — tweak design and content without touching code.
- **Accessibility evaluator** — flags issues before you publish.
- **Major model support** — works with the LLMs your team already uses.
- **Desktop app** — download, install, run locally. Windows and macOS.

### Ships everywhere
Export to **Web · WebPub · EPUB 3 · SCORM** — drop into any LMS, library platform, or website.

## See ADTs in action

These are live ADTs generated from real PDF source files. They span the spectrum from **fully unedited AI output** to **textbook content with hands-on curation** — pick one to get a feel for what the pipeline produces at each level of human involvement.

<table>
<tr>
<td align="center" valign="top" width="33%">

### 🇧🇹 Momo and the Leopards
Multilingual reader from Bhutan

![AI output: pure](https://img.shields.io/badge/AI_output-pure_%28no_edits%29-1CABE2)

**[Open demo →](https://unicef.github.io/adt-momo-storybook/)**

</td>
<td align="center" valign="top" width="33%">

### 🇺🇾 Queremos Participar
Informative reader from Uruguay

![AI output: lightly edited](https://img.shields.io/badge/AI_output-lightly_edited-yellowgreen)

**[Open demo →](https://unicef.github.io/adt-queremos-participar/)**

</td>
<td align="center" valign="top" width="33%">

### 🇺🇾 Cuaderno 5, Ch. 1
Grade 5 textbook with activities, Uruguay

![AI output: extensively edited](https://img.shields.io/badge/AI_output-extensively_edited-orange)

**[Open demo →](https://unicef.github.io/ADT-cuaderno5-chapter1/)**

</td>
</tr>
</table>

## About

Desktop-first application for automated book production — extract content from PDFs, process through LLM pipelines, and generate formatted output bundles.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces |
| Language | TypeScript (strict mode) |
| Backend | Hono, node-sqlite3-wasm, Zod |
| Visual QA | Playwright (Chromium) |
| Frontend | React + Vite, TanStack (Router, Query, Table, Form), Tailwind CSS |
| Desktop | Electron (electron-vite + electron-builder) |
| Testing | Vitest |

### Desktop app — additional requirements

The desktop wrapper is Electron-based and uses [electron-vite](https://electron-vite.org/) for development and [electron-builder](https://www.electron.build/) for packaging. No Rust toolchain or platform-native build tools are required for app code; electron-builder fetches the right binaries for the host OS automatically.

Code signing and notarization are optional and only needed when producing distributable installers — see [`apps/desktop/README.md`](apps/desktop/README.md) for the relevant environment variables (`AZ_TOKEN`, `APPLEID`, `APPLEIDPASS`, `APPLEIDTEAM`).

## Getting Started

### Docker (recommended)

Just [Docker](https://docs.docker.com/get-docker/) — no Node.js, no cloning.

**Option 1 — download `docker-compose.yml` from the [latest release](https://github.com/unicef/adt-studio/releases/latest):**

```bash
docker compose up          # starts on http://localhost:8080
docker compose up -d       # background
docker compose down        # stop
```

Set `PORT=9000` in a `.env` file next to `docker-compose.yml` to change the port.

**Option 2 — single command:**

```bash
docker run -p 8080:80 -v ./books:/app/books ghcr.io/unicef/adt-studio:latest
```

Open `http://localhost:8080`. Book data persists in the local `./books/` directory.

<details>
<summary>Build from source</summary>

Requires cloning the repo and [Docker](https://docs.docker.com/get-docker/).

```bash
git clone git@github.com:unicef/adt-studio.git
cd adt-studio

# Build and start (first build takes ~5 min)
docker compose up --build
```

To change the port, copy `.env.example` to `.env` and set `PORT=<your port>`.

```bash
docker compose up --build -d   # background
docker compose logs -f          # logs
docker compose down             # stop
```
</details>

<details>
<summary>Windows one-click launcher</summary>

Download [`windows-setup-and-run.bat`](https://github.com/unicef/adt-studio/releases/latest/download/windows-setup-and-run.bat) from the latest release and double-click it. The script will:

1. Check that Git and Docker Desktop are installed (with download links if missing)
2. Clone the repository (first run) or pull the latest changes
3. Build and start the Docker containers
4. Open `http://localhost:8080` in your default browser

**Prerequisites:** [Git](https://git-scm.com/download/win) and [Docker Desktop](https://www.docker.com/products/docker-desktop/).
</details>

### Local development

Prerequisites: [Node.js](https://nodejs.org/) >= 20, [pnpm](https://pnpm.io/) >= 9, and Playwright Chromium (used by visual refinement in storyboard rendering).

```bash
# Clone the repository
git clone git@github.com:unicef/adt-studio.git
cd adt-studio

# Install dependencies (first time only)
pnpm install

# Install Playwright Chromium (required for visual refinement)
pnpm exec playwright install chromium

# Start dev servers — builds automatically, opens browser
pnpm dev
```

On Linux, if Chromium system libraries are missing, run:

```bash
pnpm exec playwright install --with-deps chromium
```

The browser opens automatically at `http://localhost:5173`. The API runs at `http://localhost:3001`.
On first run, `pnpm dev` compiles all packages (~1 min). Subsequent runs are fast (incremental build).

### Running the desktop app

```bash
pnpm dev:desktop
```

This launches the Electron app via `electron-vite dev`, with HMR for the renderer (Studio SPA) and main/preload reloads for the Electron processes. The API server is started in-process by the Electron main process — there is no separate `pnpm dev` to run.

To package a distributable installer:

```bash
pnpm build:desktop                       # all-in-one
pnpm --filter @adt/desktop build:unpack  # unpacked dir, no installer
pnpm --filter @adt/desktop build:win     # Windows NSIS installer
pnpm --filter @adt/desktop build:mac     # macOS DMG
pnpm --filter @adt/desktop build:linux   # Linux AppImage
```

## Project Structure

```
adt-studio/
├── packages/                # Shared libraries (@adt/* workspace packages)
│   ├── types/               # Zod schemas — ALL types defined here
│   ├── pipeline/            # Extraction & generation — pure functions
│   ├── llm/                 # LLM client, prompts, caching, cost tracking
│   ├── pdf/                 # PDF extraction
│   └── output/              # Bundle packaging
│
├── apps/                    # Application tier
│   ├── api/                 # Hono HTTP server
│   ├── studio/              # React SPA (Vite + TanStack)
│   └── desktop/             # Electron desktop wrapper
│
├── templates/               # Layout templates
├── config/                  # Global configuration
└── docs/                    # Documentation
    ├── GUIDELINES.md        # Coding standards & patterns
    ├── DECISIONS.md         # Architecture decision records
    └── architecture.html    # Interactive architecture diagram
```

### Architecture

```
┌──────────────────────────────────────────┐
│  apps/studio (React)  │  apps/desktop    │
└────────────────┬─────────────────────────┘
                 │ HTTP only
                 ▼
┌──────────────────────────────────────────┐
│            apps/api (Hono)               │
└────────────────┬─────────────────────────┘
                 │ Direct imports
                 ▼
┌──────────────────────────────────────────┐
│  packages/pipeline │ llm │ output        │
└────────────────┬─────────────────────────┘
                 ▼
┌──────────────────────────────────────────┐
│       packages/types │ pdf               │
└──────────────────────────────────────────┘
```

Frontend apps communicate with the API over HTTP only — they never import from packages directly.

## Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start dev servers (API + Studio)
pnpm dev:desktop      # Launch the Electron desktop app (electron-vite dev, runs API in-process)
pnpm build            # Build all packages and apps
pnpm test             # Run tests
pnpm test:coverage    # Run tests with coverage
pnpm typecheck        # TypeScript strict mode check
pnpm lint             # Lint all packages
pnpm a11y:regression  # Run curated packaged-output accessibility regression (markdown)
pnpm a11y:regression:json  # Same regression with JSON output to stdout
pnpm a11y:browser-recheck  # Recheck manual-review items + contrast in Playwright
pnpm a11y:browser-recheck:json  # Same browser recheck with JSON output to stdout

# i18n
pnpm --filter @adt/studio lint     # Lint Studio only (includes lingui/no-unlocalized-strings)
pnpm --filter @adt/studio extract  # Extract strings and update .po catalogs
OPENAI_API_KEY=<key> pnpm --filter @adt/studio translate:missing                          # Auto-translate missing strings (default: gpt-4o)
OPENAI_API_KEY=<key> TRANSLATE_MODEL=openai:gpt-4o-mini pnpm --filter @adt/studio translate:missing  # Use a different model
```

## Core Principles

1. **Book-Level Storage** — All book data isolated to a single, zippable directory
2. **Entity-Level Versioning** — Never overwrite; always create new versions with rollback
3. **LLM-Level Caching** — Hash inputs for cache keys; reruns are instant if unchanged
4. **Maximum Transparency** — All LLM calls, prompts, and responses are user-inspectable
5. **Minimize Dependencies** — Flat files over databases when sufficient
6. **Pure JS/TS Over Native** — WASM over C/C++ bindings for cross-platform portability

## Accessibility Regression Tooling

ADT Studio now includes a curated packaged-output accessibility regression runner for checking **systematic** accessibility regressions in representative local books.

### Default usage

```bash
pnpm a11y:regression
```

This command:

- runs `pnpm build` first
- reads the curated allowlist from `scripts/curated-a11y-books.txt`
- packages temp copies of those local books
- runs the accessibility assessment before and after packaging
- prints a markdown summary to stdout

### JSON output

```bash
pnpm a11y:regression:json
```

Use this when you want machine-readable output for local analysis or lightweight trend tracking.

### Direct script usage

You can also run the underlying script directly for custom inputs:

```bash
pnpm exec tsx scripts/run-curated-a11y-regression.ts --format markdown
pnpm exec tsx scripts/run-curated-a11y-regression.ts --format json --out .context/curated-a11y-regression.json
pnpm exec tsx scripts/run-curated-a11y-regression.ts --book lp-18-this-is-how-my-face-glows --book unicef-ai-strategy---main-paper-and-annexures_final
pnpm exec tsx scripts/run-curated-a11y-regression.ts --book-list scripts/curated-a11y-books.txt
```

Supported options:

- `--build` — run `pnpm build` before the regression
- `--quiet-build` — suppress build output when used with `--build`
- `--format markdown|json` — choose report format
- `--out <path>` — write the report to a file instead of stdout
- `--book <label>` — run only specific local books
- `--book-list <path>` — use a different curated allowlist file
- `--books-root <path>` — override the local books directory
- `--web-assets-dir <path>` — override the packaged web assets directory

### Browser recheck for manual-review items

Use the Playwright-backed recheck when you want a second pass for JSDOM `incomplete` findings and a real-browser `color-contrast` audit:

```bash
pnpm a11y:browser-recheck
pnpm a11y:browser-recheck:json
pnpm exec tsx scripts/run-browser-a11y-recheck.ts --book lp-18-this-is-how-my-face-glows
pnpm exec tsx scripts/run-browser-a11y-recheck.ts --out .context/browser-a11y-recheck.md
```

This tool:

- packages temp copies of curated local books
- runs the existing JSDOM accessibility assessment first
- rechecks only baseline `incomplete` page/rule pairs in Playwright
- also runs full-page browser checks for `color-contrast` by default
- reports how much of the manual-review queue becomes confirmed issues, resolved checks, or a smaller residual manual-review queue

Supported options:

- `--build` — run `pnpm build` before the recheck
- `--quiet-build` — suppress build output when used with `--build`
- `--format markdown|json` — choose report format
- `--out <path>` — write the report to a file instead of stdout
- `--book <label>` — run only specific local books
- `--book-list <path>` — use a different curated allowlist file
- `--books-root <path>` — override the local books directory
- `--web-assets-dir <path>` — override the packaged web assets directory
- `--full-page-rule <id>` — add a browser-only full-page rule in addition to the default `color-contrast`

### Scope and expectations

These tools are intended as **developer tooling**, not as a guarantee that every accessibility issue in every book is fixed. They are designed to catch shared ADT Studio output regressions such as landmark, heading, image-`alt`, and browser-verifiable manual-review problems that can affect many exported ADTs.

Notes:

- They do **not** require the local Studio/API dev server to be running.
- They are heavier than a normal test pass because they rebuild and repackage books.
- `runAccessibilityAssessment` may still emit jsdom canvas warnings to stderr during local runs.
- The browser recheck requires Playwright Chromium to be installed.

## Documentation

| Document | Description |
|----------|-------------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, package graph, pipeline model, data flow |
| [docs/RELEASING.md](docs/RELEASING.md) | Release flow, branching model (develop → beta, main → stable), and how the release pipeline works |
| [docs/DEVELOPER-GUIDE.md](docs/DEVELOPER-GUIDE.md) | Hosting guide and developer extension reference for third-party teams |
| [AGENTS.md](AGENTS.md) | Project instructions for AI coding agents (Claude Code, Codex, Cursor, etc.) |
| [docs/AGENT_ROLES.md](docs/AGENT_ROLES.md) | Reference role definitions for focused agent tasks |
| [docs/GUIDELINES.md](docs/GUIDELINES.md) | Full coding standards, security, patterns |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture decision records with reasoning |
| [docs/architecture.html](docs/architecture.html) | Interactive architecture diagram (open in browser) |
| [docs/I18N_ADD_LANGUAGE.md](docs/I18N_ADD_LANGUAGE.md) | How to add a new UI language (Lingui i18n) |

## License

This project is licensed under GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`). See [LICENSE](LICENSE) for details.
Original author and copyright holder: UNICEF. See [COPYRIGHT](COPYRIGHT).
