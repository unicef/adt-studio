# Styleguide — Kid-Friendly Science Reader

A bright, approachable elementary science textbook style designed for young readers. The pages feel clean and spacious, using bold green chapter markers, rounded vocabulary panels, large readable text, and full-width documentary photos.

## Color Palette

| Role | Hex Code | Usage |
|---|---:|---|
| Page background | `#FFFFFF` | Main page background across all interior pages |
| Primary green | `#0B8D5A` | Chapter header band, section headings, badge numbers, callout headers, emphasized vocabulary terms |
| Secondary green ring | `#6FAE8A` | Circular chapter badge border/ring |
| Pale sage panel | `#D5E1D8` | Callout body background for Vocabulary / Big Question boxes |
| Heading/text on dark green | `#FFFFFF` | Chapter title and white text inside dark green header areas |
| Body text | `#111111` | Main running text |
| Strong caption text | `#1A1A1A` | Image captions and associated text |
| Warm accent yellow | `#F2E36D` | “Big Question” title text on green callout header |
| Soft neutral border | `#E5E7EB` | Optional subtle preview/card separators; not dominant in source but safe for structural use |

## Required Container Structure

Use this exact outer structure on every page. Keep spacing, alignment, and overall frame identical; only background/text colors may vary.

```html
<div class="container content mx-auto flex min-h-screen w-full items-start justify-center px-6 py-12"
    data-background-color="#FFFFFF" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="SECTION_TYPE" data-text-color="#111111"
      id="simple-main">
    <!-- Content goes here -->
  </section>
</div>
```

Keep content top-aligned with `items-start`. Reserve vertical centering only for cover/title pages.

## Inner Container

Use one consistent centered reading column on every page:

```html
<div class="mx-auto w-full max-w-5xl px-2 sm:px-4">
  <!-- Page content -->
</div>
```

Rules:
- Always use `mx-auto w-full max-w-5xl`
- Keep the same horizontal padding on every page
- Do not switch to narrower `max-w-*` values for text-heavy pages
- Full-bleed color bands may span wider, but their inner content must still sit inside the same `max-w-5xl` column

## Text Styles

Use only these font families:
- Headings: `Kalam`, fallback `cursive`
- Body/captions/instructions: `Acme`, fallback `sans-serif`

Use the fixed accessible type scale classes exactly as provided. Do **not** add competing `text-*` size utilities to these text-style examples.

| text_type | HTML Element | Tailwind Classes |
|---|---|---|
| `book_title` | `h1` | `adt-h1 font-bold leading-tight tracking-tight text-white` + `style="font-family: 'Kalam', cursive;"` |
| `book_subtitle` | `h2` | `adt-h2 font-bold leading-snug text-[#0B8D5A]` + `style="font-family: 'Kalam', cursive;"` |
| `chapter_title` | `h1` | `adt-h1 font-bold leading-tight tracking-tight text-white` + `style="font-family: 'Kalam', cursive;"` |
| `section_heading` | `h2` | `adt-h2 font-bold leading-snug text-[#0B8D5A]` + `style="font-family: 'Kalam', cursive;"` |
| `activity_title` | `h3` | `adt-h3 font-bold leading-snug text-white` or `text-[#0B8D5A]` depending on background + `style="font-family: 'Kalam', cursive;"` |
| `section_text` | `p` | `adt-body font-normal leading-[1.55] text-[#111111]` + `style="font-family: 'Acme', sans-serif;"` |
| `instruction_text` | `p` | `adt-body font-normal leading-[1.55] text-[#111111]` + `style="font-family: 'Acme', sans-serif;"` |
| `standalone_text` | `p` | `adt-body font-normal leading-[1.55] text-[#111111]` + `style="font-family: 'Acme', sans-serif;"` |
| `image_associated_text` | `figcaption` | `adt-caption font-semibold leading-snug text-[#1A1A1A]` + `style="font-family: 'Acme', sans-serif;"` |

### Text Style Examples

```html
<h1 class="adt-h1 font-bold leading-tight tracking-tight text-white" data-id="ID" style="font-family: 'Kalam', cursive;">The Atmosphere and Air Pressure</h1>

<h2 class="adt-h2 font-bold leading-snug text-[#0B8D5A]" data-id="ID" style="font-family: 'Kalam', cursive;">Water Falls to Earth as Precipitation</h2>

<h3 class="adt-h3 font-bold leading-snug text-[#0B8D5A]" data-id="ID" style="font-family: 'Kalam', cursive;">Vocabulary</h3>

<p class="adt-body font-normal leading-[1.55] text-[#111111]" data-id="ID" style="font-family: 'Acme', sans-serif;">Weather is what the air outside is like at any one time and place.</p>

<figcaption class="adt-caption font-semibold leading-snug text-[#1A1A1A]" data-id="ID" style="font-family: 'Acme', sans-serif;">Several inches of snow can fall when there is enough water in the atmosphere and the temperature is low enough.</figcaption>
```

