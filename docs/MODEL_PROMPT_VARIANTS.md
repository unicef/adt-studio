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

## Directory And Naming Convention

The base prompt name remains unchanged:

```text
prompts/page_sectioning.liquid
```

Model-specific global prompts should live in a directory named after the
filesystem-safe model id:

```text
prompts/openai_gpt_5_5/page_sectioning.liquid
```

The current folder-name sanitizer lowercases the model id, replaces
non-alphanumeric runs with `_`, and trims leading/trailing `_`. This avoids
characters such as `:` that are not valid in Windows folder names.

Examples:

| Model id | Folder name |
| --- | --- |
| `openai:gpt-5.5` | `openai_gpt_5_5` |
| `anthropic:claude-opus-4.1` | `anthropic_claude_opus_4_1` |
| `google:gemini-2.5-pro` | `google_gemini_2_5_pro` |

The older flat filename format is still supported for compatibility:

```text
prompts/page_sectioning__openai_gpt_5_5.liquid
```

New project-level prompt variants should use model folders instead of the flat
filename format.

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
2. `books/<book-label>/prompts/openai_gpt_5_5/page_sectioning.liquid`
3. `books/<book-label>/prompts/page_sectioning__openai_gpt_5_5.liquid`
4. `prompts/.versions/page_sectioning__openai_gpt_5_5/<latest>.liquid`
5. `prompts/openai_gpt_5_5/page_sectioning.liquid`
6. `prompts/page_sectioning__openai_gpt_5_5.liquid`
7. `books/<book-label>/prompts/.versions/page_sectioning/<latest>.liquid`
8. `books/<book-label>/prompts/page_sectioning.liquid`
9. `prompts/.versions/page_sectioning/<latest>.liquid`
10. `prompts/page_sectioning.liquid`

If no model-specific prompt exists, the base prompt is used.

## Adding a New Model

1. Add the model option to Studio model selection if it is not already present
   in `apps/studio/src/components/pipeline/components/ModelSelect.tsx`.
2. Add or verify provider support in the LLM client/config layer.
3. Create a model folder in `prompts/` using the sanitized folder convention
   above.
4. Add only the prompt files that need model-specific instructions inside that
   folder, using the same base filenames as the root prompts.
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

## Liquid Runtime Contract

Every prompt variant is rendered by `packages/llm/src/prompt.ts` with Liquid.
The prompt file must remain a valid `.liquid` template and may use only the
runtime context supplied by the pipeline step that calls it.

ADT Studio supports these prompt-specific tags:

```liquid
{% chat role: "system" %}
System instructions.
{% endchat %}

{% chat role: "user" %}
Prompt body with {{ variables }}.
{% image page_image_base64 %}
{% endchat %}
```

Rules:

- Keep `{% chat %}` message structure valid. Roles are `system`, `user`, and
  `assistant`.
- Keep `{% image <base64-variable> %}` tags for multimodal inputs. Do not
  replace them with raw `data:image/...` strings.
- Keep `{% include "_render_node", nodes: nodes, depth: 0 %}` in render and
  activity prompts unless the variant intentionally rewrites equivalent node
  serialization and still preserves the same input/output contract.
- Do not rename Liquid variables. If a model needs clearer instructions, add
  prose around the same variables.
- Treat `openai:gpt-5.4` and bare `gpt-5.4` as the base prompt model; they do
  not produce a model folder. The runtime `default_model` is independent: when
  it names another model, that model's prompt folder is still resolved first.
- Bare model ids are canonicalized as OpenAI model ids. For example, `gpt-5.5`
  resolves to `openai:gpt-5.5` and folder `openai_gpt_5_5`.

### Common Object Shapes

These shapes are used repeatedly. Individual prompts receive only the variables
listed in the prompt variable table below.

