# How the Backlog Wizard behaves

When you move a card on the Kanban Project, the bot (`adt-backlog-wizard[bot]`) updates the issue: it comments when a stage is finished, and it moves the assignment on to whoever works on the card next. **An assignee always means "working on it right now"**, and the issue keeps the history of who did what.

This page lists every case. The rules are in [`src/rules/handoff.ts`](../src/rules/handoff.ts) and [`src/rules/blocks.ts`](../src/rules/blocks.ts), with tests next to them.

## The board

```
Intake              Spec                                Build               Review & test             Done
Inbox → Approved → To spec → Specing → Spec review → To do → Doing → To review → Reviewing → Done
                    (wait)    (write)   (approve)      (wait)  (work)  (wait)      (work)
```

Each stage has a column where the card **waits** (To spec, To do, To review) and a column where someone is **working on it** (Specing, Doing, Reviewing). Spec has one more lane, **Spec review**: the finished spec waits there for its approval, so everyone can see which specs need approving. The people on a card do not change in Spec review.

## The short version

| You… | The bot… |
|---|---|
| **pull** a card into a working column (To do → Doing) | assigns **you**, if nobody is on it yet |
| **finish** a stage (Doing → To review) | comments **"Code done by @you"** and unassigns you |
| send a card **back** for changes (Reviewing → Doing) | assigns **whoever did that stage before**, no comment |
| move a finished spec to **Spec review** (Specing → Spec review) | nothing: the spec waits for approval, and you stay on it |
| move an approved spec on (Spec review → To do), and you are **not** its writer | comments **"Spec written by @writer, approved by @you"** with the spec PR, and unassigns the writer |
| *(the spec PR is merged)* | moves the card to **To do** within the hour, crediting the PR's author and approvers |
| *(a PR that closes the issue is merged)* | the Project moves the card to **Done**; the bot adds the story and credits the PR's approvers |
| move a card to **Done** | comments with the whole story: *Spec @a (approved by @b) · Code @c · Review & test @d* |
| move a card between waiting columns, or place it (Inbox → To review) | nothing: no comment, the people on it stay |

## Every case

### When the bot comments

The bot comments **only when a stage is finished**, or when a card reaches Done. That is about three or four comments in an issue's whole life.

| Move | Comment |
|---|---|
| Spec review → To do, by someone other than the writer | **Spec written by @a, approved by @mover**, then *Spec PR: #N* |
| Spec review (or Specing) → To do, by the writer | **Spec written by @a** (nobody approves their own spec) |
| a merged spec PR moves the card to To do | **Spec written by @author, approved by @approvers**, moved … when spec PR #N was merged. |
| Doing → To review (or further) | **Code done by @x**, moved from Doing to To review by @mover. |
| Reviewing → Done | **Reviewed and tested by @x**, moved from Reviewing to Done by @mover (or without "by", when the Project moved it because the issue was closed). Then: *Finished. Spec @a (approved by @b) · Code @c · Review & test @d* |
| any other column → Done | *Finished. Spec @a · Code @b…* (the story so far), if any stage was credited |

**No comment** for:
- pulling a card into a working column (To do → Doing): it only assigns;
- moves between waiting columns (Approved → To spec, To do → To review…);
- moving a finished spec into Spec review, or back from it to Specing;
- moving a card back (Reviewing → Doing, To review → To do…);
- moves in the Inbox and Approved;
- dropping a card in the column it was already in.

### Who gets the credit for a stage

When a card leaves a working column going forward, the credit goes to:

1. **for Review & test**: whoever **approved a pull request** linked to close the issue (any approval, on any such PR, open or closed), if anyone did;
2. otherwise, **whoever is assigned** when the card leaves the column;
3. if nobody is assigned, **whoever moved the card**.

So assign yourself while you work, or the credit goes to whoever moves the card on.

