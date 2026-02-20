# Styleguide — Sri Lanka Grade 2 (Child-Friendly)

This styleguide is designed for young children (Grade 2, ages ~7). Use large, readable text and soft, light backgrounds inspired by the original Sri Lankan textbook. Keep the visual design clean and uncluttered. Maximize content visibility by placing text and images side by side wherever possible.

## Color Palette (extracted from original book)

These colors are drawn from the original textbook illustrations. Use them sparingly — primarily for headings, badges, and star decorations. Backgrounds should be very light washes or gentle gradients of these tones.

| Role | Color | Usage |
|------|-------|-------|
| Warm Peach | #F2D4BC | Light background washes |
| Cream | #FFF5EB | Primary page background |
| Sky Blue | #5BACDB | Headings, badges |
| Light Blue | #B8E0F7 | Light background washes |
| Nature Green | #3D8B37 | Headings, badges |
| Leaf Green | #5AA84A | Accent headings |
| Warm Maroon | #8B2252 | Headings, chapter titles |
| Dark Brown | #3D2B1F | Body text color |
| Playful Pink | #F4A7B9 | Star decorations |
| Soft Purple | #7B68AE | Badges, star decorations |
| Sunny Orange | #F5A623 | Badges, star decorations |
| Golden Yellow | #F5C542 | Star decorations |

## Required Container Structure

Every page MUST use this exact outer container. The page background color is controlled ONLY by the `data-background-color` attribute — the system applies it to the `<body>` element automatically.

**CRITICAL — NO backgrounds on containers**: Do NOT add any `style="background: ..."`, `style="background-color: ..."`, `bg-*` classes, or gradient styles to the outer container, section, or any inner divs. The ONLY background for the page comes from `data-background-color` on the outer container. The system reads this attribute and applies it to the body.

```html
<div class="container content mx-auto flex min-h-screen w-full max-w-none items-start justify-center px-4 py-6"
    data-background-color="BACKGROUND_COLOR" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="SECTION_TYPE" data-text-color="#3D2B1F"
      id="simple-main" role="article">
    <!-- Content goes here -->
  </section>
</div>
```

**Background color rules:**
- Set `data-background-color` to a soft, pale color from the palette — this fills the ENTIRE page body
- Use very light, washed-out tones: `#FFF5EB` (cream), `#FFF0E6` (warm peach), `#F0F7FD` (pale blue), `#F5F0FA` (pale purple), `#F0F8EF` (pale green)
- Alternate between warm tones and cool tones across pages for variety
- NEVER use saturated or bright colors — always keep them pale and airy
- NEVER add any background styles to any HTML element — only use `data-background-color`

**Layout notes**: Use `items-start` (not `items-center`) and `py-6` (not `py-12`) so content starts near the top and more fits in a single view. Content may extend beyond the viewport — that is fine, `min-h-screen` is a minimum not a maximum.

## Inner Container (REQUIRED for all content pages)

Inside the section, ALWAYS use this inner container structure:

```html
<div class="mx-auto w-full max-w-6xl space-y-4">
  <!-- Page content here -->
</div>
```

Use `max-w-6xl` (wider than default) and `space-y-4` (tighter than default) to fit more content on screen.

---

## Decorations

Keep decorations minimal and tasteful. The only decorative element encouraged is **star decorations** for poem/song/activity pages.

### Star Decorations (inspired by the original book)

For poem or activity pages, scatter decorative stars using palette colors:

```html
<div class="absolute top-2 right-4 text-2xl" style="color: #F5C542;">&#9733;</div>
<div class="absolute top-6 right-12 text-lg" style="color: #F4A7B9;">&#9733;</div>
<div class="absolute top-3 right-20 text-xl" style="color: #7B68AE;">&#9733;</div>
```

**Decoration rules:**
- Stars ONLY on poem, song, and activity pages — not on regular content pages
- No colored borders on cards or content boxes
- No colored borders on images
- No dot dividers or section separators
- Rounded corners on cards and images are fine (`rounded-3xl`)
- Soft shadows are fine (`shadow-sm`, `shadow-md`)

