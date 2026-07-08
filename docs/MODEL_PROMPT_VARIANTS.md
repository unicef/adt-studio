# Model-Specific Prompt Variants

This guide explains how ADT Studio stores model-specific prompts, how to add
prompt variants for a new model, and which prompt templates should be reviewed.

## Storage Model

Prompt templates are Liquid files on disk. They are not stored in the database.

Global prompts live in:

```text
prompts/
```

Book-level prompt edits made from Studio live inside the book directory:

```text
books/<book-label>/prompts/.versions/
```

This preserves book-level portability and entity-level versioning. A prompt edit
made in the Studio pipeline UI writes a new versioned file for that book only; it
does not modify the global `prompts/*.liquid` files.

## Naming Convention

The base prompt name remains unchanged:

```text
prompts/page_sectioning.liquid
```

A model-specific global prompt variant appends the sanitized model id:

```text
prompts/page_sectioning__openai_gpt_5_5.liquid
```

The current sanitizer lowercases the model id, replaces non-alphanumeric runs
with `_`, and trims leading/trailing `_`.

Examples:

| Model id | Prompt suffix |
| --- | --- |
| `openai:gpt-5.5` | `__openai_gpt_5_5` |
| `anthropic:claude-opus-4.1` | `__anthropic_claude_opus_4_1` |
| `google:gemini-2.5-pro` | `__google_gemini_2_5_pro` |

Book-level edits use the same resolved prompt name, but are stored as immutable
versions:

```text
books/<book-label>/prompts/.versions/page_sectioning__openai_gpt_5_5/<timestamp>-000.liquid
```

## Runtime Resolution

Prompt resolution is exact-model based, not family based.

When a pipeline step renders `page_sectioning` with model
`openai:gpt-5.5`, the prompt engine tries:

1. `books/<book-label>/prompts/.versions/page_sectioning__openai_gpt_5_5/<latest>.liquid`
2. `books/<book-label>/prompts/page_sectioning__openai_gpt_5_5.liquid`
3. `prompts/.versions/page_sectioning__openai_gpt_5_5/<latest>.liquid`
4. `prompts/page_sectioning__openai_gpt_5_5.liquid`
5. `books/<book-label>/prompts/.versions/page_sectioning/<latest>.liquid`
6. `books/<book-label>/prompts/page_sectioning.liquid`
7. `prompts/.versions/page_sectioning/<latest>.liquid`
8. `prompts/page_sectioning.liquid`

If no model-specific prompt exists, the base prompt is used.

## Adding a New Model

1. Add the model id to `resolvePromptModelId` in
   `packages/llm/src/prompt.ts`.
2. Add the model option to Studio model selection if it is not already present
   in `apps/studio/src/components/pipeline/components/ModelSelect.tsx`.
3. Add or verify provider support in the LLM client/config layer.
4. Create model-specific prompt files in `prompts/` using the naming convention
   above.
5. Keep the Liquid variables, `{% chat %}` blocks, `{% image %}` tags, and
   expected output shape compatible with the base prompt.
6. Run focused prompt/pipeline tests and `pnpm typecheck`.

## Authoring Rules

- Start from the base prompt and adapt only the parts that are model-sensitive:
  instruction order, response-format strictness, examples, reasoning guidance,
  image handling, and verbosity constraints.
- Preserve all Liquid variables exactly unless the pipeline code is changed to
  provide different inputs.
- Preserve output schemas and IDs. Validators and downstream steps depend on the
  same response shape across models.
- Prefer model-specific strengths. For example, a stricter JSON-oriented model
  may need less repetition around schema shape, while a model that is prone to
  creative rewrites may need stronger "copy exact text" constraints.
- Do not create family-level prompts such as `__gpt` or `__gemini`. Variants are
  per exact model id.

## Prompt Inventory

For full model parity, review every prompt below and create a variant when the
new model benefits from different instructions. A model can be enabled without
all variants because the base prompt is the fallback, but missing variants mean
that step is not optimized for the model.

### Extraction And Structure

| Prompt | Purpose |
| --- | --- |
| `metadata_extraction` | Extracts book metadata from source pages/PDF context. |
| `image_segmentation` | Detects and describes image regions on page images. |
| `image_meaningfulness` | Classifies extracted images as meaningful or decorative/noise. |
| `image_cropping` | Refines crop boxes for extracted page images. |
| `page_sectioning` | Converts a textbook page into ordered pedagogical sections and content nodes. |
| `page_sectioning_refinement` | Repairs or refines page-sectioning output after validation or quality issues. |