### Inline Emphasis Within Body Text

Vocabulary or science terms embedded in paragraphs should be styled as:

```html
<span class="font-bold text-[#0B8D5A]" data-id="ID" style="font-family: 'Acme', sans-serif;">atmosphere</span>
```

## Image Styles

| Use Case | HTML Element | Tailwind Classes |
|---|---|---|
| Single full-width image | `img` | `w-full h-auto rounded-none object-cover` |
| Multiple images side by side | `div` wrapping `img` | `grid grid-cols-2 gap-6 items-start max-md:grid-cols-1` |
| Image grid container | `div` | `grid grid-cols-2 gap-6 md:grid-cols-3` |
| Image with caption below | `figure` | `mt-6 w-full` |
| Image with side caption | `figure` | `mt-6 grid grid-cols-[minmax(0,1fr)_16rem] gap-4 items-end max-md:grid-cols-1` |

Image rules:
- Use large, content-filling images; never thumbnail-sized content photos
- Default image corners are square or nearly square; avoid decorative rounding on textbook photos
- Captions sit directly below or beside images in bold/dark text
- Keep figure spacing generous (`mt-6` or `mt-8`)

## Components

### Chapter Badge

```html
<div class="flex justify-end" data-id="ID">
  <div class="flex h-40 w-40 flex-col items-center justify-center rounded-full border-[10px] border-[#6FAE8A] bg-white text-center shadow-sm">
    <div class="adt-h3 font-bold text-[#0B8D5A]" style="font-family: 'Kalam', cursive;">Chapter</div>
    <div class="adt-h1 font-bold leading-none text-[#0B8D5A]" style="font-family: 'Kalam', cursive;">1</div>
  </div>
</div>
```

### Content Card

Use sparingly. The original book is mostly open white space, but this component is appropriate for contained definitions or highlighted text.

```html
<div class="rounded-[2rem] bg-[#D5E1D8] overflow-hidden shadow-none" data-id="ID">
  <div class="rounded-t-[2rem] bg-[#0B8D5A] px-6 py-4">
    <h3 class="adt-h3 font-bold text-white" style="font-family: 'Kalam', cursive;">Vocabulary</h3>
  </div>
  <div class="px-6 py-5">
    <p class="adt-body font-normal leading-[1.5] text-[#111111]" style="font-family: 'Acme', sans-serif;">
      <span class="font-bold text-[#0B8D5A]">weather, n.</span> what the air outside is like at any given time and place
    </p>
  </div>
</div>
```

### Text Group

```html
<div class="space-y-6" data-id="ID">
  <p class="adt-body font-normal leading-[1.55] text-[#111111]" style="font-family: 'Acme', sans-serif;">Suppose a friend asked you what the weather is like today. How would you know?</p>
  <p class="adt-body font-normal leading-[1.55] text-[#111111]" style="font-family: 'Acme', sans-serif;">You can observe the weather. You can look outside and measure what you see.</p>
</div>
```

## Page Templates

### Chapter Start Page

```html
<div class="container content mx-auto flex min-h-screen w-full items-start justify-center px-6 py-12"
    data-background-color="#FFFFFF" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="chapter_start" data-text-color="#111111"
      id="simple-main">

    <div class="-mx-6 bg-[#0B8D5A] px-6 py-10 sm:py-12">
      <div class="mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)_220px] items-start gap-8 px-2 sm:px-4 max-md:grid-cols-1">
        <h1 class="adt-h1 max-w-2xl font-bold leading-tight tracking-tight text-white" data-id="ID" style="font-family: 'Kalam', cursive;">The Atmosphere and Air Pressure</h1>
        <div class="flex justify-center md:justify-end" data-id="ID">
          <div class="flex h-40 w-40 flex-col items-center justify-center rounded-full border-[10px] border-[#6FAE8A] bg-white text-center">
            <div class="adt-h3 font-bold text-[#0B8D5A]" style="font-family: 'Kalam', cursive;">Chapter</div>
            <div class="adt-h1 font-bold leading-none text-[#0B8D5A]" style="font-family: 'Kalam', cursive;">1</div>
          </div>
        </div>
      </div>
    </div>

    <div class="mx-auto w-full max-w-5xl px-2 sm:px-4 pt-8">
      <aside class="float-right w-[34%] ml-8 mb-6 max-lg:float-none max-lg:w-full max-lg:ml-0" data-id="ID">
        <div class="overflow-hidden rounded-[1.75rem] bg-[#D5E1D8]">
          <div class="bg-[#0B8D5A] px-6 py-4">
            <h3 class="adt-h3 font-bold text-[#F2E36D]" style="font-family: 'Kalam', cursive;">Big Question</h3>
          </div>
          <div class="px-6 py-5">
            <p class="adt-body font-normal leading-[1.45] text-[#111111]" data-id="ID" style="font-family: 'Acme', sans-serif;">What is the atmosphere, and what is weather?</p>
          </div>
        </div>
      </aside>

      <p class="adt-body font-normal leading-[1.55] text-[#111111]" data-id="ID" style="font-family: 'Acme', sans-serif;">Suppose a friend asked you, “What is the weather like today?” What would you say?</p>
      <p class="mt-6 adt-body font-normal leading-[1.55] text-[#111111]" data-id="ID" style="font-family: 'Acme', sans-serif;"> <span class="font-bold text-[#0B8D5A]">Weather</span> is what the air outside is like at any one time and place.</p>
      <div class="clear-both"></div>
    </div>

  </section>
</div>
```

