# Documentation authoring guide

The **`docs/`** folder here holds the **ADT Studio documentation content**. It is
rendered by the unified site app (`apps/site`) — the same app that serves the
landing page — using [fumadocs](https://fumadocs.dev) on top of TanStack Start.
The site is built as a **static SPA** and deployed to GitHub Pages.

> This guide is about **writing docs content**. For how the *site* is built,
> served, and deployed (architecture, dev, the `landing-page` deploy branch),
> see [`../README.md`](../README.md).
>
> This guide lives outside `docs/` on purpose: everything inside `docs/` is
> scanned and published, so the authoring guide sits one level up.

---

## 1. Where things live

```
apps/site/
├─ content/
│  ├─ README.md             ← this guide
│  └─ docs/                 ← all documentation content
│     ├─ en/                ← English — the source of truth
│     │  ├─ meta.json       ← sidebar order + section headers
│     │  ├─ index.mdx       ← the Overview (docs home)
│     │  ├─ install.mdx, faq.mdx, … ← individual pages
│     │  └─ pipeline/       ← a nested section (folder)
│     │     ├─ meta.json    ← the folder's title, icon, and page order
│     │     ├─ index.mdx    ← the folder's landing page ("Pipeline" overview)
│     │     └─ extract.mdx, …
│     ├─ pt-BR/             ╮  one folder per locale, mirroring en/. Add only the
│     ├─ es/                │  pages you've translated — anything missing falls
│     └─ fr/                ╯  back to English. The locale is stripped from URLs
│        └─ index.mdx          (fr/pipeline/extract.mdx → /docs/pipeline/extract).
├─ src/components/docs/     ← the docs UI (hero, cards, sidebar, search)
├─ src/lib/source.ts        ← fumadocs source + i18n config (parser 'dir')
└─ src/lib/docs-i18n.ts     ← MDX path resolver + sidebar-label translation (see §5)
```

Docs use **fumadocs i18n** with one folder per locale (`parser: 'dir'`), so a
file like `fr/pipeline/extract.mdx` is the French *variant* of `pipeline/extract`
— not a separate page. `en/` is the source of truth and the fallback. fumadocs
scans every `.md`/`.mdx` file, and each **must** have frontmatter — that's why
this guide lives in `content/`, not `content/docs/`.

---

## 2. Add a new page

1. Create a file in the English folder, e.g. `content/docs/en/my-page.mdx`.
2. Add frontmatter:
   ```mdx
   ---
   title: "My Page"
   description: "One sentence shown under the title and in search."
   icon: BookOpen        # optional — any lucide-react icon name
   ---

   Your Markdown / MDX content here.
   ```
3. List it in `en/meta.json` so it appears in the sidebar (see §3). A page not
   listed still builds and is reachable by URL, but won't show in the sidebar.

> **Adding or renaming a page? One dev step is needed for translated sidebars.**
> Sidebar/nav labels are translated from a registry in `src/lib/docs-i18n.ts`
> (`SIDEBAR_LABELS`), keyed by the English title. A brand-new title won't appear
> there, so in `es`/`fr`/`pt-BR` the **sidebar label** stays English until a
> developer adds it (the page **content** still translates normally). Ask a dev
> to add the new/renamed title to `SIDEBAR_LABELS` and run
> `pnpm --filter @adt/site extract`.

### Available MDX components

These are registered globally (see `src/components/mdx.tsx`) and can be used in
any `.mdx` file without importing:

- `<DocsHero />` — the Overview hero (headline, search, popular links)
- `<GetStartedBanner />` — the gradient "Get started" cover card
- `<WhereToBegin />` — the colored entry-point card grid
- `<Principles />` — the three-up principles row

Standard fumadocs components (Callout, Tabs, Steps, etc.) are also available —
see the [fumadocs docs](https://fumadocs.dev/docs/ui).

---

## 3. Sidebar order & sections — `meta.json`

`en/meta.json` controls order and grouping (the sidebar is always built from the
English tree). Strings wrapped in `---…---` render as **section headers**;
everything else is a page slug:

```json
{
  "pages": [
    "---Introduction---",
    "index",
    "---Get Started---",
    "install",
    "new-project",
    "---Learn---",
    "pipeline",
    "---Help---",
    "faq"
  ]
}
```

- Order in the array = order in the sidebar.
- Only listed pages appear; unlisted files are hidden.

### Folder (nested) sections

A subfolder (e.g. `pipeline/`) becomes a collapsible group. Its own `meta.json`
sets the `title`, `icon`, and child `pages`. Adding an `index.mdx` to the folder
makes the **group label itself a link** to that overview page — to get this,
**do not list `index` in the folder's `pages`** (fumadocs promotes it to the
folder's index automatically).

---

## 4. Translation — UI strings

The docs share the **landing page's language**: one locale switcher (the globe
in the top bar), persisted in `localStorage` + the `?lang=` query param. Locales
are defined once in `src/i18n/locales.ts` (`en`, `pt-BR`, `es`, `fr`).

All user-visible **UI** text (hero, cards, sidebar, search, buttons) uses
[Lingui](https://lingui.dev) macros — never hardcode visible strings:

```tsx
import { Trans, useLingui } from "@lingui/react/macro";
import { msg } from "@lingui/core/macro";

<Trans>Get started with ADT Studio</Trans>;             // JSX text
const { t } = useLingui(); t`Search the documentation…`;  // expressions
const label = msg`Quick Start`;                           // constants → i18n._(label)
```

After adding or changing any UI string:

```bash
pnpm --filter @adt/site extract     # updates src/locales/*.po
# then fill the new msgstr in es.po / pt-BR.po / fr.po
```

**CI enforces this:** `site-ci.yml` runs `extract` and fails if any string was
left unwrapped (the same check the landing page uses).

---

## 5. Translation — MDX content

UI strings live in components; the **prose inside `.mdx` files** is translated by
putting a copy under the matching **locale folder**, mirroring the `en/` tree. To
translate a page into locale `XX`, create the same path under `XX/`:

```
en/index.mdx              →  fr/index.mdx
en/install.mdx            →  fr/install.mdx
en/pipeline/extract.mdx   →  fr/pipeline/extract.mdx
```

Only translate the pages you want — **any page without a translation falls back
to English automatically**. The translated file reuses the same components; only
the Markdown prose and frontmatter (`title`, `description`) need translating,
since the components localize themselves via §4.

> **Keeping translations current — the checker only verifies *existence*, not
> freshness.** If you rewrite an English page that already has a translation, the
> translation is now stale but `check-translations.mjs` will still report it as
> "translated" (the file exists). When you change `en/<page>.mdx`, update its
> `<locale>/<page>.mdx` siblings too — there's no automatic staleness flag.

**How it's wired:** `src/lib/source.ts` enables fumadocs i18n (`parser: 'dir'`,
`hideLocale: 'always'`), so locale folders are *variants* (not pages), URLs stay
clean, and the search index is **partitioned per locale** (⌘ K works in every
language). The active locale comes from client state (shared with the landing),
not the URL. Each route resolves the file to render via
`docs-i18n.ts#localizedContentPath(path, locale)`, with an English fallback.

> Adding a new locale: add it to `src/i18n/locales.ts` (`LOCALES`,
> `ORAMA_LANGUAGE`, flag), create its `<locale>/` folder, and translate at least
> the Overview. Everything else falls back to English until translated.

To add a **new locale**: add it to `src/i18n/locales.ts` (and `lingui.config.ts`),
then create files under its folder, e.g. `de/index.mdx`. Nothing else to wire up.

> Note: fumadocs also has a built-in path-based i18n (`/<locale>/docs/…` with the
> loader resolving per locale). We deliberately don't use it — this site uses
> **client-side** locale switching to stay in sync with the landing page and keep
> one URL per page. The per-locale folders are hidden from the sidebar because
> they aren't listed in `meta.json`.

---

## 6. Suggested structure (current + alternatives)

**Current** (audience: book producers / end users):

```
Introduction · Get Started · Learn · Help
```

Other ways the docs could be divided as they grow — pick one and keep it
consistent:

1. **Task / journey-based** — `Get Started` → `Guides` (How do I…?) →
   `Pipeline reference` → `Troubleshooting`. Best when most readers arrive to
   accomplish a specific task.
2. **Audience-based** — `For book producers` (using the app) vs.
   `For operators` (Docker, self-hosting, API keys, CI). Best if usage splits
   cleanly into two very different reader types.
3. **[Diátaxis](https://diataxis.fr/)** — `Tutorials` (learning) ·
   `How-to guides` (tasks) · `Reference` (the pipeline, stages, output bundle) ·
   `Explanation` (concepts, principles). Scales best for large doc sets and
   keeps each page's *purpose* unambiguous.

Whichever is chosen, the **Pipeline** section maps naturally to the real
pipeline DAG (`packages/types/src/pipeline.ts`) — keep its step pages aligned
with that source of truth.

---

## 7. Develop & verify

```bash
pnpm --filter @adt/site dev            # local dev server
pnpm --filter @adt/site run types:check
pnpm --filter @adt/site build          # static build → .output/public
pnpm --filter @adt/site extract        # update UI string catalogs (.po)
node apps/site/scripts/check-translations.mjs   # docs MDX translation report
```

### Translation checks (CI-enforced)

Two complementary checks run in `site-ci.yml`:

- **UI strings** — `lingui extract` must leave no new unwrapped strings (every
  visible component string must be in a macro). Fails the build otherwise.
- **Translation completeness** — `scripts/check-translations.mjs --strict`
  **blocks the PR** unless translations are fully done. It always fails on
  structural errors (an *orphan* translation — a `<locale>/<path>.mdx` with no
  English source, usually a renamed/deleted page — a translated page missing its
  frontmatter `title`, or a mis-cased locale folder). Under `--strict` (CI) it
  **also** fails when a target-locale `.po` has any empty `msgstr`, when a docs
  page is untranslated in some locale, or when a translated page is only a
  placeholder stub. Run it without `--strict` locally to just see coverage.
