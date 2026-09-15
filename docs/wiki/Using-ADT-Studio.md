# Using ADT Studio

This guide walks you through every step of converting a print textbook PDF into a finished Accessible Digital Textbook (ADT) using ADT Studio.

---

## Prerequisites

Before you begin you will need:

| Requirement | Notes |
|-------------|-------|
| **A PDF of the textbook** | Clean, machine-readable PDFs work best. Scanned image-only PDFs will produce lower-quality results. |
| **An OpenAI API key** | ADT Studio uses OpenAI models (e.g. GPT-4o) for content extraction and generation. Get one at [platform.openai.com](https://platform.openai.com/). |
| **A running ADT Studio instance** | See [Getting Started](#getting-started) below. |

---

## Getting Started

### Option A — Docker (recommended)

The quickest way to run ADT Studio. All you need is [Docker](https://docs.docker.com/get-docker/).

```bash
# Download the docker-compose.yml from the latest release, then:
docker compose up          # starts on http://localhost:8080
```

Or with a single command (no compose file):

```bash
docker run -p 8080:80 -v ./books:/app/books ghcr.io/unicef/adt-studio:latest
```

Open your browser at **http://localhost:8080**.

### Option B — Windows one-click launcher

Download `windows-setup-and-run.bat` from the [latest release](https://github.com/unicef/adt-studio/releases/latest) and double-click it. The script checks prerequisites, clones the repository, and opens the application automatically.

### Option C — Desktop app

Download the installer for your operating system from the [latest release](https://github.com/unicef/adt-studio/releases/latest) and run it. The desktop app bundles everything — no Docker, no separate server.

---

## Step 1 — Set Your API Key

The first time you open ADT Studio, click the **Settings** icon (gear icon, top-right corner) and paste your OpenAI API key. The key is stored only in your browser's local storage and is sent directly to OpenAI — it is never stored on the server.

> **Team deployments**: If your administrator has configured a server-level API key, you can skip this step.

---

## Step 2 — Create a New Book

1. Click **New Book** on the home screen.
2. Enter a **label** for the book — a short, unique identifier using letters, numbers, hyphens, or underscores (e.g. `grade-5-science-2024`). The label becomes the folder name on disk.
3. **Upload the PDF** — drag and drop or click to browse.
4. Click **Create**.

ADT Studio creates a new book directory and stores the PDF alongside its extracted data. You can come back to this book at any time — all progress is saved automatically.

---

## Step 3 — Configure the Book (optional)

Each book can have its own configuration that overrides the global settings. Click the **Settings** tab inside the book to customise:

| Setting | What it controls |
|---------|-----------------|
| **Target languages** | Which languages to translate the content into |
| **Render strategy** | How each page type is laid out in HTML (template-based or LLM-generated) |
| **LLM models** | Which OpenAI model to use for each pipeline step |
| **Image filters** | Minimum image size, meaningfulness threshold |

For most books, the default configuration works well and no changes are needed.

---

## Step 4 — Run the Pipeline

The pipeline is organised into stages that run in sequence. Each stage can be triggered independently or you can click **Run All** to run the entire pipeline from start to finish.

### Pipeline Stages

| Stage | What it does |
|-------|-------------|
| **Extract** | Renders every PDF page to a high-resolution image, extracts the raw text, identifies and crops images |
| **Storyboard** | Uses an LLM to read the visual layout of each page and produce a structured content tree; renders each section as accessible HTML |
| **Quizzes** | Generates interactive questions from the book's reading sections |
| **Captions** | Generates alt-text descriptions for every meaningful image |
| **Glossary** | Extracts and defines key vocabulary terms from the book |
| **Translate** | Translates the full text catalog into every configured target language |
| **Speech** | Generates text-to-speech audio for every section using the translated text |
| **Package** | Bundles everything into a self-contained offline web application |

### Running a stage

Click **Run** next to any stage. A progress bar shows live updates as each step within the stage completes. You can monitor individual step progress and view LLM call details by expanding a stage card.

> **LLM caching**: ADT Studio caches every LLM call by hashing the inputs. If you re-run a stage after fixing a configuration error, only the steps with changed inputs will hit the API again — unchanged steps return instantly from cache.

### Reviewing and re-running

After each stage completes, you can inspect the results directly in the UI:

- **Storyboard** — preview each page as rendered HTML; flag pages that need manual review; fix the page order and remove pages that do not belong in the book (see [Step 5](#step-5--fix-the-page-order))
- **Quizzes** — read through generated questions and answers
- **Glossary** — check extracted terms
- **Captions** — review image alt-text

If you are not satisfied with any output, adjust the configuration or prompt and re-run that stage. Because of entity versioning, the previous version is always preserved — you can roll back at any time.

---

## Step 5 — Fix the Page Order

Source PDFs do not always present pages in the order a reader should meet them: front matter can be out of sequence, a spread can be split the wrong way round, and some pages — colophons, blank sheets, publisher notices — do not belong in the finished book at all.

You can fix both in the **Storyboard** stage, in the page list down the left-hand side.

### Reordering pages

There are three ways to move a page, and they do the same thing:

| How | What to do |
|-----|-----------|
| **Drag and drop** | Click **Rearrange** in the page-list header (it turns violet), then drag any row. A line shows where the row will land. Click it again to leave rearrange mode. |
| **The row menu** | Click the **⋮** button on a row and choose **Move up** or **Move down**. No need to turn on **Rearrange**. |
| **Keyboard** | Focus a row and press **Alt+↑** or **Alt+↓**. Plain arrow keys just move between rows, so you cannot reorder the book by accident. |

Dragging is off until you ask for it because the page list is mostly something you click through, and an accidental drag would quietly rewrite the book.

### Saving, or changing your mind

Moves are held as a **pending change**, exactly like every other edit in ADT Studio. Rearrange as many pages as you like; nothing is written until you press **Save** in the bar at the bottom of the screen, and **Discard** puts everything back the way the book was. The whole rearrangement is saved as **one** version, not one version per page you moved.

If you try to leave the page with moves still pending, ADT Studio will ask before letting the change go.

### Book pages and PDF pages are different things

Once you reorder a book, two different page numbers exist, and the page list shows both:

- **Book page** — where the page now falls for the reader. This renumbers as you rearrange.
- **PDF *n*** — which sheet the page came from in the source PDF. This never changes: it is where the content came from, not where it sits.

The same two appear as the **Book page** and **PDF page** columns in the overview table (the small table icon in the stage header, tooltip **Overview**). Where a page's printed number differs from its sheet number — as on unnumbered front matter — hovering the cell shows the printed one.

### Undoing a rearrangement

The **v*N*** button beside **Rearrange** holds the full history of the page order. Pick any earlier version to roll the order back to it.

The list also offers **Original — PDF order**, which puts every page back where the source PDF had it. You need this more often than it sounds: the page order is only stored once you first rearrange something, so even the earliest version in the history is already a rearrangement. This is the only route back to the book's original sequence — and it is saved as a new version, so the arrangement you just undid is still one entry up if you want it back.

Rolling back the order **does not** touch your captions, glossary, translations or generated speech. It only invalidates the packaged bundle and the accessibility assessment, which are the two things that depend on the sequence — so re-run **Package** afterwards.

### Removing a page from the book

Some pages should not reach the reader. On a row's **⋮** menu:

- **Remove from book** takes the page out of the finished book while keeping everything about it. The row stays in the list, greyed out and struck through, with a **–** instead of a book page number, and the pages after it renumber. Nothing is destroyed.
- **Add back to book** — the same menu item, on a page you have removed — puts it back **in its original place**, not at the end.
- **Delete permanently** destroys the section and its content. It cannot be undone, and the confirmation says so; prefer **Remove from book** unless you are certain.

Putting a page back is usually instant, because its HTML was kept. The exception is a page that was already out of the book the last time **Storyboard** ran: that page has no HTML to restore, so ADT Studio re-renders just that one section, which needs a working API key and takes a moment.

### When reordering is unavailable

The controls grey out while a stage is running that changes what the book is made of — **Extract**, **Page Structuring**, **Web Rendering** or **Quiz Generation** — because those rewrite the very pages and quiz slots an order refers to. The tooltip names the step responsible. Stages that only add material to pages that already have their place, such as Captions, Glossary, Translate and Speech, do not block rearranging.

### What follows the order

Everything downstream reads the same order, so preview and export cannot disagree. The reader's navigation, the table of contents, quiz placement, the EPUB spine and the packaged `pages.json` all follow the sequence you set. **Filenames never change** — each page's file is named after its identity, not its position — so reordering a book does not invalidate any link into it.

---

## Step 6 — Review Accessibility

ADT Studio's pipeline builds in accessibility from the start, but a human review pass is recommended before publication. Things to check:

- **Image alt-text** — are the generated captions accurate and meaningful?
- **Heading structure** — does the heading hierarchy on each page make sense for screen reader navigation?
- **Activity instructions** — are quiz questions clear and unambiguous?
- **Language quality** — are translations accurate for the target audience?

---

## Step 7 — Package and Download

Once all stages have completed:

1. Open the **Package** stage.
2. Click **Run** to generate the final output bundle.
3. When packaging is complete, click **Download** to save the bundle as a `.zip` file.

The zip contains a complete, self-contained web application — HTML, CSS, JavaScript, images, audio, and an offline manifest. It can be unzipped and opened directly in a browser with no server required, or deployed to any web host.

---

## Understanding the Output Structure

The packaged output looks like this:

```
your-book-name/
├── index.html           # Entry point — redirects to the first page in reading order
├── pg001_sec001.html    # One HTML file per page, named after the page's identity
├── pg002_sec001.html    #   (never after its position — see below)
├── …
├── assets/              # CSS, JavaScript and fonts
├── images/              # Extracted and cropped images
├── cover.png            # Cover image
├── imsmanifest.xml      # SCORM manifest
└── content/
    ├── pages.json       # The reading order — the sequence the reader follows
    ├── toc.json         # Table of contents
    ├── navigation/      # Navigation markup
    └── i18n/<lang>/     # Per-language text, audio, timings and glossary
```

Two things here follow directly from the page order:

- **`index.html` is a redirect**, not a page. It points at whichever page is *first in the book*, so it keeps working when you rearrange.
- **Page filenames never change.** Each file is named for the page's identity, not its position, so reordering the book renames nothing and never breaks a link into it. `content/pages.json` is what carries the sequence.

---

## Frequently Asked Questions

**How long does processing take?**
Processing time depends on the number of pages, the configured LLM models, and your OpenAI API rate limits. A 100-page textbook typically takes 20–60 minutes for a full run. LLM caching makes re-runs much faster.

**What if a page is not rendered correctly?**
You can re-run individual stages after adjusting configuration. The previous version of each entity is always preserved, so you can compare results.

**The pages are in the wrong order — do I have to re-run anything?**
No. Rearranging is an edit, not a pipeline run: see [Step 5](#step-5--fix-the-page-order). It costs nothing and makes no LLM calls. Re-run **Package** afterwards so the downloaded bundle picks the new order up.

**I removed a page by mistake. Is it gone?**
Not if you used **Remove from book** — the page keeps its slot in the list, greyed out, and **Add back to book** returns it to exactly where it was. Only **Delete permanently** destroys content, and it asks first.

**Will reordering lose my translations or audio?**
No. Changing the page order only invalidates the packaged bundle and the accessibility assessment. Captions, glossary, translations and generated speech are attached to the pages themselves and are unaffected.

**Can I process a book in multiple sessions?**
Yes. All progress is saved automatically. Close the browser and come back — the book will be exactly where you left it.

**Does the source PDF need to be a specific format?**
ADT Studio works best with native (not scanned) PDFs where the text layer is embedded. Scanned PDFs will still work but the quality of extraction depends on the quality of the scan.

**Is my data sent to OpenAI?**
Textbook content (page images and extracted text) is sent to OpenAI's API for processing. You are subject to OpenAI's data usage and privacy policies. If your content is sensitive or subject to data residency requirements, review these policies before use.

---

## Next Steps

- [Hosting the Output](Hosting-the-Output) — learn how to publish your finished ADT