### Regular Content Page with Callout/Sidebar

Use floated sidebars so body text wraps naturally and continues full width below.

```html
<div class="container content mx-auto flex min-h-screen w-full items-start justify-center px-6 py-12"
    data-background-color="#FFFFFF" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="content" data-text-color="#111111"
      id="simple-main">

    <div class="mx-auto w-full max-w-5xl px-2 sm:px-4">
      <h2 class="adt-h2 mb-8 font-bold leading-snug text-[#0B8D5A]" data-id="ID" style="font-family: 'Kalam', cursive;">Water Falls to Earth as Precipitation</h2>

      <aside class="float-right w-[34%] ml-8 mb-6 max-lg:float-none max-lg:w-full max-lg:ml-0" data-id="ID">
        <div class="overflow-hidden rounded-[1.75rem] bg-[#D5E1D8]">
          <div class="bg-[#0B8D5A] px-6 py-4">
            <h3 class="adt-h3 font-bold text-white" style="font-family: 'Kalam', cursive;">Vocabulary</h3>
          </div>
          <div class="space-y-4 px-6 py-5">
            <p class="adt-body font-normal leading-[1.45] text-[#111111]" style="font-family: 'Acme', sans-serif;">
              <span class="font-bold text-[#0B8D5A]">water vapor, n.</span> the gas form of water
            </p>
            <p class="adt-body font-normal leading-[1.45] text-[#111111]" style="font-family: 'Acme', sans-serif;">
              <span class="font-bold text-[#0B8D5A]">precipitation, n.</span> water that falls from the sky in the form of rain, snow, sleet, or hail
            </p>
          </div>
        </div>
      </aside>

      <p class="adt-body font-normal leading-[1.55] text-[#111111]" data-id="ID" style="font-family: 'Acme', sans-serif;">One of the gases that occurs in our atmosphere is <span class="font-bold text-[#0B8D5A]">water vapor</span>. Water in its gas form is called water vapor.</p>
      <p class="mt-6 adt-body font-normal leading-[1.55] text-[#111111]" data-id="ID" style="font-family: 'Acme', sans-serif;">Sometimes air contains a lot of water vapor. At other times it contains less. When water vapor cools, it may change to tiny droplets of liquid water.</p>
      <p class="mt-6 adt-body font-normal leading-[1.55] text-[#111111]" data-id="ID" style="font-family: 'Acme', sans-serif;">This liquid water may fall from the sky. This is <span class="font-bold text-[#0B8D5A]">precipitation</span>. Precipitation can take the form of rain, snow, sleet, or hail.</p>
      <div class="clear-both"></div>

      <figure class="mt-8 grid grid-cols-[minmax(0,1fr)_16rem] gap-4 items-end max-md:grid-cols-1" data-id="ID">
        <img class="w-full h-auto object-cover" data-id="ID" src="images/ID.jpg" alt="Snowplow driving through snowfall" />
        <figcaption class="adt-caption font-semibold leading-snug text-[#1A1A1A]" data-id="ID" style="font-family: 'Acme', sans-serif;">Several inches of snow can fall when there is enough water in the atmosphere and the temperature is low enough.</figcaption>
      </figure>
    </div>

  </section>
</div>
```

### Text and Image Side by Side