| Variable/object | Meaning |
| --- | --- |
| `pages[]` | Source pages used as context. Usually includes `pageNumber`, `text`, and sometimes `imageBase64`. |
| `page` | Current page for page-level work. Includes `pageNumber`, `text`, and `imageBase64`. |
| `page_image_base64` | Base64 image for the full source page or screenshot under review. Used with `{% image page_image_base64 %}`. |
| `images[]` | Extracted images available to the prompt. Image field spelling depends on the step: extraction/caption prompts use `imageId` and `imageBase64`; sectioning/render prompts use `image_id` and `image_base64`. Preserve the spelling used by the base prompt. |
| `structure_types[]` | Allowed content tree container types. Each entry has at least `key` and `description`. |
| `role_types[]` | Allowed leaf/text roles. Each entry has at least `key` and `description`. |
| `section_types[]` | Allowed top-level section types. Each entry has at least `key` and `description`. |
| `nodes` | Content tree nodes for a section. Passed to `_render_node` in render/activity prompts. |
| `leaf_texts[]` | Flat list of text leaves from the content tree. Used by answer extraction and visual review. |
| `viewports[]` | Responsive viewport definitions. Entries include `label`, `width`, and `tailwind_prefix`. |
| `book_fonts[]` | Font assignment context. Entries include `family`, `role`, and optional `category`/`usage_notes`. |
| `styleguide` | Styleguide text/JSON-like guidance for HTML rendering. May be an empty string. |
| `user_instructions` | User-provided extra instructions for captioning/glossary/rendering. May be an empty string. |
| `language` / `language_code` | Human language name and locale/code for generated output. |
| `source_language` / `target_language` | Translation source/target human language names. |
| `source_language_code` / `target_language_code` | Translation source/target locale codes. |

## Prompt Variables

Use this table when creating variants from zero. A model-specific prompt may use
fewer variables than listed only if the base prompt also does; it must not
introduce new required variables without a matching pipeline code change.

| Prompt | Variables supplied by the runtime |
| --- | --- |
| `metadata_extraction` | `pages`, `pages[].pageNumber`, `pages[].text`, `pages[].imageBase64` |
| `image_meaningfulness` | `page_image_base64`, `images`, `images[].imageId`, `images[].imageBase64`, `images[].width`, `images[].height` |
| `image_cropping` | `page_image_base64`, `images`, `images[].imageId`, `images[].imageBase64`, `images[].width`, `images[].height` |
| `image_segmentation` | `page_image_base64`, `images`, `images[].imageId`, `images[].imageBase64`, `images[].width`, `images[].height` |
| `page_sectioning` | `page`, `page.pageNumber`, `page.text`, `page.imageBase64`, `images`, `images[].image_id`, `images[].imageBase64`, `structure_types`, `role_types`, `section_types`, `mode` |
| `page_sectioning_refinement` | `page`, `page.pageNumber`, `page.text`, `page.imageBase64`, `images`, `structure_types`, `role_types`, `section_types`, `mode`, `max_refinements`, `iteration`, `prior_notes`, `candidate`, `candidate.reasoning`, `candidate.sections_json` |
| `image_captioning` | `page_image_base64`, `images`, `images[].imageId`, `images[].imageBase64`, `language`, `language_code`, `book_summary`, `user_instructions`, `grade_level` |
| `translation` | `source_language`, `source_language_code`, `target_language`, `target_language_code`, `texts`, `texts[].index`, `texts[].text` |
| `image_translation` | No Liquid variables in the current root prompt. The API passes image context to the image model separately. |
| `easy_read` | `language`, `language_code`, `section_text`, `section_type`, `texts`, `texts[].index`, `texts[].text` |
| `glossary` | `language`, `language_code`, `pages`, `amount`, `user_instructions`, `seed_terms`, `excluded_words` |
| `glossary_one` | `language`, `language_code`, `word`, `context`, `candidate_variations` |
| `book_summary` | `pages`, `pages[].pageNumber`, `pages[].text`, `output_language`, `output_language_code` |
| `toc_generation` | `language`, `language_code`, `headings`, `headings[].sectionId`, `headings[].title`, `headings[].textType`, `has_original_toc`, `original_toc_text`, `mode` |
| `quiz_generation` | `language`, `language_code`, `page_texts`, `page_texts[].pageId`, `page_texts[].text` |
| `font_assignment` | `fonts`, `page_images`, `book_summary`, `book_title` |
| `styleguide_generation` | `page_images`, `book_fonts` |
| `web_generation_html` | `label`, `page_image_base64`, `section_id`, `section_type`, `nodes`, `leaf_texts`, `images`, `group_ids`, `styleguide`, `book_fonts`, `viewports`, `user_instructions` |
| `web_generation_html_overlay` | `label`, `page_image_base64`, `section_id`, `section_type`, `nodes`, `leaf_texts`, `images`, `group_ids`, `styleguide`, `book_fonts`, `viewports`, `user_instructions` |
| `visual_review` | `page_image_base64`, `section_type`, `current_html`, `nodes`, `leaf_texts`, `viewports` |
| `visual_review_flexible` | `page_image_base64`, `section_type`, `current_html`, `nodes`, `leaf_texts`, `viewports` |
| `html_edit` | `current_html`, `instruction`, `screenshots`, `previous_attempt_failure` |
| `html_edit_verify` | `instruction`, `before_base64`, `after_base64` |
| `activity_*` | Same as render prompts: `label`, `page_image_base64`, `section_id`, `section_type`, `nodes`, `leaf_texts`, `images`, `group_ids`, `styleguide`, `book_fonts`, `viewports`, `user_instructions` |
| `activity_*_answers` | Same as `activity_*`, plus `activity_html` |
| `activity_open_ended_answer` | Same as `activity_*` |
| `ai_image_generation` | `user_prompt`, `style`, `image_type` |
| `ai_image_edit` | `user_prompt`, `style`, `image_type` |
| `_render_node` | Include-only helper. Called with `nodes` and `depth`; internally iterates `node`, `node.node_id`, `node.role`, `node.text`, `node.structure`, and `node.children`. |
| `web_generation_html_old` | Legacy prompt using `styleguide`, `page_image_base64`, `section_type`, `images`, `images[].image_id`, `images[].image_base64`, `texts`, `texts[].text_id`, `texts[].text_type`, `texts[].text`. |
| `visual_review_edit` | Legacy/alternate prompt using `instruction`, `viewports`, and visual review screenshot context. |