---

## Text Styles

All text is LARGE for young readers. Paragraph text is roughly double the default size.

| text_type | Element | Classes |
|-----------|---------|---------|
| book_title | h1 | text-5xl md:text-6xl font-extrabold leading-tight |
| book_subtitle | h2 | text-3xl md:text-4xl font-semibold |
| chapter_title | h1 | text-4xl md:text-5xl font-bold leading-tight |
| section_heading | h1 | text-4xl md:text-5xl font-bold leading-tight |
| activity_title | h2 | text-3xl md:text-4xl font-bold leading-tight |
| section_text | p | text-2xl md:text-3xl leading-relaxed |
| instruction_text | p | text-xl md:text-2xl leading-relaxed italic |
| standalone_text | p | text-xl md:text-2xl leading-relaxed |
| image_associated_text | p | text-lg md:text-xl italic mt-2 |

**Note:** These sizes are intentionally large — this book is for 7-year-old children who need big, clear text.

## Image Styles

Images should be prominent and cleanly presented. No borders on images.

| Type | Classes |
|------|---------|
| Single image | w-full rounded-3xl shadow-md |
| Multiple images | rounded-2xl shadow-sm |
| Image grid container | grid grid-cols-2 gap-3 |

```html
<img alt="" class="w-full rounded-3xl shadow-md" data-id="ID" src="images/ID.jpg" />
```

---

## Layout Strategy: Maximize Visible Content

**CRITICAL**: Lay out content so as much as possible is visible in a single view. Prefer side-by-side layouts over stacked layouts.

### Preferred: Text and Image Side by Side

This is the PRIMARY layout. Use it whenever a page has both text and an image. Alternate which side the image appears on (left vs right) across pages.

**Image on RIGHT, text on LEFT:**

```html
<div class="mx-auto w-full max-w-6xl space-y-4">
  <div class="flex flex-col md:flex-row gap-4 items-start">
    <div class="flex-1 space-y-3">
      <h1 class="text-4xl md:text-5xl font-bold leading-tight" data-id="HEADING_ID" style="color: #8B2252;">Heading</h1>
      <p class="text-2xl md:text-3xl leading-relaxed" data-id="ID" style="color: #3D2B1F;">Paragraph text here.</p>
      <p class="text-2xl md:text-3xl leading-relaxed" data-id="ID" style="color: #3D2B1F;">More paragraph text.</p>
    </div>
    <div class="flex-1">
      <img alt="" class="w-full rounded-3xl shadow-md" data-id="ID" src="images/ID.jpg" />
    </div>
  </div>
</div>
```

**Image on LEFT, text on RIGHT:**

```html
<div class="mx-auto w-full max-w-6xl space-y-4">
  <div class="flex flex-col md:flex-row gap-4 items-start">
    <div class="flex-1">
      <img alt="" class="w-full rounded-3xl shadow-md" data-id="ID" src="images/ID.jpg" />
    </div>
    <div class="flex-1 space-y-3">
      <h1 class="text-4xl md:text-5xl font-bold leading-tight" data-id="HEADING_ID" style="color: #8B2252;">Heading</h1>
      <p class="text-2xl md:text-3xl leading-relaxed" data-id="ID" style="color: #3D2B1F;">Paragraph text here.</p>
    </div>
  </div>
</div>
```

### Extended Content (scrolling is OK)

If a page has lots of content, it is perfectly fine to extend beyond the viewport height. Use the side-by-side layout first, then stack additional content below:

```html
<div class="mx-auto w-full max-w-6xl space-y-4">
  <!-- Side by side section -->
  <div class="flex flex-col md:flex-row gap-4 items-start">
    <div class="flex-1 space-y-3">
      <!-- text elements -->
    </div>
    <div class="flex-1">
      <!-- image -->
    </div>
  </div>
  <!-- Additional content below (scrolling OK) -->
  <div class="space-y-3">
    <p class="text-2xl md:text-3xl leading-relaxed" data-id="ID">More text continues below...</p>
  </div>
</div>
```

