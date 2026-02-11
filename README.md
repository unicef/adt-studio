# ADT Studio

Desktop-first application for automated book production — extract content from PDFs, process through LLM pipelines, and generate formatted output bundles.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces |
| Language | TypeScript (strict mode) |
| Backend | Hono, node-sqlite3-wasm, Zod |
| Frontend | React + Vite, TanStack (Router, Query, Table, Form), Tailwind CSS |
| Desktop | Tauri or Electron (TBD) |
| Testing | Vitest |

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- [pnpm](https://pnpm.io/) >= 9

## Getting Started

```bash
# Clone the repository
git clone git@github.com:unicef/adt-studio.git
cd adt-studio

# Install dependencies
pnpm install

# Build packages
pnpm build

# Start development servers (API + Studio)
pnpm dev
```

The API server runs at `http://localhost:3000` and the Studio frontend at `http://localhost:5173`.

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
│   └── desktop/             # Desktop wrapper (Tauri or Electron — TBD)
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
