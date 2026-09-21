# Spec-Driven Development

How work is specified, reviewed and accepted in ADT Studio.

This document is the process. [`docs/specs/`](specs/) holds the specs,
[`docs/INVARIANTS.md`](INVARIANTS.md) holds the rules that must not break, and
[`docs/DECISIONS.md`](DECISIONS.md) holds the standing decisions. If you only read one
section, read [§3 Choosing a lane](#3-choosing-a-lane).

---

## 1. Why

`docs/DECISIONS.md` has recorded our *technology* choices well since 001. Nothing has
recorded our *behaviour* choices — what the product is contractually supposed to do.

The cost of that shows up as disagreements nobody can settle. Issue #733 reported that
saving one page's storyboard HTML cleared caption, catalog and speech-index entries
across the whole book, and was closed as "by design". Issue #736 reported the same
behaviour as a violation of core principle 2 — *"Entity-Level Versioning: NEVER
overwrite entities"*. Both readings were defensible, because no document said which one
was right. Two more issues (#131, #619) sat blocked behind a decision that was never
written down.

A codebase this size, with this much agent throughput, cannot settle that kind of
question in a PR comment thread. The rule below is the whole idea:

> **A change to what the product does gets written down before it gets built.**
> A change to how it does it does not.

That is one lane of three. Most work is in the other two.

## 2. The three lanes

### Fast lane — no spec

The default. Bug fixes, chores, dependency bumps, copy changes, refactors that preserve
behaviour, contained UI work, anything covered by an existing spec or decision.

Issue → branch → PR. The PR body carries the reasoning. Nothing else.

**Most work is fast lane, and that is the intent.** The process exists to catch the
handful of changes that would otherwise cost the project weeks; it is not a tax on the
other ninety percent.

### Spec lane — write a spec first

For changes where "what should this do?" has more than one defensible answer, and
getting it wrong is expensive to undo. A spec lands as a PR under
[`docs/specs/`](specs/), gets reviewed, and then becomes required reading for everyone
implementing it.

### Experiment lane — time-boxed, ends in a finding

For "we don't know yet". Branch `exp/<issue>-<slug>`, **two weeks maximum**, and it
ends by writing [`docs/experiments/TEMPLATE.md`](experiments/TEMPLATE.md) — a finding
with numbers where we have them — which recommends a spec, an archive, or an explicit
extension with a reason.

An experiment branch is allowed to be messy, because it is not going to be merged. That
is the trade: freedom to hack, in exchange for the result being a document rather than a
pull request. **An experiment that outgrew its issue becomes a finding plus a spec, not
a bigger PR.**

## 3. Choosing a lane

Work down this list and stop at the first match.

1. **Does it change a contract the user or another package depends on?** — what gets
   saved, what gets invalidated or regenerated, what an ID or a prompt output means,
   what an export contains, what an API route returns. → **Spec lane.**
2. **Does it change the storage schema or need a data migration?** → **Spec lane.**
   Books are the user's data and the format is shared with old versions of the app.
3. **Does it touch an invariant in [`docs/INVARIANTS.md`](INVARIANTS.md)?** →
   **Spec lane**, and the spec adds or updates the invariant's checker.
4. **Do we not yet know whether it works?** → **Experiment lane.**
5. **Otherwise** → **Fast lane.**

When it is genuinely unclear, take the fast lane and open the issue. If the branch
outgrows its issue, stop and split it — that is operating rule 2 in
[`AGENTS.md`](../AGENTS.md), and it applies here as the escape hatch. Discovering a spec
is needed halfway through is a normal outcome, not a failure.

Some worked examples:

| Change | Lane | Why |
|---|---|---|
| Fix a typo in a Spanish `.po` string | Fast | No contract, no schema |
| Add a column to a Studio table | Fast | Contained UI |
| Change how staleness invalidates downstream artifacts | **Spec** | Behaviour contract, disputed, affects saved data |
| Rename an internal helper across three packages | Fast | Behaviour-preserving refactor |
| Try a new sectioning heuristic to see if it's better | **Experiment** | We don't know yet — ends in a finding |
| Add a provider to `@adt/llm` following the existing port | Fast | Covered by the existing pattern |
| Change what a `data-id` refers to | **Spec** | Every downstream stage depends on the meaning |

## 4. The spec lifecycle

```
draft → in-review → approved → in-progress → implemented → verified
                                                              ↓
                                                         superseded
```

| Status | Meaning |
|---|---|
| `draft` | Being written. No commitment. |
| `in-review` | PR open. The clock is running. |
| `approved` | Merged and agreed. **Required session input for anyone implementing it.** |
| `in-progress` | At least one implementation PR is open. |
| `implemented` | Every acceptance criterion has a passing test. |
| `verified` | Confirmed in a running Studio or desktop build, not just in CI. |
| `superseded` | Replaced. The front matter names the spec that replaced it. |

**Reviewing the PR that adds the spec *is* the spec review.** No separate meeting, no
separate document. Time-boxed to **three working days** — a spec that cannot get a
decision in three days has an unresolved Open question, and that question is the real
work.

Approval needs at least one maintainer, plus product sign-off when user-facing scope
changes. An approved spec has **no blocking open questions**; each remaining one is
assigned to a person with a date and a stated default if that date passes.

The status in the file's front matter and the row in [`docs/specs/INDEX.md`](specs/INDEX.md)
must always agree. Move both in the same PR.

## 5. Writing a spec

1. Take the next free number from [`docs/specs/INDEX.md`](specs/INDEX.md).
2. Copy [`docs/specs/TEMPLATE.md`](specs/TEMPLATE.md) to `docs/specs/SPEC-NNNN-short-slug.md`.
3. Fill it in. **Generating the first draft with an agent, from the issue and the
   codebase, is encouraged** — then edit it yourself. A draft is cheap; the judgment
   in the editing is the expensive part, and it is the part that has to be human.
4. Add the row to `INDEX.md`.
5. Open the PR.

Keep it as short as the change allows, and delete sections that genuinely do not apply.
A spec is a tool, not a deliverable. The template's headings are a checklist of what a
reviewer needs, not a fixed schema — a spec may add sections the change calls for, and
rename one where a more precise title genuinely helps.

What separates a useful spec from a long one:

- **Problem, with evidence.** Symptoms and numbers, not solutions. Link the issues,
  quote the error, cite `file:line`, give the measurement. A reader should finish the
  section convinced the problem is real and bounded.
- **Non-goals are binding.** This is the section that stops scope creep and unblocks
  adjacent work, and it is the one most often left thin. Write it properly.
- **Options with rough cost.** "Option A — ~5 lines, 1 file" against "Option B — ~350
  lines, 9 files, plus a schema change" is what makes a trade-off reviewable. Then name
  the chosen one and the specific decisions a reviewer must ratify. If an estimate turns
  out to be unfounded, withdraw it explicitly rather than leaving it to be quoted later.
- **Acceptance criteria are testable checkboxes**, numbered `AC-1`, `AC-2`, … The
  implementation review checks these boxes; it does not assess vibes. Every criterion
  maps to at least one test in the test plan.
- **Rollout says how it lands and how it reverts.** Prefer a sequence of independently
  revertable PRs where the first one ships value alone.

## 6. ADRs

When a spec changes a **standing decision** — something future work should not
relitigate — it also appends an ADR to [`docs/DECISIONS.md`](DECISIONS.md) and links it
from the spec's `adr:` front matter.

The spec is the *proposal and its detail*; the ADR is the *one-page durable record* of
what was decided and what it costs. Not every spec needs one. A spec that resolves a
dispute, changes an invariant, or constrains future design almost certainly does.

Use the **ADR template** at the end of `docs/DECISIONS.md`. Three things to get right,
because all three are easy to miss:

- The heading continues the existing numbering in the file's own style — `## NNN: Title`,
  not a separate `ADR-NNN` scheme. All 23 existing entries use it.
- **Add your row to the Table of Contents** at the top of the file. It is maintained by hand.
- **Add your row to the Decision Log Summary** table at the bottom. Also by hand.

Retrospective ADRs — recording a decision that was already made in practice — use the
same shape, dated when the decision was actually taken, with a note that it is recorded
after the fact.

## 7. Invariants

An invariant is a property that must hold across the whole codebase, where a violation
is a bug even if every test passes. [`docs/INVARIANTS.md`](INVARIANTS.md) is the
registry.

Prose does not survive agent throughput, so **every row names a check** — a lint rule, a
contract test, a CI grep. A principle with no check is a wish.

When a spec establishes an invariant, it **adds the row and its checker in the same
change**. Adding the row alone is not done.

Not every check in the registry exists yet, and the `pnpm lint:invariants` entry point
that would run them together is itself still planned — the first spec that needs it
introduces it. Until then the checks that do exist run under `pnpm typecheck`,
`pnpm test` and `pnpm lint`. Treat a row whose check is not yet implemented as a debt
marker, not as enforcement.

## 8. Agents in this process

Agents write a large share of the code here. The process assumes that and constrains it:

- **Drafting a spec from an issue and the codebase is a good agent task.** Reviewing and
  editing that draft is not.
- **An approved spec is required session input** for work implementing it. That is
  operating rule 1 in [`AGENTS.md`](../AGENTS.md), and it is the main reason specs are
  worth writing: a spec is the shared context that survives between sessions.
- **The person who prompted the agent is the author, not the reviewer.** Never merge
  your own agent's work unreviewed (operating rule 5).
- **The PR declares honestly what was verified** — the commands actually run and their
  results — and what was not. An agent that did not run the tests says so, and the
  reviewer decides whether that is acceptable.
- **One task, one issue, one PR.** When a branch grows past its issue, stop and split it.
- **Search before opening.** Check open PRs and issues for the same change first — a
  duplicate scaffolding PR is cheap to avoid and expensive to reconcile.

## 9. Docs this process still needs

The context map in [`AGENTS.md`](../AGENTS.md) points at the documents a session should
load before touching an area. Several of them are marked *(planned)* there because they
do not exist yet:

| Missing doc | Would cover |
|---|---|
| `docs/PRODUCT.md` | The critical path, the publishing registry, what the product promises users |
| `docs/PROMPTS.md` | Prompt output contracts — what each prompt under `prompts/` must return |
| `docs/SECURITY_MODEL.md` | The runtime's threat model and trust boundaries |

Writing any of them is fast-lane work. Until they exist, the nearest accurate
substitutes are `docs/ARCHITECTURE.md`, `docs/MODEL_PROMPT_VARIANTS.md` and
`docs/GUIDELINES.md`.
