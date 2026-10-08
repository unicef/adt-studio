# Setting up the Backlog Wizard on unicef: for the org admin

This is what a **unicef org owner** does, once, so the Backlog Wizard can work on [Project #46](https://github.com/orgs/unicef/projects/46) and the `unicef/adt-studio` issues. It takes about 10 minutes. What the bot does is in [FLOW.md](FLOW.md); how it is built and deployed is in the [README](../README.md) and [AGENTS.md](../AGENTS.md). The code is on the `backlog-wizard` branch of unicef/adt-studio.

The same steps were rehearsed on a test org (Donesaurs) before this page was written.

> **Before sending this page, fill in:**
> - **the Worker's webhook URL**: `https://adt-backlog-wizard.<account-subdomain>.workers.dev/github`, known once the Worker is published on its Cloudflare account.

## What you are approving

The bot is a **GitHub App**: a bot identity owned by unicef, with a fixed set of permissions, installed on one repo. Our code runs on a **Cloudflare Worker**; GitHub tells it when a card moves, and it acts as the App.

```
Someone moves a card on #46
   │  GitHub sends the App's webhook (signed with a secret)
   ▼
Worker (our code, on Cloudflare)
   │  checks the signature, ignores everything but #46
   │  asks GitHub for a token for the App (valid 1 hour)
   ▼
comments / assigns / unassigns on the issue, as adt-backlog-wizard[bot]
```

No personal access token is involved: everything the bot does is done, and shown, as the App.

| The App can | The App cannot |
|---|---|
| comment on and assign **adt-studio** issues (it never adds labels) | read or change **code**: no Contents permission, so no pushes, branches, tags or releases |
| read pull requests (to see who approved) | start workflows or releases (no Actions permission) |
| read and edit **Projects** fields (to set the Block field) | touch any other unicef repo (installed on adt-studio only) |
| receive events when a card changes on an org Project | act as a person: everything shows as the bot |

**One thing to be aware of.** GitHub's Projects belong to the org, not to a repo, so the Projects permission and its event are **org-wide**: the App receives card events from **every** unicef Project, private ones included, and could read them. The Worker drops every event that is not from #46 before doing anything with it, but those events do reach the Worker's Cloudflare account. If you prefer, the App can have **Projects: Read-only** instead: the bot then never edits any Project, so it cannot fill in the Block field when work starts (people set it by hand). Everything else works the same.

## Before you start

From the developer maintaining the bot, you need:
- the **Worker's webhook URL**: `https://adt-backlog-wizard.<account-subdomain>.workers.dev/github`. The Worker is deployed first; it answers GitHub's test "ping" once the App exists;
- the **logo**: the Backlog Wizard icon, [`assets/avatar.png`](../assets/avatar.png) on the `backlog-wizard` branch (512 × 512 PNG, under GitHub's 1 MB limit).

## Step 1: create the App

**unicef → Settings → Developer settings → GitHub Apps → New GitHub App**
(https://github.com/organizations/unicef/settings/apps/new)

Fill the form top to bottom:

| Section | Field | Value |
|---|---|---|
| | **GitHub App name** | `ADT Backlog Wizard` (the bot will show as `adt-backlog-wizard[bot]`). If GitHub says the name is taken, tell the developer which one you used: the bot needs it. |
| | Description | `Comments who finished each stage when a card moves on the Kanban Project, and moves the assignment on.` |
| | **Homepage URL** | `https://github.com/orgs/unicef/projects/46` |
| Identifying and authorizing users | Callback URL | leave empty; leave the checkboxes as they are |
| Post installation | Setup URL | leave empty |
| **Webhook** | **Active** | ✅ checked (the event list below only shows when this is on) |
| | **Webhook URL** | the Worker's URL, from the developer |
| | **Secret** | leave empty for now if you use option A in step 3; otherwise a long random value (`openssl rand -hex 32`), kept to hand over |
| | SSL verification | Enable |
| **Permissions → Repository** | **Issues** | Read and write |
| | **Pull requests** | Read-only |
| | Metadata | Read-only (set automatically) |
| | everything else | No access |
| **Permissions → Organization** | **Projects** | Read and write (or Read-only, see above). This is the block further down, under *Organization permissions*, not *Repository → Projects*, which is for the old classic Projects. |
| | everything else | No access |
| Permissions → Account | all | No access |
| **Subscribe to events** | **Projects v2 item** | ✅ checked. It appears once *Organization → Projects* is set. Not "Projects v2", which is about whole Projects, not their cards. |
| | everything else | unchecked |
| **Where can this GitHub App be installed?** | | **Only on this account** (so only unicef can ever install it) |

Click **Create GitHub App**. Note the **App ID** shown at the top of the App's page (not secret).

Then, on the same page, **Display information → Upload a logo**: the Backlog Wizard icon (`assets/avatar.png` on the `backlog-wizard` branch). The logo becomes the bot's avatar on every comment and assignment, and can be changed at any time. The badge background colour can stay as it is.

**About changing the name later.** The bot recognises its own earlier comments by its name (`<name>[bot]`), to know who did each stage. Renaming it before it goes live is free; after, the developer has to update the Worker at the same time, or credits written under the old name are no longer read. The logo can change at any time.

## Step 2: install it on adt-studio only

On the App's page: **Install App → unicef → Install**, then:
- **Only select repositories → adt-studio**;
- check the permissions listed (the repo ones, and separately *organization Projects*);
- **Install**.

## Step 3: hand over the keys

The Worker needs the App's **private key** and the **webhook secret**. Choose one:

**A. Make the developer an App manager (recommended).** The keys never pass between people, and the developer can also update the name, logo and webhook URL later without you. Having access to the adt-studio repo is not enough to change an App owned by unicef: only org owners and App managers can.
1. In the App's settings, find the **App managers** section and add the developer, who must be a **member of the unicef org** (GitHub's guide: [Adding GitHub App managers in your organization](https://docs.github.com/en/organizations/managing-programmatic-access-to-your-organization/adding-and-removing-github-app-managers-in-your-organization)). An App manager can change this App's settings and keys; installing it, and accepting new permissions, still needs an owner.
2. The developer then sets the webhook secret and generates the private key themselves, and stores both in the Worker.

**B. Do it yourself and hand them over.**
1. App page → **General → Private keys → Generate a private key**. A `.pem` file downloads: it lets whoever holds it act as the App (within the permissions above). GitHub keeps no copy.
2. Send the `.pem` and the webhook secret to the developer through a password manager, never chat or email. Then delete your copy of the `.pem`.

Either way, send the **App ID** and the App's **name** (as in its URL, e.g. `adt-backlog-wizard`) by any channel: they are not secret.

## Step 4: check it works (the developer, with you)

1. App page → **Advanced → Recent Deliveries**: the `ping` shows **200**. (If it failed because the Worker was not ready, click it and **Redeliver**.)
2. Move a test issue on #46 from **To do → Doing**: within seconds the mover is assigned, by `adt-backlog-wizard[bot]`.

## Repo admin: protect the `backlog-wizard` branch (once)

The bot's code lives on the `backlog-wizard` branch of unicef/adt-studio, which "Protect main and develop" does not cover. A **repo admin** (not necessarily an org owner) sets up:

1. **A ruleset for the branch**: *unicef/adt-studio → Settings → Rules → Rulesets → New branch ruleset*:
   - name `backlog-wizard`, enforcement **Active**, target **Include by pattern: `backlog-wizard`**;
   - **Restrict deletions**, **Block force pushes**;
   - **Require a pull request before merging**, with **1 approval**;
   - **Require status checks to pass**: `check` (from *Backlog Wizard CI*).

   Merging a PR into this branch deploys the bot, so the review is the gate.
2. **The `backlog-wizard` environment**, which holds the Cloudflare secrets for automatic deploys: *Settings → Environments → `backlog-wizard`*:
   - **Deployment branches and tags → Selected branches and tags → `backlog-wizard`**, so a workflow on any other branch cannot read these secrets;
   - **Environment secrets**: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, from whoever owns the Cloudflare account ([AGENTS.md](../AGENTS.md), *Automatic deploys*).

## Later

- **Pause it:** unicef → Settings → GitHub Apps → *Installed GitHub Apps* → ADT Backlog Wizard → **Suspend**. Immediate and reversible.
- **Remove it:** uninstall the App, or delete it. Comments already written stay; #46 stays a normal Project.
- **Changing the bot's behaviour** (comment text, rules) is a code change on the `backlog-wizard` branch, reviewed in a PR and deployed by the workflow: **nothing to do here**.
- **What does need you:** a new permission or event, installing on another repo, or a new webhook URL. A new permission also has to be **accepted** on the installation (GitHub shows a banner on the installation page).
- **If the private key leaks:** App page → Private keys → generate a new one, delete the old one. The developer updates the Worker.
