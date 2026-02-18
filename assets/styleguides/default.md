# Styleguide

## Required Container Structure

Every page MUST use this exact outer container:

```html
<div class="container content mx-auto flex min-h-screen w-full items-center justify-center px-6 py-12"
    data-background-color="BACKGROUND_COLOR" id="content">
  <section class="w-full" data-id="SECTION_ID" data-section-type="SECTION_TYPE" data-text-color="TEXT_COLOR"
      id="simple-main" role="article">
    <!-- Content goes here -->
  </section>
</div>
```

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
      <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-id="CHAPTER_WORD_ID">CHAPTER</h1>
      <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-id="CHAPTER_NUMBER_ID">1</h1>
    </div>
    <div class="pt-2">
      <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-id="CHAPTER_TITLE_ID">Chapter Title Here</h1>
    </div>
  </div>
</div>
```

### Content Card (for body text)

Wrap body paragraphs in this card:

```html
<div class="space-y-4 rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
  <p class="text-lg md:text-xl leading-relaxed" data-id="ID">Paragraph text</p>
  <p class="text-lg md:text-xl leading-relaxed" data-id="ID">More text</p>
</div>
```

### Text Group (for paragraphs without card)

```html
<div class="space-y-3">
  <p class="text-lg md:text-xl leading-relaxed" data-id="ID">Paragraph text</p>
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
  <section class="w-full" data-id="SECTION_ID" data-section-type="text_and_single_image" data-text-color="#000000"
      id="simple-main" role="article">
    <div class="mx-auto w-full max-w-5xl space-y-8">
      <!-- Chapter Badge -->
      <div class="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div class="flex items-start gap-6">
          <div class="shrink-0 rounded-3xl bg-purple-200 px-6 py-5 shadow-sm">
            <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-id="chapter-word">CHAPTER</h1>
            <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-id="chapter-num">1</h1>
          </div>
          <div class="pt-2">
            <h1 class="text-3xl md:text-4xl font-bold leading-tight" data-id="chapter-title">The Nile River</h1>
          </div>
        </div>
      </div>
      <!-- Content Card -->
      <div class="space-y-4 rounded-3xl bg-white/80 p-6 shadow-sm ring-1 ring-black/5">
        <p class="text-lg md:text-xl leading-relaxed" data-id="text-1">Paragraph one.</p>
        <p class="text-lg md:text-xl leading-relaxed" data-id="text-2">Paragraph two.</p>
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
  <section class="w-full" data-id="SECTION_ID" data-section-type="text_and_images" data-text-color="#000000"
      id="simple-main" role="article">
    <div class="mx-auto w-full max-w-5xl space-y-8">
      <!-- Text Group -->
      <div class="space-y-3">
        <p class="text-lg md:text-xl leading-relaxed" data-id="text-1">First paragraph.</p>
        <p class="text-lg md:text-xl leading-relaxed" data-id="text-2">Second paragraph.</p>
      </div>
      <!-- Image -->
      <img alt="" class="w-full rounded-2xl shadow-lg" data-id="img-1" src="images/img-1.jpg"/>
      <!-- More Text -->
      <div class="space-y-3">
        <p class="text-lg md:text-xl leading-relaxed" data-id="text-3">Another paragraph.</p>
      </div>
      <!-- Another Image -->
      <img alt="" class="w-full rounded-2xl shadow-lg" data-id="img-2" src="images/img-2.jpg"/>
    </div>
  </section>
</div>
```

### Template: Text and Image Side by Side

```html
<div class="mx-auto w-full max-w-5xl space-y-8">
  <div class="flex flex-col md:flex-row gap-8">
    <div class="flex-1 space-y-4">
      <!-- text elements -->
    </div>
    <div class="flex-1">
      <img class="w-full rounded-2xl shadow-lg" data-id="ID" src="images/ID.jpg" alt="" />
    </div>
  </div>
</div>
```

### Template: Table of Contents (EXACT - use for section_type "table_of_contents")

Use this EXACT structure for table of contents pages:

```html
<div class="container content mx-auto flex min-h-screen w-full items-center justify-center px-6 py-12"
    data-background-color="#f3f0f7" id="content">
  <section class="w-full" data-id="SECTION_ID" data-section-type="table_of_contents" data-text-color="#2c2c2c"
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
