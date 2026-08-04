# Styleguide

## Required Container Structure

Every page MUST use this exact outer container:

```html
<div class="container content mx-auto flex min-h-screen w-full items-center justify-center px-6 py-12"
    data-background-color="BACKGROUND_COLOR" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="SECTION_TYPE"
      id="simple-main" role="article">
    <!-- Content goes here -->
  </section>
</div>
```

**Do NOT put `data-text-color` on this outer `<section>`.** Headings and body
text can have different colors (see Visual Defaults below), so a single
section-wide value cannot represent both. Instead, put `data-text-color`
directly on each heading element (`h1`/`h2` rendering a `heading`,
`chapter_title`, `section_heading`, etc.) using the Headings color, and
directly on each body-text element (`p` rendering `section_text`,
`standalone_text`, etc.) using the Body Text color — see the Page Templates
below for concrete examples. Exception: templates that already define their
own distinct, non-default color scheme (e.g. the Table of Contents) should
NOT add `data-text-color` to their custom-colored elements — leave those to
their own explicit color classes instead of forcing the generic Headings/Body
Text colors onto them.

## Visual Defaults

These are the book-wide defaults for this styleguide. They take precedence over any generic example or convention shown elsewhere in this prompt — apply them consistently across every page unless a specific template below explicitly overrides one of them. Headings and body text are scoped separately below: a setting under one does not affect the other.

### Page-level

| Property | Default | Notes |
|----------|---------|-------|
| Background color | `#FFFFFF` | Applied via `data-background-color` on the outer container. |
| Max paragraph width (reading column) | `max-w-5xl` | Applies to the inner container on every page — never vary this per page. |
| Paragraph spacing | `space-y-4` inside a Content Card, `space-y-3` for a bare Text Group | Vertical gap between paragraphs — keep it consistent with the component used. |

### Headings

| Property | Default | Notes |
|----------|---------|-------|
| Text color | `#111827` | Applied to headings (`heading`, `chapter_title`, `section_heading`, etc.) via `data-text-color` — does not affect the other role. |
| Text alignment | Center | Only applies to headings (`heading`, `chapter_title`, `section_heading`, etc.). Only center/right-align where a template below explicitly shows it (e.g. cover/title pages, the Table of Contents). |
| Bold / Italic / Underline | Bold | Controls whether headings (`heading`, `chapter_title`, `section_heading`, etc.) is bold/italic/underlined by default. |
| Line-height | `leading-loose` | Applies to headings (`heading`, `chapter_title`, `section_heading`, etc.). Keep it consistent across all pages. |

### Body Text

| Property | Default | Notes |
|----------|---------|-------|
| Text color | `#1F2937` | Applied to body text (`section_text`, `standalone_text`) via `data-text-color` — does not affect the other role. |
| Text alignment | Left | Only applies to body text (`section_text`, `standalone_text`). Only center/right-align where a template below explicitly shows it (e.g. cover/title pages, the Table of Contents). |
| Bold / Italic / Underline | Italic | Controls whether body text (`section_text`, `standalone_text`) is bold/italic/underlined by default. |
| Line-height | `leading-relaxed` | Applies to body text (`section_text`, `standalone_text`). Keep it consistent across all pages. |

## Inner Container (REQUIRED for all content pages)

Inside the section, ALWAYS use this inner container structure:

```html
<div class="mx-auto w-full max-w-5xl space-y-8">
  <!-- Page content here -->
</div>
```

---

## Components

### Chapter Badge (EXACT - use for chapter headers)

When there is a chapter number (like "CHAPTER 1"), use this EXACT structure:

```html
<div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
  <div class="flex items-start gap-6">
    <div class="shrink-0 rounded-3xl bg-purple-200 px-6 py-5 shadow-sm">
      <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-text-color="HEADING_TEXT_COLOR" data-id="CHAPTER_WORD_ID">CHAPTER</h1>
      <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-text-color="HEADING_TEXT_COLOR" data-id="CHAPTER_NUMBER_ID">1</h1>
    </div>
    <div class="pt-2">
      <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-text-color="HEADING_TEXT_COLOR" data-id="CHAPTER_TITLE_ID">Chapter Title Here</h1>
    </div>
  </div>
</div>
```

### Content Card (for body text)

Wrap body paragraphs in this card:

```html
<div class="space-y-4 rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
  <p class="text-lg md:text-xl leading-relaxed" data-text-color="BODY_TEXT_COLOR" data-id="ID">Paragraph text</p>
  <p class="text-lg md:text-xl leading-relaxed" data-text-color="BODY_TEXT_COLOR" data-id="ID">More text</p>
</div>
```

