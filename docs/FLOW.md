# How the Backlog Wizard behaves

When you move a card on the Kanban Project, the bot (`adt-backlog-wizard[bot]`) updates the issue: it comments when a stage is finished, and it moves the assignment on to whoever works on the card next. **An assignee always means "working on it right now"**, and the issue keeps the history of who did what.

This page lists every case. The rules are in [`src/rules/handoff.ts`](../src/rules/handoff.ts) and [`src/rules/blocks.ts`](../src/rules/blocks.ts), with tests next to them.

## The board

```
Intake              Spec                  Build               Review & test             Done
Inbox → Approved → To spec → Specing → To do → Doing → To review → Reviewing → Done
                    (wait)    (work)    (wait)  (work)  (wait)      (work)
```

Each stage has a column where the card **waits** (To spec, To do, To review) and a column where someone is **working on it** (Specing, Doing, Reviewing). Only the working columns have people on them.

## The short version

| You… | The bot… |
|---|---|
| **pull** a card into a working column (To do → Doing) | assigns **you**, if nobody is on it yet |
| **finish** a stage (Doing → To review) | comments **"Code done by @you"** and unassigns you |
| send a card **back** for changes (Reviewing → Doing) | assigns **whoever did that stage before**, no comment |
| move a card to **Done** | comments with the whole story: *Spec @a · Code @b · Review & test @c* |
| move a card between waiting columns | unassigns anyone on it, no comment |

## Every case

### When the bot comments

The bot comments **only when a stage is finished**, or when a card reaches Done. That is about three or four comments in an issue's whole life.

| Move | Comment |
|---|---|
| Specing → To do (or further) | **Spec done by @x**, moved from Specing to To do by @mover. |
| Doing → To review (or further) | **Code done by @x**, moved from Doing to To review by @mover. |
| Reviewing → Done | **Reviewed and tested by @x**, moved from Reviewing to Done by @mover. Then: *Finished. Spec @a · Code @b · Review & test @c* |
| any other column → Done | *Finished. Spec @a · Code @b…* (the story so far), if any stage was credited |

**No comment** for:
- pulling a card into a working column (To do → Doing): it only assigns;
- moves between waiting columns (Approved → To spec, To do → To review…);
- moving a card back (Reviewing → Doing, To review → To do…);
- moves in the Inbox and Approved;
- dropping a card in the column it was already in.

### Who gets the credit for a stage

When a card leaves a working column going forward, the credit goes to:

1. **for Review & test**: whoever **approved a pull request** linked to close the issue (any approval, on any such PR, open or closed), if anyone did;
2. otherwise, **whoever is assigned** when the card leaves the column;
3. if nobody is assigned, **whoever moved the card**.

So assign yourself while you work, or the credit goes to whoever moves the card on.

### When the bot assigns and unassigns

| The card moves into… | Who is on it afterwards |
|---|---|
| a **working** column, going forward (To do → Doing) | whoever was already assigned; if nobody, **whoever moved it** |
| a **working** column, skipping the queue (Doing → Reviewing) | **whoever moved it**: the previous stage's people are credited and unassigned |
| a **working** column, going back (Reviewing → Doing) | **whoever did that stage before** (from the bot's earlier comment); if nobody was credited, whoever was assigned, or else whoever moved it |
| a **waiting** column, the Inbox, Approved or Done | **nobody**: everyone is unassigned |

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

## What the bot does not do

- It **never moves cards**, closes issues or touches pull requests.
- It acts only on **issues** on the Kanban Project. Pull requests and draft items on the board are ignored.
- It ignores every other Project in the org, and every repo it is not installed on.
- It ignores its own changes (the Block field it sets), so it never loops.
- It does not undo what people do by hand. Fix an assignee or delete a comment, and the bot leaves it.

## When something looks wrong

- **Wrong person credited?** The credit follows the assignee when the card left the stage. Edit or delete the bot's comment: the bot only reads its own comments to know who did a stage, so a deleted comment is a forgotten credit.
- **Nothing happened after a move?** It usually takes a second or two. If it never comes, the delivery failed; the bot retries failed deliveries once an hour. See the README for where to look.
- **Two moves within a second** on the same card can both read the issue before either writes. Rare; check the issue and fix by hand if needed.