---

## Components

### Chapter Badge (colorful, child-friendly)

When there is a chapter or lesson number, use this EXACT structure with vibrant colors:

```html
<div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
  <div class="flex items-start gap-4">
    <div class="shrink-0 rounded-3xl px-6 py-4 shadow-md" style="background: #3D8B37;">
      <h1 class="text-4xl md:text-5xl font-bold leading-tight" data-id="CHAPTER_WORD_ID" style="color: #FFF5EB;">LESSON</h1>
      <h1 class="text-5xl md:text-6xl font-extrabold leading-tight" data-id="CHAPTER_NUMBER_ID" style="color: #F5C542;">1</h1>
    </div>
    <div class="pt-2">
      <h1 class="text-4xl md:text-5xl font-bold leading-tight" data-id="CHAPTER_TITLE_ID" style="color: #8B2252;">Lesson Title Here</h1>
    </div>
  </div>
</div>
```

Vary the badge background color across chapters: #3D8B37, #5BACDB, #8B2252, #F5A623, #7B68AE.

### Content Card (for body text)

Wrap body paragraphs in a clean card with a soft frosted background. No colored borders.

```html
<div class="space-y-3 rounded-3xl p-5 shadow-sm" style="background: rgba(255, 255, 255, 0.7);">
  <p class="text-2xl md:text-3xl leading-relaxed" data-id="ID" style="color: #3D2B1F;">Paragraph text</p>
  <p class="text-2xl md:text-3xl leading-relaxed" data-id="ID" style="color: #3D2B1F;">More text</p>
</div>
```

### Text Group (for paragraphs without card)

```html
<div class="space-y-3">
  <p class="text-2xl md:text-3xl leading-relaxed" data-id="ID" style="color: #3D2B1F;">Paragraph text</p>
</div>
```

---

## Page Templates

### Template: Chapter/Lesson Start Page

Use when page has a chapter/lesson number. Use side-by-side layout with the image:

```html
<div class="container content mx-auto flex min-h-screen w-full max-w-none items-start justify-center px-4 py-6"
    data-background-color="#FFF5EB" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="text_and_single_image" data-text-color="#3D2B1F"
      id="simple-main" role="article">
    <div class="mx-auto w-full max-w-6xl space-y-4">
      <!-- Chapter Badge -->
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="flex items-start gap-4">
          <div class="shrink-0 rounded-3xl px-6 py-4 shadow-md" style="background: #3D8B37;">
            <h1 class="text-4xl md:text-5xl font-bold leading-tight" data-id="chapter-word" style="color: #FFF5EB;">LESSON</h1>
            <h1 class="text-5xl md:text-6xl font-extrabold leading-tight" data-id="chapter-num" style="color: #F5C542;">1</h1>
          </div>
          <div class="pt-2">
            <h1 class="text-4xl md:text-5xl font-bold leading-tight" data-id="chapter-title" style="color: #8B2252;">The Music Class</h1>
          </div>
        </div>
      </div>
      <!-- Side by Side: Text + Image -->
      <div class="flex flex-col md:flex-row gap-4 items-start">
        <div class="flex-1">
          <div class="space-y-3 rounded-3xl p-5 shadow-sm" style="background: rgba(255, 255, 255, 0.7);">
            <p class="text-2xl md:text-3xl leading-relaxed" data-id="text-1" style="color: #3D2B1F;">Paragraph one.</p>
            <p class="text-2xl md:text-3xl leading-relaxed" data-id="text-2" style="color: #3D2B1F;">Paragraph two.</p>
          </div>
        </div>
        <div class="flex-1">
          <img alt="" class="w-full rounded-3xl shadow-md" data-id="img-1" src="images/img-1.jpg" />
        </div>
      </div>
    </div>
  </section>
</div>
```

### Template: Regular Content Page (side by side)

Use for pages with text and images. **Always prefer side-by-side layout.**

