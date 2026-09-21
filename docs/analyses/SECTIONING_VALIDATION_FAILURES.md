# Spec: Reduce page-sectioning validation failures (image_group + others)

## Problem

Page-sectioning currently exhausts its retry budget on a class of validator
errors that the LLM keeps re-emitting even after seeing the feedback. The
failures aren't ambiguous — they're shape errors the validator rejects
deterministically — but the prompt doesn't give the model enough guidance to
avoid them on the next attempt, so the page fails outright after
`maxRetries` (default 5).

The most common offender is the `image_group` rule: the validator requires
an `image_group` container to hold the image leaf **plus at least one
associated content leaf** (`packages/pipeline/src/page-sectioning.ts:325-338`).
The model frequently emits an `image_group` with only the image inside, or
puts the image second instead of first, and burns retries on it.

## Where it happens

- Validator: `packages/pipeline/src/page-sectioning.ts`, `validateNode()`
  (lines ~270-391).
- Retry loop: handed to `generateWithValidation` in `@adt/llm`; on failure
  the validator's error strings are appended to the next attempt's
  messages. After `maxRetries` exhausted, the step throws and the page is
  marked failed.
- Prompt: `prompts/page_sectioning.liquid` (and the refinement variant).

## Validator failures, ranked by observed frequency

These all come from `validateNode()` — every one of them is a shape rule
the LLM should be able to follow given clear guidance:

1. **`image_group` missing associated content leaf** — line 333. The
   container has only the image inside.
2. **`image_group` first child is not the image** — line 328. Image is
   placed second/last instead of first.
3. **Container with `text`** — line 305. Model puts a title string on the
   container instead of in a child leaf.
4. **Leaf with `role` but no `text`** — line 376. Empty leaves emitted for
   visually-empty boxes (this overlaps with the crossword bug).
5. **Image leaf carries `text`** — line 357. Caption text glued onto the
   image leaf instead of a sibling leaf.
6. **Duplicate `image_id`** — line 368. Same image referenced from two
   places when the model is unsure where it belongs.
7. **Empty non-`table_cell` container** — line 318. Container emitted with
   no children at all.
8. **Both `structure` and `role` set, or neither** — lines 284, 289.

## What "fixed" looks like

For each failure mode above, the prompt should make the rule unmissable
and provide a small example of the right shape vs. the wrong shape — the
same approach used in the FITB prompt's section 1c
(`prompts/activity_fill_in_the_blank.liquid`). The validator messages are
already clear; the gap is that the model doesn't internalize the rule
from a single feedback message.

Concretely:

- An `image_group` block in the prompt that shows: image + caption (good),
  image alone (bad — should be a bare `role: "image"` leaf instead),
  caption + image in that order (bad — image must be first).
- A "container vs. leaf" block that shows: title leaf inside a
  `section_block` container (good), title text on the container itself
  (bad).
- An "empty cells" block that says: visually-empty boxes should emit a
  leaf with text `"_"` (or whatever the placeholder convention is), never
  a leaf with no `text` and never an empty container.
- A "one image, one place" reminder: every `image_id` appears exactly
  once across the whole tree.

## Acceptance criteria

1. Re-running page-sectioning on a sample of pages that previously failed
   with `image_group must contain the image leaf plus at least one
   associated content leaf` succeeds on the first or second attempt.
2. Across a 50-page test book, the rate of pages that exhaust
   `maxRetries` drops materially. (Pick a baseline number from the most
   recent run before merging.)
3. No regression in pages that already section cleanly — the prompt
   additions are guidance, not new constraints.
4. Add at least one regression test per rule in
   `packages/pipeline/src/__tests__/page-sectioning.test.ts` covering the
   bad-shape input → validator error path. (The image_group case at
   line 350-375 is the existing template.)

## Suggested approach

Two paths, ranked by intrusiveness:

1. **Prompt-only fix.** Extend `prompts/page_sectioning.liquid` with the
   blocks listed under "What 'fixed' looks like." Keep examples short and
   show wrong-vs-right for each rule. Cheapest if it works.

2. **Validator-side auto-repair for the cheap cases.** A few of these
   failures are mechanically fixable without re-prompting:
   - `image_group` with only an image child → unwrap to a bare
     `role: "image"` leaf in the parent's children list.
   - `image_group` with image not first → reorder children so image is
     first (only safe if exactly one child has `role: "image"`).
   - Container with both `text` and `children` → move the `text` into a
     synthetic leading child leaf with an inferred role.

   Auto-repair should run **before** the validator on each attempt's raw
   output, so the LLM never sees the failure and the retry budget is
   preserved for genuine ambiguity. Keep the repairs conservative — only
   the unambiguous transformations above; don't try to invent missing
   captions.

Start with #1. If a follow-up run still shows >X% of pages failing on
these specific rules, layer in #2 for the mechanical cases.

## Related context

- The crossword-collapse bug (`SECTIONING_CROSSWORD_BUG.md`) is a
  separate sectioning failure mode — the validator passes but the
  extraction is semantically wrong. That spec proposes a similar
  prompt-first / post-process-fallback strategy and the two fixes can
  share a single prompt-revision pass.
- The downstream `validate-html.ts` recently grew an `optionalTextIds`
  escape hatch for cases where the source tree's data-ids can't all be
  rendered. That is a different layer; the goal here is to keep the
  source tree itself well-formed so downstream layers don't need
  workarounds.
