<img src="assets/avatar.png" width="120" alt="ADT Backlog Wizard: an open book in a wizard hat, waving a wand">

# ADT Backlog Wizard

A GitHub App, running on a Cloudflare Worker, that keeps the Kanban Project ([unicef #46](https://github.com/orgs/unicef/projects/46)) and the ADT Studio issues in step. When a card moves, it comments who finished the stage, moves the assignment on to whoever picks the card up, and keeps the sprint block on the issue.

- **What it does, case by case:** [docs/FLOW.md](docs/FLOW.md)
- **Setting it up on unicef (org admin):** [docs/ADMIN-SETUP.md](docs/ADMIN-SETUP.md)
- **Deploying and maintaining it (developers and agents):** [AGENTS.md](AGENTS.md)

## This branch

`backlog-wizard` holds only the bot, with its own history, the way `landing-page` holds the website. It is not part of ADT Studio's code or build. Changes come in as PRs into `backlog-wizard`; CI type-checks and tests them, and a merged PR that touches the code deploys the Worker.

## How it works

```
Card moved on #46 ──projects_v2_item webhook──▶ Worker (src/worker.ts)
                                                  │ 1. check GitHub's signature
                                                  │ 2. keep only Issue cards on #46, moved by a person
                                                  │ 3. get a 1-hour token for the App
                                                  │ 4. read the issue, its assignees, PR approvals,
                                                  │    and the bot's earlier comments (past credits)
                                                  │ 5. apply the rules (src/rules/)
                                                  ▼
                              comment / assign / unassign / Block field, as <app>[bot]
```

- **The webhook says who moved the card and from where to where**, so the bot keeps no state: past credits ("Spec done by @ana") are read back from hidden markers in its own comments.
- **It answers GitHub at once** and does the work just after (GitHub waits 10 s at most).
- **GitHub's own hiccups are retried**: a 502/503/504, a rate limit or a dropped connection is tried again up to three times. A comment is first looked for before being sent again, so it is never posted twice.
- **Once an hour** (Cloudflare cron) it redelivers deliveries that failed in the last two hours.
- **No personal token**: everything is done as the App, with its permissions, on the repos it is installed on.

| Path | What |
|---|---|
| `src/worker.ts` | the webhook handler and the hourly job |
| `src/github.ts` | signature check, App authentication, API calls |
| `src/rules/flow.ts` | the columns; their names must match the Project's Status options |
| `src/rules/handoff.ts` | who is credited, assigned and unassigned, and the comment text |
| `src/rules/blocks.ts` | the sprint block rules (Project's Block field only; issues get no label) |
| `wrangler.jsonc` | the Worker's name, schedule and settings (App ID, bot name, Project) |
| `scripts/app.mjs` | checks a deployment as the App: its setup, the webhook deliveries, a resent ping |
| `assets/avatar.png` | the Backlog Wizard icon, also the App's logo on GitHub |
| `.github/workflows/` | CI on PRs, deploy on merge |

## Commands

```sh
corepack enable && pnpm install
pnpm check             # type-check + tests
pnpm run deploy        # deploy the Worker (see AGENTS.md first)
pnpm tail              # the live Worker's logs
pnpm app info          # with APP_ID and APP_KEY set: what GitHub says about the App
```

No runtime dependencies: the Worker uses only `fetch` and Web Crypto. TypeScript, Vitest and Wrangler are development tools.

## License

AGPL-3.0, like ADT Studio.