### Text Group (for paragraphs without card)

```html
<div class="space-y-3">
  <p class="text-lg md:text-xl leading-relaxed" data-text-color="BODY_TEXT_COLOR" data-id="ID">Paragraph text</p>
</div>
```

---

## Text Styles

| text_type | Element | Classes |
|-----------|---------|---------|
| book_title | h1 | text-4xl md:text-5xl font-extrabold leading-tight |
| book_subtitle | h2 | text-2xl md:text-3xl font-semibold text-gray-700 |
| chapter_title | h1 | text-3xl md:text-4xl font-bold leading-tight |
| section_heading | h1 | text-3xl md:text-4xl font-bold leading-tight |
| activity_title | h2 | text-2xl md:text-3xl font-bold leading-tight |
| heading | h2 | text-2xl md:text-3xl font-bold leading-tight |
| section_text | p | text-lg md:text-xl leading-relaxed |
| instruction_text | p | text-base md:text-lg leading-relaxed text-gray-700 italic |
| standalone_text | p | text-base md:text-lg leading-relaxed |
| image_associated_text | p | text-sm md:text-base text-gray-600 italic mt-2 |

## Image Styles

| Type | Classes |
|------|---------|
| Single image | w-full rounded-2xl shadow-lg |
| Multiple images | rounded-xl shadow-md |
| Image grid container | grid grid-cols-2 gap-4 |

---

## Page Templates

### Template: Chapter Start Page (with chapter badge)

Use when page has "CHAPTER" and a number:

```html
<div class="container content mx-auto flex min-h-screen w-full items-center justify-center px-6 py-12"
    data-background-color="#ffffff" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="text_and_single_image"
      id="simple-main" role="article">
    <div class="mx-auto w-full max-w-5xl space-y-8">
      <!-- Chapter Badge (heading role — data-text-color on each heading, not the section) -->
      <div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div class="flex items-start gap-6">
          <div class="shrink-0 rounded-3xl bg-purple-200 px-6 py-5 shadow-sm">
            <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-text-color="HEADING_TEXT_COLOR" data-id="chapter-word">CHAPTER</h1>
            <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-text-color="HEADING_TEXT_COLOR" data-id="chapter-num">1</h1>
          </div>
          <div class="pt-2">
            <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-text-color="HEADING_TEXT_COLOR" data-id="chapter-title">The Nile River</h1>
          </div>
        </div>
      </div>
      <!-- Content Card (body role — data-text-color on each paragraph) -->
      <div class="space-y-4 rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
        <p class="text-lg md:text-xl leading-relaxed" data-text-color="BODY_TEXT_COLOR" data-id="text-1">Paragraph one.</p>
        <p class="text-lg md:text-xl leading-relaxed" data-text-color="BODY_TEXT_COLOR" data-id="text-2">Paragraph two.</p>
      </div>
      <!-- Image -->
      <img alt="" class="w-full rounded-2xl shadow-lg" data-id="img-1" src="images/img-1.jpg"/>
    </div>
  </section>
</div>
```

### Template: Regular Content Page (text and images)

Use for pages with just text and images (no chapter header):

```html
<div class="container content mx-auto flex min-h-screen w-full items-center justify-center px-6 py-12"
    data-background-color="#ffffff" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="text_and_images"
      id="simple-main" role="article">
    <div class="mx-auto w-full max-w-5xl space-y-8">
      <!-- Text Group (body role — data-text-color on each paragraph) -->
      <div class="space-y-3">
        <p class="text-lg md:text-xl leading-relaxed" data-text-color="BODY_TEXT_COLOR" data-id="text-1">First paragraph.</p>
        <p class="text-lg md:text-xl leading-relaxed" data-text-color="BODY_TEXT_COLOR" data-id="text-2">Second paragraph.</p>
      </div>
      <!-- Image -->
      <img alt="" class="w-full rounded-2xl shadow-lg" data-id="img-1" src="images/img-1.jpg"/>
      <!-- More Text -->
      <div class="space-y-3">
        <p class="text-lg md:text-xl leading-relaxed" data-text-color="BODY_TEXT_COLOR" data-id="text-3">Another paragraph.</p>
      </div>
      <!-- Another Image -->
      <img alt="" class="w-full rounded-2xl shadow-lg" data-id="img-2" src="images/img-2.jpg"/>
    </div>
  </section>
</div>
```

### Template: Text-Only Page (prose only, no images)