```html
<div class="container content mx-auto flex min-h-screen w-full max-w-none items-start justify-center px-4 py-6"
    data-background-color="#F0F7FD" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="text_and_images" data-text-color="#3D2B1F"
      id="simple-main" role="article">
    <div class="mx-auto w-full max-w-6xl space-y-4">
      <!-- Side by Side: Image LEFT, Text RIGHT -->
      <div class="flex flex-col md:flex-row gap-4 items-start">
        <div class="flex-1">
          <img alt="" class="w-full rounded-3xl shadow-md" data-id="img-1" src="images/img-1.jpg" />
        </div>
        <div class="flex-1 space-y-3">
          <div class="rounded-3xl p-5 shadow-sm" style="background: rgba(255, 255, 255, 0.7);">
            <p class="text-2xl md:text-3xl leading-relaxed" data-id="text-1" style="color: #3D2B1F;">First paragraph.</p>
            <p class="text-2xl md:text-3xl leading-relaxed mt-3" data-id="text-2" style="color: #3D2B1F;">Second paragraph.</p>
          </div>
        </div>
      </div>
      <!-- Additional content below -->
      <div class="flex flex-col md:flex-row gap-4 items-start">
        <div class="flex-1 space-y-3">
          <p class="text-2xl md:text-3xl leading-relaxed" data-id="text-3" style="color: #3D2B1F;">Another paragraph.</p>
        </div>
        <div class="flex-1">
          <img alt="" class="w-full rounded-3xl shadow-md" data-id="img-2" src="images/img-2.jpg" />
        </div>
      </div>
    </div>
  </section>
</div>
```

### Template: Poem / Song Page (with star decorations)

For poems, songs, or rhymes — use decorative stars and a centered layout:

```html
<div class="container content mx-auto flex min-h-screen w-full max-w-none items-start justify-center px-4 py-6"
    data-background-color="#FFF0E6" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="text_only" data-text-color="#3D2B1F"
      id="simple-main" role="article">
    <div class="mx-auto w-full max-w-6xl space-y-4">
      <div class="relative rounded-3xl p-6 shadow-sm" style="background: rgba(255, 255, 255, 0.7);">
        <!-- Star decorations -->
        <div class="absolute top-2 right-4 text-3xl" style="color: #F5C542;">&#9733;</div>
        <div class="absolute top-8 right-12 text-xl" style="color: #F4A7B9;">&#9733;</div>
        <div class="absolute top-4 right-24 text-2xl" style="color: #7B68AE;">&#9733;</div>
        <div class="absolute bottom-4 left-4 text-2xl" style="color: #5BACDB;">&#9733;</div>
        <div class="absolute bottom-8 left-12 text-lg" style="color: #F5A623;">&#9733;</div>
        <!-- Title -->
        <h1 class="text-4xl md:text-5xl font-bold leading-tight mb-4" data-id="title" style="color: #8B2252;">Poem Title</h1>
        <!-- Stanzas -->
        <div class="space-y-4">
          <div class="space-y-1">
            <p class="text-2xl md:text-3xl leading-relaxed" data-id="line-1" style="color: #3D2B1F;">First line of poem</p>
            <p class="text-2xl md:text-3xl leading-relaxed" data-id="line-2" style="color: #3D2B1F;">Second line of poem</p>
            <p class="text-2xl md:text-3xl leading-relaxed" data-id="line-3" style="color: #3D2B1F;">Third line of poem</p>
            <p class="text-2xl md:text-3xl leading-relaxed" data-id="line-4" style="color: #3D2B1F;">Fourth line of poem</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
```

### Template: Text and Image Side by Side (reusable inner block)

```html
<div class="mx-auto w-full max-w-6xl space-y-4">
  <div class="flex flex-col md:flex-row gap-4 items-start">
    <div class="flex-1 space-y-3">
      <!-- text elements -->
    </div>
    <div class="flex-1">
      <img class="w-full rounded-3xl shadow-md" data-id="ID" src="images/ID.jpg" alt="" />
    </div>
  </div>
</div>
```

### Template: Table of Contents

Use this EXACT structure for table of contents pages:

