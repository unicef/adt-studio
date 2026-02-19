# ADT Studio

Desktop-first application for automated book production — extract content from PDFs, process through LLM pipelines, and generate formatted output bundles.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces |
| Language | TypeScript (strict mode) |
| Backend | Hono, node-sqlite3-wasm, Zod |
| Frontend | React + Vite, TanStack (Router, Query, Table, Form), Tailwind CSS |
| Desktop | Tauri v2 |
| Testing | Vitest |

### Desktop app — additional requirements

[Rust](https://www.rust-lang.org/tools/install) is required for the Tauri desktop wrapper.

#### Platform-specific dependencies

<details>
<summary><strong>macOS</strong></summary>

- Xcode Command Line Tools:
  ```bash
  xcode-select --install
  ```
</details>

<details>
<summary><strong>Windows</strong></summary>

- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) — install the "Desktop development with C++" workload
- [WebView2](https://developer.microsoft.com/en-us/microsoft-edge/webview2/) — pre-installed on Windows 10 (version 1803+) and Windows 11
</details>

<details>
<summary><strong>Linux</strong></summary>

- System dependencies (Debian/Ubuntu):
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
  ```
</details>

## Getting Started

### Docker (recommended)

Run ADT Studio with no local Node.js or pnpm needed — just [Docker](https://docs.docker.com/get-docker/).

```bash
# Clone the repository
git clone git@github.com:unicef/adt-studio.git
cd adt-studio

# Build and start (first build takes ~5 min)
docker compose up --build
```

Open `http://localhost:8080` in the browser. Book data persists in the local `./books/` directory.

To change the port, copy `.env.example` to `.env` and set `PORT=<your port>`.

```bash
# Run in background
docker compose up --build -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

### Local development

Prerequisites: [Node.js](https://nodejs.org/) >= 20, [pnpm](https://pnpm.io/) >= 9.

```bash
# Clone the repository
git clone git@github.com:unicef/adt-studio.git
cd adt-studio

# Install dependencies (first time only)
pnpm install

# Start dev servers — builds automatically, opens browser
pnpm dev
```

The browser opens automatically at `http://localhost:5173`. The API runs at `http://localhost:3001`.
On first run, `pnpm dev` compiles all packages (~1 min). Subsequent runs are fast (incremental build).

### Running the desktop app

With the dev servers running (`pnpm dev`), open a separate terminal:

```bash
pnpm dev:desktop
```

This launches the Tauri desktop window pointing at the Vite dev server. First run will compile the Rust backend which takes a few minutes — subsequent runs are fast.

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
│   └── desktop/             # Tauri v2 desktop wrapper
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
pnpm dev:desktop      # Launch Tauri desktop app (requires pnpm dev running)
pnpm build            # Build all packages and apps
pnpm test             # Run tests
pnpm test:coverage    # Run tests with coverage
pnpm typecheck        # TypeScript strict mode check
pnpm lint             # Lint all packages
```

## Core Principles

1. **Book-Level Storage** — All book data isolated to a single, zippable directory
2. **Entity-Level Versioning** — Never overwrite; always create new versions with rollback
3. **LLM-Level Caching** — Hash inputs for cache keys; reruns are instant if unchanged
4. **Maximum Transparency** — All LLM calls, prompts, and responses are user-inspectable
5. **Minimize Dependencies** — Flat files over databases when sufficient
6. **Pure JS/TS Over Native** — WASM over C/C++ bindings for cross-platform portability

## Documentation

| Document | Description |
|----------|-------------|
| [CLAUDE.md](CLAUDE.md) | Claude Code project configuration |
| [AGENTS.md](AGENTS.md) | Specialized agent definitions |
| [docs/GUIDELINES.md](docs/GUIDELINES.md) | Full coding standards, security, patterns |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture decision records with reasoning |
| [docs/architecture.html](docs/architecture.html) | Interactive architecture diagram (open in browser) |

## License

See [LICENSE](LICENSE) for details.