Use for pages with only text — no images, no activities (`section_type: "text_only"`):

```html
<div class="container content mx-auto flex min-h-screen w-full items-center justify-center px-6 py-12"
    data-background-color="#ffffff" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="text_only"
      id="simple-main" role="article">
    <div class="mx-auto w-full max-w-5xl space-y-8">
      <!-- Heading (if the section has one) -->
      <h2 class="text-2xl md:text-3xl font-bold leading-tight" data-text-color="HEADING_TEXT_COLOR" data-id="heading-1">Section Heading</h2>
      <!-- Content Card -->
      <div class="space-y-4 rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
        <p class="text-lg md:text-xl leading-relaxed" data-text-color="BODY_TEXT_COLOR" data-id="text-1">First paragraph.</p>
        <p class="text-lg md:text-xl leading-relaxed" data-text-color="BODY_TEXT_COLOR" data-id="text-2">Second paragraph.</p>
      </div>
    </div>
  </section>
</div>
```

### Template: Text and Image Side by Side

```html
<div class="mx-auto w-full max-w-5xl space-y-8">
  <div class="flex flex-col md:flex-row gap-8">
    <div class="flex-1 space-y-4">
      <!-- text elements: put data-text-color="HEADING_TEXT_COLOR" on headings,
           data-text-color="BODY_TEXT_COLOR" on paragraphs -->
    </div>
    <div class="flex-1">
      <img class="w-full rounded-2xl shadow-lg" data-id="ID" src="images/ID.jpg" alt="" />
    </div>
  </div>
</div>
```

### Template: Table of Contents (EXACT - use for section_type "table_of_contents")

Use this EXACT structure for table of contents pages. This template intentionally
uses its own purple/gray color scheme instead of the Headings/Body Text
defaults — do NOT add `data-text-color` to its title, subtitle, or entries;
leave them to their own explicit color classes shown below.

```html
<div class="container content mx-auto flex min-h-screen w-full items-center justify-center px-6 py-12"
    data-background-color="#f3f0f7" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="table_of_contents"
      id="simple-main" role="article">
    <div class="mx-auto w-full max-w-3xl space-y-8">
      <!-- Background image (if provided) -->
      <div class="relative rounded-3xl overflow-hidden shadow-lg">
        <img alt="" class="w-full" data-id="IMG_ID" src="images/IMG_ID.jpg"/>
        <!-- Overlay card -->
        <div class="absolute inset-0 flex items-center justify-center p-6">
          <div class="w-full max-w-2xl rounded-2xl bg-white/90 backdrop-blur-sm p-8 shadow-lg">
            <!-- Title -->
            <div class="text-center mb-8">
              <h1 class="text-3xl md:text-4xl font-extrabold leading-tight text-purple-700" data-id="TITLE_ID">Book Title</h1>
              <h2 class="text-xl md:text-2xl font-semibold text-purple-600 mt-2" data-id="SUBTITLE_ID">Table of Contents</h2>
            </div>
            <!-- Entries -->
            <div class="space-y-3">
              <div class="flex items-baseline gap-2">
                <p class="text-base font-medium text-gray-700 whitespace-nowrap" data-id="CH1_LABEL">Chapter 1</p>
                <p class="text-base font-medium text-gray-800 flex-1" data-id="CH1_TITLE">Chapter Title</p>
                <span class="border-b border-dotted border-gray-400 flex-1 mx-2"></span>
                <p class="text-base font-medium text-gray-600" data-id="CH1_PAGE">2</p>
              </div>
              <!-- Repeat for each chapter -->
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
```

**Table of Contents Entry Row (repeat for each chapter):**

```html
<div class="flex items-baseline gap-2">
  <p class="text-base font-medium text-gray-700 whitespace-nowrap" data-id="CHAPTER_LABEL_ID">Chapter 1</p>
  <p class="text-base font-medium text-gray-800" data-id="CHAPTER_TITLE_ID">The Nile River</p>
  <span class="border-b border-dotted border-gray-400 flex-1 mx-2"></span>
  <p class="text-base font-medium text-gray-600" data-id="PAGE_NUMBER_ID">2</p>
</div>
```

**Important for Table of Contents:**
- Use `text-base` (not text-3xl or text-4xl) for chapter entries
- Use `font-medium` (not font-bold) for entries
- Title should be `text-3xl md:text-4xl`
- Subtitle "Table of Contents" should be `text-xl md:text-2xl`
- Keep the card compact with `max-w-2xl`
- Use dotted line separator between title and page number
