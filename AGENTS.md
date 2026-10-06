# ADT Backlog Wizard: guide for agents

You are working on the **ADT Backlog Wizard**: a GitHub App whose code runs on a Cloudflare Worker. When a card moves on the Kanban Project (unicef #46), GitHub sends the App a webhook; the Worker comments who finished the stage, moves the assignment on, and keeps the sprint block. What it does, case by case: [docs/FLOW.md](docs/FLOW.md). How it works: [README.md](README.md).

This branch (`backlog-wizard` in unicef/adt-studio) holds **only the bot**, with its own history, like the `landing-page` branch holds the website. It is not ADT Studio's code.

## Rules

- **Never commit, print or paste a secret.** The App's private key (`*.pem`) and the webhook secret go into Cloudflare with `wrangler secret put`, read from a file, and nowhere else. `.gitignore` already excludes `*.pem` and `webhook-secret`.
- **Ask the human before** deploying, changing a Worker secret, deleting a Worker, or anything on GitHub (pushing, opening PRs, changing the App). Deploying replaces the live bot.
- **Changes reach `backlog-wizard` through PRs**, reviewed by a human. Never push to it directly, and never merge `develop` (or any other branch) into it: the histories are unrelated on purpose.
- Run `pnpm check` (type-check and tests) before any deploy or PR.

## Setup

```sh
corepack enable          # once per machine: gives the pnpm version in package.json
pnpm install
pnpm check               # type-check + the rules' tests
```

## 1. First deploy, to get the Worker's URL

The org admin needs the Worker's URL to create the App, so the Worker goes up first. Until the App exists, it answers but cannot do anything.

1. **Log in to Cloudflare**, on the account that will host the bot. Either:
   - `pnpm wrangler login`: opens a browser, so **the human has to approve it**; or
   - set `CLOUDFLARE_API_TOKEN` (a token from the *Edit Cloudflare Workers* template) and `CLOUDFLARE_ACCOUNT_ID` in the environment.

   Check with `pnpm wrangler whoami`: it names the account. Make sure it is the right one before going on.
2. `pnpm check`
3. `pnpm run deploy`. It prints the Worker's address, e.g. `https://adt-backlog-wizard.<subdomain>.workers.dev`.
4. Check it answers: `curl -s https://adt-backlog-wizard.<subdomain>.workers.dev` should print `ADT Backlog Wizard: GitHub webhooks go to POST /github.`
5. Give the human the **webhook URL**: the address plus `/github`. It goes into the App's settings ([docs/ADMIN-SETUP.md](docs/ADMIN-SETUP.md), step 1).

## 2. Once the App exists: configure the Worker

From the org admin (or as an App manager) you get the **App ID**, the App's **name** as in its URL (its *slug*), the **private key** (`.pem` file) and the **webhook secret**. Ask the human where the key and secret files are; never ask them to paste the contents into the chat.

1. **Fill in `wrangler.jsonc`** (none of these is secret):
   - `APP_ID`: the App ID;
   - `BOT_LOGIN`: already `adt-backlog-wizard[bot]`. Check it matches the App (`pnpm app info` prints `the bot is <slug>[bot]`); if GitHub gave the App another name, change it here. The bot recognises its own earlier comments by this name;
   - `PROJECTS`: the Kanban Project's node id. For unicef #46 it is already there; for another Project:
     `gh api graphql -f query='{organization(login:"unicef"){projectV2(number:46){id}}}' --jq .data.organization.projectV2.id`
2. **Store the two secrets in the Worker**:
   ```sh
   # The webhook secret, without a trailing newline (a newline makes every signature fail):
   tr -d '\n' < path/to/webhook-secret | pnpm wrangler secret put WEBHOOK_SECRET

   # The private key: GitHub gives PKCS#1, the Worker needs PKCS#8.
   openssl pkcs8 -topk8 -nocrypt -in path/to/app.private-key.pem -out /tmp/app.pkcs8.pem
   pnpm wrangler secret put APP_PRIVATE_KEY < /tmp/app.pkcs8.pem
   rm /tmp/app.pkcs8.pem
   ```
   Then tell the human to keep or delete the original `.pem` (the admin can always generate a new one).
3. `pnpm check && pnpm run deploy`, so the new `vars` are live. Open a PR to `backlog-wizard` with the `wrangler.jsonc` change, so the branch matches what runs.
4. **Verify**, as described in *Checking a deployment* below.

## 3. Automatic deploys

`.github/workflows/deploy.yml` deploys on every merged PR that touches `src/`, `wrangler.jsonc` or the dependencies. It needs, from a **repo admin**, once:

1. A Cloudflare API token: Cloudflare dashboard → *My Profile → API Tokens → Create Token* → template **Edit Cloudflare Workers**, limited to the one account. And the **Account ID** (dashboard, right side of the account's home page).
2. GitHub: *unicef/adt-studio → Settings → Environments → `backlog-wizard`* (create it if missing):
   - **Deployment branches and tags → Selected branches → `backlog-wizard`**, so no other branch can use these secrets;
   - **Environment secrets**: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Until the token is there, the deploy job skips with a notice. The Worker's own secrets (App key, webhook secret) stay in Cloudflare and never go through GitHub Actions.

## 4. Changing the bot

- **Rules and comment text**: `src/rules/` (`handoff.ts`, `blocks.ts`, `flow.ts`), with tests next to them. Update [docs/FLOW.md](docs/FLOW.md) in the same PR when behaviour changes.
- **Column names** in `src/rules/flow.ts` must match the Project's Status options exactly (case and punctuation are ignored). Rename one on the Project, rename it here.
- `pnpm check`, then a PR to `backlog-wizard`. On merge, the workflow deploys. **No change to the GitHub App is needed.**
- The App itself only changes for: a new permission or event, another repo, a new webhook URL, a new name or logo. That needs an org owner or an App manager; a new permission must also be accepted on the installation by an owner.

## Checking a deployment

```sh
export APP_ID=<app id> APP_KEY=path/to/app.private-key.pem
pnpm app info          # owner, events (must be projects_v2_item), permissions, where it is installed
pnpm app ping          # ask GitHub to resend the ping
pnpm app deliveries    # the ping should show 200: URL and secret are right
pnpm tail              # stream the Worker's logs (Ctrl-C to stop)
```

Then ask the human to move a test card on the Project from **To do → Doing**. Within seconds:
- `pnpm app deliveries` shows `projects_v2_item.edited → 202`;
- `pnpm tail` prints a line like `unicef/adt-studio#123 to-do → doing by @ana: comment=false unassign=[] assign=[ana]`;
- on the issue, the mover is assigned by `<slug>[bot]`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Delivery → **401 Bad signature** | `WEBHOOK_SECRET` differs from the App's | set it again, without a trailing newline |
| Delivery → 404 or connection error | wrong webhook URL on the App, or the Worker is not deployed | compare the App's URL with `pnpm run deploy`'s output; `curl` the address |
| Delivery → 202 `Ignored: another project` | `PROJECTS` is not the Project's node id | fix `wrangler.jsonc`, deploy |
| Delivery → 202 `Ignored: not Status or Block` | someone edited another field | expected |
| No delivery at all after a move | the App is not subscribed to **Projects v2 item** (`pnpm app info`) | the admin ticks it under *Permissions & events* |
| Log: `access_tokens: 401` | `APP_ID` and `APP_PRIVATE_KEY` do not belong to the same App | check both |
| Log: `importKey` / key format error | the key is still PKCS#1 | convert with `openssl pkcs8` (step 2) |
| Log: `403 Resource not accessible by integration` | the issue's repo is not in the installation, or a permission is missing | the admin adds the repo or the permission |
| Credits forgotten after renaming the App | `BOT_LOGIN` still has the old name | update it and deploy |

Failed deliveries are redelivered by the Worker once an hour (the last two hours), so after a fix nothing is lost if it is done within that window; older ones can be redelivered with `pnpm app redeliver <id>`.

## Maintenance

- **New private key** (rotation or leak): the admin generates one on the App's page and deletes the old one; repeat step 2's key commands.
- **Moving the Worker to another Cloudflare account**: deploy there (step 1), set the two secrets (step 2), then the App's webhook URL is changed to the new address by an owner or App manager. Delete the old Worker afterwards: `pnpm wrangler delete` while logged in to the old account.
- **A rehearsal on a test org**: copy `wrangler.jsonc` to `wrangler.test.jsonc` (ignored by git), give it another `name` and the test App's values, and use `-c wrangler.test.jsonc` on every wrangler command.
- **Stopping the bot**: suspend the App (unicef → Settings → GitHub Apps → Installed → Suspend) for an immediate, reversible stop, or delete the Worker.