### Captions, Translation, And Accessibility

| Prompt | Purpose |
| --- | --- |
| `image_captioning` | Writes accessible captions for meaningful extracted images. |
| `translation` | Translates text catalog entries while preserving IDs and structure. |
| `image_translation` | Translates image text/labels or image-related text when image translation is enabled. |
| `easy_read` | Rewrites text into easier reading-level variants. |
| `glossary` | Generates glossary terms and definitions from book/page content. |
| `glossary_one` | Generates or repairs a single glossary entry. |

### Book-Level Generation

| Prompt | Purpose |
| --- | --- |
| `book_summary` | Produces a concise book summary used as context by downstream steps. |
| `toc_generation` | Generates or normalizes table-of-contents data. |
| `quiz_generation` | Generates quizzes from book/page content. |
| `styleguide_generation` | Derives a visual style guide for rendering pages. |
| `font_assignment` | Assigns uploaded/detected fonts to semantic roles such as heading, body, caption, or decorative. |

### HTML Rendering And Review

| Prompt | Purpose |
| --- | --- |
| `web_generation_html` | Renders a section/content tree into responsive HTML. |
| `web_generation_html_overlay` | Renders overlay-oriented HTML for strategies that preserve source-page positioning more closely. |
| `visual_review` | Reviews rendered screenshots against source imagery and returns corrected HTML when needed. |
| `visual_review_flexible` | Alternative visual-review prompt with looser visual matching rules. |
| `html_edit` | Applies a user edit instruction to existing generated HTML. |
| `html_edit_verify` | Verifies a user HTML edit against screenshots and the edit instruction. |

### Activity Rendering

| Prompt | Purpose |
| --- | --- |
| `activity_multiple_choice` | Renders multiple-choice activity sections as HTML. |
| `activity_multiple_choice_answers` | Extracts or generates answer data for multiple-choice activities. |
| `activity_multi_select` | Renders select-all-that-apply activity sections as HTML. |
| `activity_multi_select_answers` | Extracts or generates answer data for multi-select activities. |
| `activity_true_false` | Renders true/false activity sections as HTML. |
| `activity_true_false_answers` | Extracts or generates answer data for true/false activities. |
| `activity_fill_in_the_blank` | Renders fill-in-the-blank activity sections as HTML. |
| `activity_fill_in_the_blank_answers` | Extracts or generates answer data for fill-in-the-blank activities. |
| `activity_fill_in_a_table` | Renders table-completion activity sections as HTML. |
| `activity_fill_in_a_table_answers` | Extracts or generates answer data for table-completion activities. |
| `activity_matching` | Renders matching activity sections as HTML. |
| `activity_matching_answers` | Extracts or generates answer data for matching activities. |
| `activity_sorting` | Renders sorting/ordering activity sections as HTML. |
| `activity_sorting_answers` | Extracts or generates answer data for sorting/ordering activities. |
| `activity_open_ended_answer` | Generates answer/support data for open-ended activities. |

### AI Image Tools

| Prompt | Purpose |
| --- | --- |
| `ai_image_generation` | Builds the text prompt used for AI image generation from user/page context. |
| `ai_image_edit` | Builds the text prompt used for AI image editing from user/page context and a reference image. |

### Auxiliary Or Legacy Templates

| Prompt/template | Purpose |
| --- | --- |
| `_render_node` | Liquid include partial used by rendering prompts to serialize content nodes. This is deterministic template glue, not a model-specific prompt target. |
| `web_generation_html_old` | Legacy HTML rendering prompt. Add a model variant only if a config still references it. |
| `visual_review_edit` | Legacy/alternate visual edit-review prompt. Add a model variant only if a workflow references it. |

## Minimum Recommended Set

When adding a high-quality production model, create variants for at least:

```text
metadata_extraction
image_segmentation
image_meaningfulness
image_cropping
page_sectioning
page_sectioning_refinement
image_captioning
translation
glossary
quiz_generation
book_summary
toc_generation
styleguide_generation
font_assignment
web_generation_html
web_generation_html_overlay
visual_review
html_edit
html_edit_verify
```

If activity rendering is enabled for the model, also create all
`activity_*` and `activity_*_answers` variants. If accessibility/language
features are enabled, include `easy_read` and `image_translation`. If AI image
generation/editing routes use the model-specific prompt engine, include
`ai_image_generation` and `ai_image_edit`.
