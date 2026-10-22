<img src="assets/avatar.png" width="120" alt="ADT Backlog Wizard: an open book in a wizard hat, waving a wand">

# ADT Backlog Wizard

A GitHub App, running on a Cloudflare Worker, that keeps the Kanban Project ([unicef #46](https://github.com/orgs/unicef/projects/46)) and the ADT Studio issues in step. When a card moves, it comments who finished the stage, moves the assignment on to whoever picks the card up, and keeps the sprint block on the card. When a spec PR is merged, it moves the card on to To do; when a PR closes an issue, it tells the issue's story at Done.

- **What it does, case by case:** [docs/FLOW.md](docs/FLOW.md)
- **Setting it up on unicef (org admin):** [docs/ADMIN-SETUP.md](docs/ADMIN-SETUP.md)
- **Deploying and maintaining it (developers and agents):** [AGENTS.md](AGENTS.md)

## This branch

`backlog-wizard` holds only the bot, with its own history, the way `landing-page` holds the website. It is not part of ADT Studio's code or build. Changes come in as PRs into `backlog-wizard`; CI type-checks and tests them, and a merged PR that touches the code deploys the Worker.

## The board

```
Intake              Spec                                Build               Review & test             Done
Inbox → Approved → To spec → Specing → Spec review → To do → Doing → To review → Reviewing → Done
                    (wait)    (write)   (approve)      (wait)  (work)  (wait)      (work)
```

| When… | The bot… |
|---|---|
| someone pulls a card into a working column (To do → Doing) | assigns them, if nobody is on it |
| someone finishes a stage (Doing → To review) | comments **"Code done by @x"**, unassigns them |
| a finished spec goes to **Spec review** | nothing: it waits for approval, the writer stays on it |
| someone else moves it on (Spec review → To do) | comments **"Spec written by @writer, approved by @them"** with the spec PR |
| the **spec PR is merged** | moves the card to To do (within the hour), crediting the PR's author and approvers |
| a **review is requested** on the PR (or someone reviews it) | moves the card to **Reviewing** and assigns the reviewer (from Doing: "Code done by @author") |
| the reviewer **requests changes** | moves the card back to **Doing**, assigned to the PR's author |
| a **PR that closes the issue is merged** | the Project moves the card to Done; the bot credits the PR's approvers (even if the card never went through Reviewing) and posts the story |
| a card goes back for changes | reassigns whoever did that stage before |
| a card is just placed (triage: Inbox → To review) | nothing: nobody finished anything, the people on it stay |
| work starts on a card with no block | gives it the current block (the Project's Block field only) |

## How it works

```
Card moved on #46 ──projects_v2_item webhook──▶ Worker (src/worker.ts)
Review on a PR ─────pull_request(_review) webhook──▶   (finds the PR's issue cards, moves them, then same as a move)
                                                  │ 1. check GitHub's signature
                                                  │ 2. keep only Issue cards on #46, moved by a person
                                                  │    (or by the Project's automation, to Done)
                                                  │ 3. get a 1-hour token for the App
                                                  │ 4. read the issue, its assignees, PR approvals, its spec PR,
                                                  │    and the bot's earlier comments (past credits)
                                                  │ 5. apply the rules (src/rules/)
                                                  ▼
                              comment / assign / unassign / Block field, as <app>[bot]

Every hour (Cloudflare cron) ─▶ redeliver failed webhook deliveries
                              ─▶ spec PRs merged in the last 2 days: move their cards to To do
```

- **The webhook says who moved the card and from where to where**, so the bot keeps no state: past credits ("Spec written by @ana") are read back from hidden markers in its own comments.
- **It answers GitHub at once** and does the work just after (GitHub waits 10 s at most).
- **GitHub's own hiccups are retried**: a 502/503/504, a rate limit or a dropped connection is tried again up to three times. A comment is first looked for before being sent again, so it is never posted twice.
- **Issues stay clean**: blocks live in the Project's Block field, never as labels. The bot only comments and changes assignees on issues, and never touches PRs.
- **No personal token**: everything is done as the App, with its permissions, on the repos it is installed on.

| Path | What |
|---|---|
| `src/worker.ts` | the webhook handler, the spec-PR lookup and the hourly jobs |
| `src/github.ts` | signature check, App authentication, API calls (with retries) |
| `src/rules/flow.ts` | the columns; their names must match the Project's Status options |
| `src/rules/handoff.ts` | who is credited, assigned and unassigned, and the comment text |
| `src/rules/blocks.ts` | the sprint block rules (Project's Block field only) |
| `src/rules/linking.ts` | which issues a PR is about (GitHub link, branch name, `**Issue:** #N`), and whether it is a spec PR |
| `wrangler.jsonc` | the Worker's name, schedule and settings (App ID, bot name, Project) |
| `scripts/app.mjs` | checks a deployment as the App: its setup, the webhook deliveries, a resent ping |
| `assets/avatar.png` | the Backlog Wizard icon, also the App's logo on GitHub |
| `.github/workflows/` | CI on PRs, deploy on merge |

## The Project it expects

The bot reads and writes these on the Kanban Project, by name:

- **Status**: the columns above, in that order (Inbox, Approved, To spec, Specing, Spec review, To do, Doing, To review, Reviewing, Done). Renaming a column means renaming it in `src/rules/flow.ts` too.
- **Block**: an iteration field, one iteration per sprint block.
- **Workflow "Item closed" → Status: Done** (Project → ⋯ → Workflows), turned on, so a merged PR that closes its issue moves the card to Done. The bot reacts to that move; without the workflow, someone moves the card to Done by hand and the bot does the same.

Views the team uses: **Flow** (the board), **This block** (`block:@current`), **Assigned to me** (`assignee:@me`) and **Blocks** (a table grouped by Block, as on the V1 board).

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
