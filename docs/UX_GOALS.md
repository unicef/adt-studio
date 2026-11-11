# UX Goals

What the person using ADT Studio must always get, whatever else a change is doing.

Read this before any change that touches a stage run, a status or read endpoint, saving,
preview, export, or anything the user sees. It applies in every lane (fast, spec,
experiment) and to agent sessions as much as to people. A session implementing a spec
loads this file alongside the spec.

## Why this document exists

The stability work of recent months made books much safer. Freshness tracking
(SPEC-0001), manual-edit preservation (SPEC-0002) and the Sectioning lifecycle work
(SPEC-0003, [#884][pr884]) mean edits survive reruns, history is kept and out-of-date
output is visible. That work is valued and continues.

Reviews of the same changes kept finding a second kind of problem. The safeguard was
correct, but the product became slower, more blocked or noisier because of where the
safeguard was placed: a check on a path the user polls, a rule applied to the whole book
instead of one page, a warning shown to everyone instead of the person who needs it.
Each case was found by hand in review, some after merge. The specs said what must be
protected. Nothing said what the user must not be made to pay for that protection.
This document is that second half.

The [six core principles](../AGENTS.md) say what must never be lost. The goals below say
what using the product must stay like while we protect it. A change that passes its
acceptance criteria and breaks one of these goals is not finished.

When a goal and a safeguard seem to conflict, the answer is almost always a different
place for the safeguard ([section 3](#3-where-a-safeguard-belongs)), not a slower or
more restricted product. When no placement satisfies both, stop and bring the trade-off
to the product owner before building it ([section 7](#7-stop-and-ask)).

## 1. The 20 goals at a glance

| # | Goal | Watch for |
|---|------|-----------|
| | **Speed and cost** | |
| 1 | Each stage finishes as fast and as cheaply as it can, with quality preserved. | A stage, save, preview or export that takes longer, or makes more provider calls, than before the change. |
| 2 | Reading is cheap. Opening a book, switching stage or page, and polling status do no whole-book work, read no media, write nothing and take no lock. | New work on a `GET` or polled endpoint that grows with the size of the book. |
| 3 | Verify once, where the data is written, and record the result. Later readers check the record. | Files re-read or re-hashed when their ID or hash is already recorded. Proofs recomputed on every request. |
| 4 | Do only the work that changed. | Unchanged pages or items re-rendered, re-versioned or billed again. A cosmetic save that resets another stage. |
| 5 | The app stays responsive during long work. | Long synchronous work on the API event loop. Other screens freezing during a run or an export. |
| 6 | Low-power machines and slow connections are the normal case. | Multi-megabyte responses, repeated refetching, memory that grows with the book. |
| | **Feedback and progress** | |
| 7 | Every action is acknowledged at once. | A click with no visible change. A request that replies only when the work is finished. |
| 8 | Results appear as they are produced: page by page, item by item. | Output held back until the whole batch finishes. |
| 9 | Progress and status are truthful. | "Done" or a green step when output is missing or a provider failed. Counts that differ between screens. |
| 10 | Finished work is kept. | Cancel, skip or one failure discarding pages that had already succeeded. |
| | **Freedom and flow** | |
| 11 | Users can queue stages ahead and keep working while something runs. | Run buttons disabled by background refreshes. A first click that is lost. |
| 12 | A problem stays local. | One bad page, damaged record or duplicate ID blocking the rest of the book or other stages. |
| 13 | Existing books keep working after an upgrade. | A book from the previous release that needs a rerun, a manual step or an AI call before it opens, renders, previews or exports. |
| 14 | Warn rather than block. A setting is a preference for future generation, not a rule about saved content. | New gates on run, preview or export. Saved content treated as invalid because a setting changed. |
| 15 | No dead ends. | Raw error codes, a 500 for an expected refusal, a refusal with no next step, a book left locked after a crash. |
| | **Reliability** | |
| 16 | Routine failures are handled for the user. | A provider call with no retry or timeout. A run that ends with many items missing and no cause recorded. |
| 17 | Confirmation is asked only when something would be lost, once, in plain words. | Dialogs on ordinary runs. Consent logic that delays or disables normal actions. |
| | **Calm interface** | |
| 18 | Every new visible element earns its place. | A panel, banner or badge shown on every book for a rare case. Warnings before a stage has ever run. |
| 19 | The interface speaks the user's language. | Internal terms in UI text (hash, lease, witness, checkpoint, identity). Strings missing from a locale. |
| 20 | The smallest change that solves the reported problem. | Protection wider than the bug that prompted it. A branch that grows well past its issue. |

## 2. Budgets

Numbers make the goals checkable. "Set" means the product owner has already stated the
number in the linked review. "Proposed" is a default until triage agrees a figure.

| What the user does | Budget | Status |
|---|---|---|
| Clicks any button | A visible change at once (about 0.2 s): a busy, queued or "Starting…" state | Proposed |
| Waits more than about 1 s for anything | Sees that it is working. Past about 10 s, sees a count and can cancel | Proposed |
| Opens a book, switches stage or page | No slower than `develop`, and no work that grows with the whole book | Rule from [#996][i996]; figure to be set at triage |
| Leaves a screen polling status | The endpoint reads a recorded result and never runs whole-bundle or whole-book verification | Set in [#884][884-export] |
| Uses any other screen during a run, preview, validation or export | Requests answer in under 1 s | Set in [#884][884-export], [#1086][i1086] |
| Starts export preparation | Reply in under 1 s, then progress such as "page 34 of 102" | Set in [#1086][i1086] |
| Downloads a prepared export | About 2 s on the 102-page reference book | Set in [#884][884-export] |
| Runs Storyboard | A finished page can be opened within seconds, while other pages are still running | Set in [#884][884-oct12] |
| Runs any stage | No slower and no more provider calls than `develop` for the same book and settings, unless the product owner agreed to the cost | Proposed |

**Reference books.** Until the acceptance set is agreed (SPEC-0005), measure on three
books:

- a book of 100 or more pages with Storyboard, quizzes, glossary, captions, Easy Read
  and speech. The one used in [#884][884-export] and [#1086][i1086] has 102 pages and
  a web bundle of 4,382 files (459 MB);
- a small multilingual book of about 14 pages, as in [#996][i996];
- a book made with the previous release and not touched since.

## 3. Where a safeguard belongs

Most of the regressions behind this document came from a correct safeguard in the wrong
place. Three questions decide the place.

**When does it run?** In order of preference:

1. When the data is written, inside the code that creates it. The user never sees it.
2. Once, when a result is published. Store the outcome next to the result, together
   with the build or version it applies to, so later readers check the stored outcome.
3. On an explicit action whose purpose is checking: restore, repair, or
   `pnpm pipeline doctor`.
4. In the background, off the request path, with progress shown, when it genuinely has
   to be repeated.
5. Never on a polled status read, on opening a book, on a download, or for the whole
   book on every save.

**How much does it cover?** Item, then page, then stage, then book. Use the smallest
unit that contains the problem.

**How loudly does it speak?** Record it silently, then an inline indicator, then a
warning with an action, then one confirmation, then a block. Use the lowest level that
prevents the loss. Blocking is for the case where continuing would destroy or corrupt
the user's work and a warning could not prevent it.

Two worked examples:

- **Package verification ([#884][884-export]).** The aim was right: a download must
  contain every file its format needs. The check was placed on the polled status
  endpoint and again on the download. On the 102-page reference book the cold check
  took 137 s, one status reply took 2,001 s, Preview and Validation never finished, and
  the download went from 2 s to about 4 min. Placed at step 2 instead, the bundle is
  verified once when it is built, the result is stored with the bundle's build identity,
  and status and download read that result. The protection is the same and the user
  pays nothing for it.
- **Media hashing ([#879][879-note1]).** Generated audio and translated images are
  stored under a name that contains their hash and are never overwritten. Status reads
  were re-reading those files, about 281 MB and 1.5 s per request on a 120-page
  fixture. A recorded hash plus an existence check gives the same answer for everything
  ADT writes itself. Bytes are still verified at write time and on restore, where it
  happens once.

## 4. The goals in detail

### 4.1 Speed and cost (goals 1 to 6)

**The goal.** Each stage completes in as little time and at as low a provider cost as it
can, with quality preserved. Quality is the constraint. Time and cost are what we
minimise. Export is the clearest case: once a package is prepared, handing it to the
user is a file download and should take about as long as one.

**What to do.**

- Measure first. If a change touches a run, a read, a save, preview or export, time it
  on the reference books before and after, and put both numbers in the PR. A regression
  the author finds costs minutes. One found in review costs days.
- Treat work that grows with the book on a read path as a defect. Status, page and
  stage reads are called on open, on window focus, on progress events and by polling.
  The API is one process with one event loop, so a slow read also stalls the pipeline
  and every other screen.
- Verify once and record the result, as in section 3.
- Identify by ID or recorded hash. Check that a file exists; do not re-read it to learn
  what its name already says.
- Unchanged inputs produce nothing: no provider call, no new version, no changed
  output. This is core principle 3 seen from the user's side.
- Keep heavy work off the request path: a worker, a child process, or at least yielding
  between pages. Reply to the request immediately and report progress through the
  existing task and SSE events.
- Look for the economical route to the same guarantee. Before adding a check that costs
  seconds, look for the recorded fact that answers the same question in milliseconds.

**Seen before.**

- Export download from 2 s to about 4 min, and a frozen API, from per-request package
  verification ([#884][884-export]).
- Status reads re-hashing media; the packaging cache key reading every byte under
  `images/` and `audio/` on each status request and twice per export
  ([#879 Note 1][879-note1]). Removed in the next round.
- Stage loading after SPEC-0001: the requests behind Languages and Speech went from
  199 ms to 2,313 ms in a handler burst, and `GET /outputs` returned 3.9 MB
  ([#996][i996], [#997][i997]). The full output read also ran on book open, on most
  saves and on every window refocus ([#879 Note 2][879-note2], item 9).
- A style-only Storyboard save reset Quiz, Glossary and TOC ([#879 Note 3][879-note3]).
- Not caused by the spec work, and still part of this goal: `prepare-export` blocks the
  API for 203 s on `develop` ([#1086][i1086]), and a Storyboard rerun after splitting
  one page took over 3 min and changed three untouched pages ([#1085][i1085]).

### 4.2 Immediate feedback and progressive results (goals 7 to 10)

**The goal.** The user always knows the app heard them, sees results as soon as they
exist, and can trust what the screen says.

**What to do.**

- A click changes something visible at once. Use the optimistic update in `queueRun`
  rather than waiting for the server ([Stage Run Queue](GUIDELINES.md#stage-run-queue)).
- Publish each page or item when it succeeds, in its own transaction, and emit the event
  that makes Studio show it. The one agreed exception is a switch between fixed and
  reflowable layout, which publishes only when every page succeeds so a book never mixes
  layouts.
- Test this the way a user meets it: open a finished page while another is still
  running. A moving progress counter does not prove the page is readable.
- Say what is happening: which step, how many of how many, which item failed and why
  ([Progress Reporting & SSE](GUIDELINES.md#progress-reporting--sse)).
- Show "done" only when the output exists. A partial render is usable but incomplete,
  and the status says so. A provider failure is never a green step.
- Cancel, skip and failure keep everything that had already succeeded.

**Seen before.**

- Storyboard results were held in memory until the whole run finished. In a five-page
  run, page 7 was ready about four seconds in and could not be opened for 3 min 34 s
  ([#884, 12 October][884-oct12], finding R5). The backend now publishes per page. A
  remaining Studio race could still leave a finished page showing as not rendered
  ([#884, 7 November][884-nov7], NOV-R1).
- Choosing Skip on one failed page discarded the page that had succeeded
  ([#884, 30 September][884-sep30]).
- Rendering one section of a page marked the whole book ready
  ([#884, 12 October][884-oct12], R1). Speech preparation turned a revoked key or quota
  error into a green step ([#879 Note 4][879-note4], item 10).
- "Update all" had no busy state until one was added ([#879 Note 2][879-note2]).

### 4.3 Queueing and working while things run (goal 11)

**The goal.** The user sets up the next steps and walks away, or keeps reviewing while
the pipeline runs. They are never made to wait for one stage to finish before they are
allowed to ask for the next.

**What to do.**

- Every run goes through `queueRun` from `useBookRun()`: optimistic "queued" state,
  click order preserved, data cleared only when the job starts.
- The run button of a later stage stays enabled while an earlier stage runs. Background
  polling and progress events never disable it and never cancel a request that a click
  started.
- The first click queues the run, exactly once.
- A safeguard that needs fresh data, such as the saved-content check before protected
  work is replaced, fetches it as part of the click. It does not sit in front of the
  button waiting on a background refresh.
- During a run the user can still navigate, read and review finished pages, and open
  other books.

**Seen before.** After a consent check was added to the stage run entry points, Run
Sectioning stayed disabled during background status fetches while Extract ran, and the
first click could be lost because an Extract progress event cancelled its request
([#1071][i1071], fix in [#1072][pr1072]).

### 4.4 Routine failures (goals 15 and 16)

**The goal.** A failure the user meets regularly is a product defect, even when its
cause is outside our code. Networks drop, providers time out and laptops are force-quit.
The product absorbs these.

**What to do.**

- Retry transient network and provider errors (dropped connections, 5xx, 429) with
  backoff. Give every request a timeout so a hung call does not hold a slot. Log the
  cause (`err.cause`) so the next occurrence can be diagnosed. Use one shared policy for
  all providers.
- Report the outcome honestly: how many of how many succeeded, the rest listed with the
  reason, and a retry that covers only those.
- One item failing does not fail or roll back the others.
- An expected refusal is a 4xx with a plain, translated message and a next step. It is
  never a 500, a raw code or an instruction to use a terminal.
- A crash, force-quit or restart never leaves a book locked or impossible to delete.
  When a lock's owner cannot be shown to be alive, the app recovers or offers a release
  action.
- A change keeps the existing provider combinations working: Gemini only, no OpenAI
  key, page batching.

**Seen before.**

- An OpenAI speech run lost 794 of 3,111 items (25.5%) to `fetch failed`. That path has
  no retry, no timeout and discards the cause. The investigation ruled out the recent
  spec work; the trigger was outside the app. That is the point of this goal: resilience
  is what makes an outside fault invisible to the user ([#1067][i1067], fix in
  [#1069][pr1069]).
- Speech failed outright for page batching with a Gemini voice and no OpenAI key after a
  key check was dropped. Cancelling during Word Highlighting left that run's audio
  unpublished ([#879 Note 4][879-note4], items 6 and 7).
- After a force-quit, a stale `.db.lock` made every open of the book fail until someone
  removed it by hand, and a stale writer lease made the book impossible to delete from
  the UI ([#879 Note 4][879-note4], items 2 and 3).
- Re-running Extract on a book with pages returned "Internal server error"
  ([#879 Note 4][879-note4], item 4).

### 4.5 A calm interface (goals 17 to 19)

**The goal.** The screen shows what the user needs for the task in front of them and
nothing else. Adding an element to the screen is a design decision, not a side effect of
adding a capability.

**What to do.** Before adding anything visible, answer four questions in the issue or
spec: who needs it and how often, what they do with it, where they would look for it,
and what everyone else sees.

- A tool for a rare case lives where rare tools live, such as Book settings, and the
  error that needs it links to it.
- An optional stage shows no "missing" or warning state before its first run.
- Size matches importance: a small pill for a state, one attention panel instead of
  several lists, one count that is the same on every screen.
- Ask for confirmation only when the user's work would be replaced or lost. Name what
  will be lost, default to the safe choice and ask once. Ordinary runs show no dialogs.
- Write the text in the user's terms: what happened and what they can do. Internal
  vocabulary stays out of the UI. Every string exists in all five locales.
- Propose new UI before building it. Describe or sketch it in the spec or issue, get the
  product owner's agreement, and attach a screenshot to the PR.

**Seen before.**

- The History recovery panel was added to the Sectioning landing page and appeared on
  every book with extracted pages, healthy or not, with text such as "Only verified
  original bytes can be restored". It is a rarely needed repair tool for the whole book.
  It now lives in Book settings, and the errors it can resolve carry an "Inspect
  history" link ([#884][884-history], follow-up [#1083][i1083]).
- Large yellow "Audio Missing" warnings appeared on every text item before Speech had
  run. Manual edits were shown as dominant yellow cards with regenerate buttons. Both
  became compact indicators inside one attention panel ([#879, 11 October][879-oct11]).
- One changed word flagged Quiz and Glossary, and a paid rerun was the only way to
  clear the flag, until "Keep existing content" was added ([#879 Note 4][879-note4],
  item 1).
- Accepting an older book's speech meant 4,182 requests over 26 to 30 minutes. It was
  replaced by accepting existing content as the baseline when the book is opened
  ([#879 Note 7][879-note7], A1).
- New lifecycle errors reached the user in English only ([#884, 12 October][884-oct12],
  R4).

### 4.6 Existing books and local problems (goals 12 to 14, and 20)

**The goal.** Upgrading never costs the user their books, and one problem never takes
the whole book down with it.

**What to do.**

- A book made with the previous release opens, renders, previews and exports with no
  extra step, no AI call and no content change. Test with a real older book, not a
  fixture produced by the new code.
- Missing new metadata means "unknown". It is informational and never blocks.
- A setting controls how new content is generated. It does not make saved content
  invalid.
- A problem on one page or item is reported for that page or item. The rest of the book
  still runs, previews and exports.
- Validate where content is created. Reading, saving an unrelated page and exporting do
  not re-examine old content.
- When content genuinely cannot be included, keep the data and say so in a visible
  disclosure.
- Size the protection to the reported problem. A wider risk found along the way is
  worth an issue and a conversation before it becomes code in the same branch.

**Seen before.**

- The reported bug was Sectioning accepting several sections for one page in By Page
  mode, and it was fixed where sections are generated. The rule was then extended to
  saved content: Storyboard refused to run when any page had other than one section, so
  one intentional split blocked unrelated pages, and unchanged older books were refused
  with no way forward. The decision since: By Page is a generation setting
  ([#884, 30 September][884-sep30], [#884, 12 October][884-oct12]).
- A new section-ownership rule removed every fixed-layout book rendered on `develop`
  from Preview and export. The tests did not catch it because their fixtures were built
  with the new stamp ([#879 Note 2][879-note2], item 1).
- One older section with a repeated generated ID made every save in the book fail
  ([#879 Note 2][879-note2], item 5). `GET /glossary` took the writer lock on older
  books, so the glossary disappeared while a run was active ([#879 Note 4][879-note4],
  item 8).

## 5. How product and development work together

Two kinds of knowledge meet in every change. The developer knows what can go wrong with
the data. The product owner knows what the person using the app is trying to do and
what they will put up with. Problems arise when one side decides for the other: a
safeguard chosen without its cost to the user, or a shortcut chosen without its risk to
the data.

1. **Propose a safeguard together with its cost.** What gets slower, what is newly
   blocked or asked, what new UI appears, what happens to existing books. One paragraph,
   with numbers where there are any.
2. **The product owner decides the trade and writes it down.** A decision made in a
   review comment is amended into the spec before more code builds on it
   ([amending an approved spec](SPEC_DRIVEN_DEVELOPMENT.md#amending-an-approved-spec)).
3. **The spec carries it.** A spec that changes what the user sees, or touches a run,
   read, save, preview or export path, has a short "UX impact" section and at least one
   acceptance criterion per affected goal. For example: "AC-n: downloading a prepared
   export of the reference book takes about 2 s", or "AC-n: a finished page can be
   opened while another page is still rendering".
4. **The PR declares it.** Paste the block from section 6 under Verification.
5. **Slices stay reviewable.** The review budget is about 1,000 changed lines
   ([reviews and merging](SPEC_DRIVEN_DEVELOPMENT.md#9-reviews-and-merging)). A change
   to what the user experiences is visible in a slice that size and easy to miss in a
   branch of two hundred files.
6. **Testing on real books is shared work.** The author says which book and which steps
   to try and what should feel different. The product owner tries it on the reference
   books.

## 6. Before you open the PR

Copy this into the PR body under Verification. Leave a line in place and write "n/a"
when it does not apply.

```markdown
### UX impact

Paths touched (run / read / save / preview / export / UI):
Before and after on the reference books (time, provider calls, response size):
New blocks, refusals or confirmations, and the loss each one prevents:
New visible UI (elements, warnings, strings), with screenshot:
Existing-book check (book from the previous release opens, renders, previews, exports):

- [ ] No read, polled or download path does work that grows with the size of the book
- [ ] Nothing is re-read or re-hashed that a recorded ID or hash already identifies
- [ ] Unchanged inputs cause no provider call, no new version and no changed output
- [ ] Other requests answer in under 1 s during the longest operation I touched
- [ ] Every click shows a visible change at once
- [ ] Results appear one by one; I opened a finished item while another was running
- [ ] Cancel, skip and failure keep finished work; "done" never covers missing output
- [ ] A later stage can be queued, on the first click, while an earlier one runs
- [ ] A problem on one page or item does not stop the others
- [ ] Transient provider errors are retried, timed out, and logged with their cause
- [ ] Every new message is in plain words, names a next step, and is in all five locales
- [ ] No new always-visible element, or the product owner agreed to it
- [ ] The change does what its issue asks; wider protections were raised first
```

## 7. Stop and ask

Stop and write to the product owner before building, or before going further, when any
of these is true. An agent session reports the point and waits; it does not choose for
the user.

- Something measurably slower on a path the user touches, or more provider calls for
  the same result.
- A new block, refusal, confirmation or required step.
- A new element that is always visible, or a new warning state.
- A check that covers the whole book, or one that runs on a read, a poll or a download.
- A change in how books from earlier releases open, render, preview or export.
- A safeguard that needs a goal in this document to give way.
- Scope beyond the issue or the approved spec.

The message can be short: what the safeguard protects, what it costs the user, the
options and their cost, and a recommendation.

[pr884]: https://github.com/unicef/adt-studio/pull/884
[884-export]: https://github.com/unicef/adt-studio/pull/884#issuecomment-6783468553
[884-history]: https://github.com/unicef/adt-studio/pull/884#issuecomment-6780769557
[884-sep30]: https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5368403884
[884-oct12]: https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5486273946
[884-nov7]: https://github.com/unicef/adt-studio/pull/884#issuecomment-6700469057
[879-oct11]: https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5485373703
[879-note1]: https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5495521304
[879-note2]: https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5496907490
[879-note3]: https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5512531112
[879-note4]: https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5524868514
[879-note7]: https://github.com/unicef/adt-studio/pull/879#pullrequestreview-5552755170
[i996]: https://github.com/unicef/adt-studio/issues/996
[i997]: https://github.com/unicef/adt-studio/issues/997
[i1067]: https://github.com/unicef/adt-studio/issues/1067
[pr1069]: https://github.com/unicef/adt-studio/pull/1069
[i1071]: https://github.com/unicef/adt-studio/issues/1071
[pr1072]: https://github.com/unicef/adt-studio/pull/1072
[i1083]: https://github.com/unicef/adt-studio/issues/1083
[i1085]: https://github.com/unicef/adt-studio/issues/1085
[i1086]: https://github.com/unicef/adt-studio/issues/1086