**Specs** credit two people: the **writer** (whoever is on the card, or else the spec PR's author) and the **approver**: whoever moves the card out of Spec review, unless that is the writer; when the spec PR's merge moves the card, its approving reviewers. The spec PR is the one that references the issue (GitHub's link, "Closes #N" or `**Issue:** #N`) and adds a `docs/specs/SPEC-….md` file; one linked only by its branch name is not found for a manual move, so that comment has no PR link.

### When the bot assigns and unassigns

| The card moves into… | Who is on it afterwards |
|---|---|
| a **working** column, going forward (To do → Doing) | whoever was already assigned; if nobody, **whoever moved it** |
| a **working** column, skipping the queue (Doing → Reviewing) | **whoever moved it**: the previous stage's people are credited and unassigned |
| a **working** column, going back (Reviewing → Doing) | **whoever did that stage before** (from the bot's earlier comment); if nobody was credited, whoever was assigned, or else whoever moved it |
| **Spec review** (or back from it to Specing) | **unchanged**: the writer stays on it while it waits |
| a **waiting** column, after **finishing** a stage (Doing → To review), **pausing** (Doing → To do) or **sending back** (Reviewing → To review) | **nobody**: everyone is unassigned |
| a **waiting** column from the Inbox, Approved or another waiting column (triage, catching the board up: Inbox → To review) | **unchanged**: nobody finished anything, so nobody is taken off |
| **Done** | **nobody**: everyone is unassigned |

"Going forward" and "going back" follow the board's order, left to right.

A few consequences worth knowing:
- **Pausing** a card (Doing → To do) unassigns you, without a comment. Pull it back into Doing to pick it up again.
- **Done unassigns everyone.** Who did the work stays in the story comment, not in the assignees.
- Assigning yourself by hand still works: the bot keeps whoever is already assigned when the card enters a working column.

### Blocks (sprints)

The Project's **Block** field says which block a card's work is planned in. It lives **on the Project only**, the way the V1 board kept its Iteration: the issue itself gets no label and does not change. To see a block's work, use the Project's views and filters (`block:@current`, `block:B3`, `no:block`, or a view grouped by Block).

| When… | The bot… |
|---|---|
| work **starts** (a card enters Specing, Doing or Reviewing going forward) and the card has **no block** | gives it the **current** block |
| the card already has a block (planned ahead, e.g. B3) | leaves it alone, even if work starts early |
| the card goes back to the **Inbox** | clears its block |
| someone sets or clears the **Block field** by hand | leaves it: that is planning |
| a block ends with the card still open | keeps it: the card shows as carried over (a block in the past) |

**Approving does not set a block.** Approve now, plan for B3 later.

### When a PR is reviewed

The review usually happens on the pull request, so the board follows it. The bot finds the PR's issues the same way as for merges (GitHub's link, "Closes #N", `**Issue:** #N`, the branch name) and moves their cards:

| On the PR | The card | Who is on it | Comment |
|---|---|---|---|
| a **review is requested** from someone (card in To review, or still in Doing) | → **Reviewing** | the reviewer | from Doing: **"Code done by @author"**, moved … when @reviewer was asked to review PR #N |
| someone **reviews** it without being asked (comment or approval) | → **Reviewing** | the reviewer | as above |
| another reviewer joins a card already in Reviewing | stays | the new reviewer is added | none |
| the reviewer **requests changes** | → **Doing** | the PR's author | none (a send-back) |
| **approved and merged** (the PR closes the issue) | → **Done**, by the Project | nobody | **"Reviewed and tested by @approver"** and the story, even if the card never went through Reviewing |

Draft PRs are left alone until they are ready for review; a review requested from a team (not a person) moves the card without an assignee. The author reviewing or commenting on their own PR does nothing.

### When PRs are merged

| Merged | What happens | How |
|---|---|---|
| a **spec PR** linked to the issue (GitHub link, "Closes #N", `**Issue:** #N`, or a branch like `spec/890-…`) | if the card is still in To spec, Specing or Spec review, it moves to **To do**, with "Spec written by @author, approved by @approvers" | the bot checks merged PRs **once an hour** |
| a **code PR** that closes the issue | the issue closes, the card moves to **Done**, and the bot posts the story | the Project's built-in **Item closed** workflow moves the card; the bot reacts to that move |

A card already at To do or further is left alone, so nothing happens twice.

## What the bot does not do

- It **only moves a card in one case**: a merged spec PR moves its card to To do. It never closes issues or touches pull requests.
- It acts only on **issues** on the Kanban Project. Pull requests and draft items on the board are ignored.
- It ignores every other Project in the org, and every repo it is not installed on.
- It ignores its own changes (the Block field it sets, a merged spec's move), so it never loops. Other bots are ignored too, except the Project's own automation moving a card to Done.
- It does not undo what people do by hand. Fix an assignee or delete a comment, and the bot leaves it.

## When something looks wrong

- **Wrong person credited?** The credit follows the assignee when the card left the stage. Edit or delete the bot's comment: the bot only reads its own comments to know who did a stage, so a deleted comment is a forgotten credit.
- **Nothing happened after a move?** It usually takes a second or two. If it never comes, the delivery failed; the bot retries failed deliveries once an hour. See the README for where to look.
- **Two moves within a second** on the same card can both read the issue before either writes. Rare; check the issue and fix by hand if needed.
