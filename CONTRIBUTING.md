# Contributing to ADT Studio

Thanks for helping build ADT Studio. This page is the short version; each section links
to the detail.

## 1. Pick a lane

Before you start, decide which of three lanes the work belongs to. Most work is the
first one.

| Lane | When | What it needs |
|------|------|---------------|
| **Fast** | Bug fixes, chores, copy, contained UI, behaviour-preserving refactors | An issue and a PR |
| **Spec** | Changes a contract, the storage schema, or an invariant | A spec in [`docs/specs/`](docs/specs/INDEX.md), reviewed as its own PR, before implementation |
| **Experiment** | We don't know yet whether it works | A two-week time box on an `exp/` branch, ending in a written finding |

The decision list is in [docs/SPEC_DRIVEN_DEVELOPMENT.md §3](docs/SPEC_DRIVEN_DEVELOPMENT.md#3-choosing-a-lane).
When it's genuinely unclear, take the fast lane — and if the branch outgrows its issue,
stop and split it. There are issue templates for all three.

## 2. Set up

Prerequisites: [Node.js](https://nodejs.org/) >= 20, [pnpm](https://pnpm.io/) >= 9.

```bash
git clone git@github.com:unicef/adt-studio.git
cd adt-studio
pnpm install
pnpm exec playwright install chromium   # required by storyboard visual refinement
pnpm dev                                # Studio at :5173, API at :3001
```

## 3. Branch off `develop`

**Branch from `develop` and open your PR against `develop`, not `main`.** `develop`
ships beta releases and `main` ships stable ones — see [docs/RELEASING.md](docs/RELEASING.md).

**Never create a `v*` tag by hand.** Version numbers are calculated from existing tags,
so a manual tag corrupts every future release. The tag namespace is protected; only the
release automation can write to it.

## 4. Before you open the PR

```bash
pnpm typecheck   # TypeScript strict
pnpm test        # Vitest (builds first)
pnpm lint        # Studio — includes the hardcoded-string check
```

**If your change adds or alters any user-visible string in `apps/studio/`:**

```bash
pnpm --filter @adt/studio extract
```

…and commit the updated `.po` catalogs alongside the code. Every string must be wrapped
in a Lingui macro and translated to all five locales (`en`, `pt-BR`, `es`, `fr`, `sq`).
CI enforces both. See the i18n section of [AGENTS.md](AGENTS.md).

## 5. Fill in the PR template honestly

The template asks what you verified and what you did not. **"Not verified" is a valid
answer** — the reviewer decides whether it's acceptable. An unchecked box is useful
information; a checked box that isn't true is not.

Other expectations:

- **Search before opening.** Check open PRs and issues for the same change first.
- **One task, one issue, one PR.** Split the branch if it grows past its issue.
- **Behaviour bugs get a regression test.** The test should fail before your fix.
- **If you changed behaviour a doc describes, update that doc in the same PR.**
- **If you changed a standing decision, include an ADR** — the template is at the end of
  [docs/DECISIONS.md](docs/DECISIONS.md).
- **Never merge your own agent's work unreviewed.** If you prompted an agent to write
  it, you are the author, not the reviewer.

## 6. Where things live

| | |
|---|---|
| [AGENTS.md](AGENTS.md) | Project instructions, operating rules, and the context map — what to read before touching a given area |
| [docs/SPEC_DRIVEN_DEVELOPMENT.md](docs/SPEC_DRIVEN_DEVELOPMENT.md) | The full process: lanes, spec lifecycle, ADRs, invariants |
| [docs/specs/](docs/specs/INDEX.md) | Specs and their status |
| [docs/INVARIANTS.md](docs/INVARIANTS.md) | Properties that must not break, and how each is checked |
| [docs/GUIDELINES.md](docs/GUIDELINES.md) | Coding standards, security requirements, patterns and anti-patterns |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture, package graph, pipeline model |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Why the stack is what it is |

A quick orientation to the rules that catch people out: all book data lives in one
directory, entities are versioned rather than overwritten, the frontend talks to the API
over HTTP and never imports from `packages/` (except `@adt/types`), and stage/step
ordering comes only from `PIPELINE` in `packages/types/src/pipeline.ts`. The
non-negotiable list is in [AGENTS.md](AGENTS.md).

## Licence

ADT Studio is AGPL-3.0-or-later. By contributing you agree your contributions are
licensed under it. See [LICENSE](LICENSE) and [COPYRIGHT](COPYRIGHT).