## Context Needed To Generate Variant Files

When asking an AI model to generate prompt variants, provide enough context for
the model to preserve ADT Studio's contracts instead of inventing new inputs.
At minimum, include:

1. Target model id, for example `openai:gpt-5.5`.
2. Target folder name, for example `prompts/openai_gpt_5_5/`.
3. The exact base prompt file contents for every prompt to convert.
4. This document's storage rules, runtime resolution order, authoring rules, and
   prompt variable table.
5. The expected output format: a file path and full `.liquid` file content for
   each generated variant.
6. Which prompts to generate. Use the minimum recommended set below unless full
   parity is required.
7. Any model-specific behavior to account for: multimodal syntax expectations,
   JSON reliability, tool limitations, maximum output length, verbosity, and
   whether the model needs stricter schema reminders.

Use this brief template:

```text
You are generating ADT Studio model-specific Liquid prompt variants.

Target model id: <provider:model>
Target prompt folder: prompts/<sanitized_model_id>/

Rules:
- Start from the supplied base prompt content.
- Preserve all Liquid variables, custom tags, includes, output schemas, IDs, and
  validation-sensitive wording unless the change is explicitly model-specific.
- Do not introduce new required variables.
- Keep {% chat %}, {% image %}, and {% include %} syntax valid.
- Keep the same filename as the base prompt inside the target folder.
- Output one complete file per prompt, with path and full content.

Available runtime variables are exactly the variables listed for each prompt in
the "Prompt Variables" table.

Generate variants for:
<prompt-name-1>
<prompt-name-2>
...

For each prompt, I will provide:
--- BEGIN prompts/<prompt-name>.liquid ---
<base prompt content>
--- END prompts/<prompt-name>.liquid ---
```

Expected response format from the generator:

```text
FILE: prompts/<sanitized_model_id>/<prompt-name>.liquid
<full Liquid content>

FILE: prompts/<sanitized_model_id>/<next-prompt-name>.liquid
<full Liquid content>
```

After receiving generated files, review manually for:

- No new Liquid variables beyond the table above.
- No removed required variables, image tags, or includes.
- Same output schema and JSON field names as the base prompt.
- Same downstream IDs (`image_id`, `node_id`, `section_id`, text indexes).
- No provider-specific API syntax inside the prompt body unless it is plain
  instruction text intended for the model.
- No markdown fences around final JSON when the base prompt requires raw JSON.

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