```html
<div class="container content mx-auto flex min-h-screen w-full max-w-none items-start justify-center px-4 py-6"
    data-background-color="#F5F0FA" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="table_of_contents" data-text-color="#3D2B1F"
      id="simple-main" role="article">
    <div class="mx-auto w-full max-w-4xl space-y-4">
      <!-- Background image (if provided) -->
      <div class="relative rounded-3xl overflow-hidden shadow-md">
        <img alt="" class="w-full" data-id="IMG_ID" src="images/IMG_ID.jpg"/>
        <!-- Overlay card -->
        <div class="absolute inset-0 flex items-center justify-center p-4">
          <div class="w-full max-w-3xl rounded-3xl p-6 shadow-md" style="background: rgba(255, 255, 255, 0.88);">
            <!-- Title -->
            <div class="text-center mb-6">
              <h1 class="text-4xl md:text-5xl font-extrabold leading-tight" data-id="TITLE_ID" style="color: #8B2252;">Book Title</h1>
              <h2 class="text-2xl md:text-3xl font-semibold mt-2" data-id="SUBTITLE_ID" style="color: #3D8B37;">Table of Contents</h2>
            </div>
            <!-- Entries -->
            <div class="space-y-3">
              <div class="flex items-baseline gap-2">
                <p class="text-xl font-bold whitespace-nowrap" data-id="CH1_LABEL" style="color: #5BACDB;">Lesson 1</p>
                <p class="text-xl font-medium flex-1" data-id="CH1_TITLE" style="color: #3D2B1F;">Lesson Title</p>
                <span class="border-b-2 border-dotted flex-1 mx-2" style="border-color: #d1d5db;"></span>
                <p class="text-xl font-bold" data-id="CH1_PAGE" style="color: #8B2252;">2</p>
              </div>
              <!-- Repeat for each lesson -->
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
```

**Table of Contents Entry Row (repeat for each lesson):**

```html
<div class="flex items-baseline gap-2">
  <p class="text-xl font-bold whitespace-nowrap" data-id="CHAPTER_LABEL_ID" style="color: #5BACDB;">Lesson 1</p>
  <p class="text-xl font-medium" data-id="CHAPTER_TITLE_ID" style="color: #3D2B1F;">The Music Class</p>
  <span class="border-b-2 border-dotted flex-1 mx-2" style="border-color: #d1d5db;"></span>
  <p class="text-xl font-bold" data-id="PAGE_NUMBER_ID" style="color: #8B2252;">2</p>
</div>
```

**Important for Table of Contents:**
- Use `text-xl` for entries (larger than default for young readers)
- Use `font-bold` for lesson numbers and page numbers
- Title should be `text-4xl md:text-5xl`
- Subtitle should be `text-2xl md:text-3xl`
- Use subtle gray dotted line separator
- Keep the card spacious with `max-w-3xl`

---

## General Rules

1. **Page background via `data-background-color` ONLY** — never add `style="background: ..."` or `bg-*` classes to any element. The system reads `data-background-color` from the outer container and applies it to the body. Use soft palette tones like `#FFF5EB`, `#FFF0E6`, `#F0F7FD`, `#F5F0FA`, `#F0F8EF`.
2. **ALWAYS use side-by-side layout** when both text and images are present.
3. **Alternate image placement** — image on left for odd pages, image on right for even pages (or vice versa).
4. **Star decorations ONLY on poem/song/activity pages** — no other decorative elements.
5. **Use large text** — all body text must be `text-2xl md:text-3xl` minimum.
6. **No borders on images** — use only rounded corners and soft shadows.
7. **No colored borders on cards** — use only frosted glass backgrounds (`rgba(255, 255, 255, 0.7)`).
8. **No dot dividers** — if sections need separation, use simple spacing (`space-y-4`).
9. **Content may extend beyond viewport** — scrolling is acceptable. Pack content densely.
10. **Rounded corners everywhere** — use `rounded-3xl` on cards, images, and containers.
11. **Heading colors** — use maroon (#8B2252) or green (#3D8B37) for headings, never plain black.