```html
<div class="container content mx-auto flex min-h-screen w-full items-start justify-center px-6 py-12"
    data-background-color="#FFFFFF" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="image_text" data-text-color="#111111"
      id="simple-main">

    <div class="mx-auto grid w-full max-w-5xl grid-cols-[1fr_1.1fr] gap-8 px-2 sm:px-4 max-md:grid-cols-1">
      <div class="space-y-6">
        <h2 class="adt-h2 font-bold leading-snug text-[#0B8D5A]" data-id="ID" style="font-family: 'Kalam', cursive;">Water in the Atmosphere</h2>
        <p class="adt-body font-normal leading-[1.55] text-[#111111]" data-id="ID" style="font-family: 'Acme', sans-serif;">There is water on Earth’s surface. There is water in the atmosphere, too, and even underground.</p>
        <p class="adt-body font-normal leading-[1.55] text-[#111111]" data-id="ID" style="font-family: 'Acme', sans-serif;">All this water moves from Earth’s surface to the atmosphere and then back again all the time.</p>
      </div>
      <figure class="w-full" data-id="ID">
        <img class="w-full h-auto object-cover" data-id="ID" src="images/ID.jpg" alt="Green forest scene" />
        <figcaption class="adt-caption mt-3 font-semibold leading-snug text-[#1A1A1A]" data-id="ID" style="font-family: 'Acme', sans-serif;">If a place has many green plants, that is a sign that it probably rains often there.</figcaption>
      </figure>
    </div>

  </section>
</div>
```

### Table of Contents

```html
<div class="container content mx-auto flex min-h-screen w-full items-start justify-center px-6 py-12"
    data-background-color="#FFFFFF" id="content">
  <section class="w-full" data-section-id="SECTION_ID" data-section-type="table_of_contents" data-text-color="#111111"
      id="simple-main">

    <div class="mx-auto w-full max-w-5xl px-2 sm:px-4">
      <h1 class="adt-h1 mb-10 font-bold leading-tight text-[#0B8D5A]" data-id="ID" style="font-family: 'Kalam', cursive;">Contents</h1>

      <div class="space-y-6" data-id="ID">
        <div class="flex items-end gap-4 border-b border-[#E5E7EB] pb-3">
          <h2 class="adt-h2 font-bold text-[#0B8D5A]" style="font-family: 'Kalam', cursive;">1. The Atmosphere and Air Pressure</h2>
          <span class="ml-auto adt-body text-[#111111]" style="font-family: 'Acme', sans-serif;">1</span>
        </div>
        <div class="flex items-end gap-4 border-b border-[#E5E7EB] pb-3">
          <h2 class="adt-h2 font-bold text-[#0B8D5A]" style="font-family: 'Kalam', cursive;">2. Water in the Atmosphere</h2>
          <span class="ml-auto adt-body text-[#111111]" style="font-family: 'Acme', sans-serif;">5</span>
        </div>
        <div class="flex items-end gap-4 border-b border-[#E5E7EB] pb-3">
          <h2 class="adt-h2 font-bold text-[#0B8D5A]" style="font-family: 'Kalam', cursive;">3. Weather Changes</h2>
          <span class="ml-auto adt-body text-[#111111]" style="font-family: 'Acme', sans-serif;">13</span>
        </div>
      </div>
    </div>

  </section>
</div>
```

## General Rules

1. Use a pure white page background with strong green accents; avoid textured or tinted page fields.
2. Keep the reading column fixed at `mx-auto w-full max-w-5xl` on every page.
3. Chapter opening pages use a full-width dark green banner band at the top, but the title and badge remain aligned to the centered reading column.
4. All main headings use `Kalam`; all body text, labels, and captions use `Acme`.
5. Apply type size only through the shared `adt-*` classes for text styles; do not add conflicting Tailwind `text-*` utilities to those elements.
6. Running body text should feel large and highly readable for children, with open line spacing and generous paragraph gaps.
7. Use green bold inline emphasis for key vocabulary terms embedded in paragraphs.
8. Callout panels use a dark green header with a pale sage body and large rounded corners.
9. “Big Question” callout titles use yellow text on the dark green header; “Vocabulary” may use white.
10. For pages with sidebars, float the panel right so text wraps beside it and continues full width below; do not build a temporary two-column row that creates vertical gaps.
11. Content photos should be large and documentary in feel, usually spanning the full width of the text column or a major portion of it.
12. Photo corners are square; decorative image frames are minimal or absent.
13. Captions are bold or semibold, compact, and dark, placed directly below or beside the image.
14. Circular chapter badges should be large, high-contrast, and positioned in the upper-right zone of chapter openers.
15. Decorations are structural rather than ornamental: bold color blocks, rounded information panels, and simple geometry.
16. Preserve wide whitespace margins around text and images so pages feel uncluttered.
17. Section headings on regular pages are green and left-aligned, without extra underlines or ornaments.
18. Use subtle borders only where needed for navigation structures like contents; the source pages rely much more on spacing and color than lines.
