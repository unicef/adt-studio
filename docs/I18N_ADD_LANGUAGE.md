# Adding a new UI language (Studio)

This project uses **Lingui v5** with `.po` catalog files for i18n.

### Locale codes (BCP-47)

Locale codes follow **BCP-47 language tags** (e.g. `fr`, `fr-CA`, `pt-BR`).

---

### 1) Add the locale to `src/i18n/locales.ts`

This is the **single source of truth** for all locale metadata. Edit `apps/studio/src/i18n/locales.ts` and add the new locale to all four exports:

```ts
// 1. Add to the LOCALES tuple
export const LOCALES = ["en", "pt-BR", "es", "fr"] as const

// 2. Add a translated display label (shown in the language switcher)
export const LOCALE_LABEL_MESSAGES: Record<AppLocale, MessageDescriptor> = {
  // ...existing entries...
  fr: msg`French`,
}

// 3. Add a flag emoji
export const LOCALE_FLAGS: Record<AppLocale, string> = {
  // ...existing entries...
  fr: "🇫🇷",
}

// 4. Add the full English name (used by the auto-translate script)
export const LOCALE_NAMES: Record<string, string> = {
  // ...existing entries...
  fr: "French",
}
```

> The `LOCALE_FLAGS` emoji above is the lightweight fallback. The redesigned
> Settings → Language picker renders **SVG flags** instead — add one in the next step.

---

### 2) Add a flag SVG for the Settings language picker

The redesigned **Settings → Language** picker renders SVG flags (not the `LOCALE_FLAGS` emoji). Add one per locale:

1. Drop a flag SVG into `apps/studio/src/assets/flags/` (named by region, e.g. `de.svg`). Prefer a set with a consistent `viewBox`/aspect ratio and corner treatment — the existing files are hand-picked and vary in size and detail, so standardize on one source (e.g. `flag-icons`) if you add or touch several.
2. Import it and map it by locale in `apps/studio/src/components/redesign/screens/settings/flags.ts`:

```ts
import deFlag from "@/assets/flags/de.svg"

export const LOCALE_FLAG_SRC: Record<AppLocale, string> = {
  // ...existing entries...
  de: deFlag,
}
```

`LOCALE_FLAG_SRC` is typed `Record<AppLocale, string>`, so a missing entry is a **compile error** — `pnpm typecheck` will catch it. The flag is decorative (`aria-hidden`); the locale label carries the meaning. Flags stand for countries, not languages, so pick the region that best fits the locale (e.g. `sq` → Kosovo `xk.svg`, `en` → US `us.svg`).

---

### 3) Also update `lingui.config.ts`

`lingui.config.ts` is read directly by the Lingui CLI and cannot import from `src/`, so it must be updated separately:

```ts
export default defineConfig({
  locales: ["en", "pt-BR", "es", "fr"],
  sourceLocale: "en",
  // ...
})
```

---

### 4) Generate the catalog file

Run the extract command to create the new `.po` file:

```bash
pnpm --filter @adt/studio extract
```

This generates `apps/studio/src/locales/fr.po` pre-populated with all existing message keys and empty `msgstr` entries.

---

### 5) Translate all messages

You can auto-fill all empty `msgstr` entries using the translate script:

```bash
OPENAI_API_KEY=<key> pnpm --filter @adt/studio translate:missing
```

This calls the OpenAI API and patches the `.po` file in place. CI runs this automatically when `OPENAI_API_KEY` is set as a repository secret.

Alternatively, translate manually by editing `apps/studio/src/locales/<locale>.po` directly:

```po
#: src/components/Sidebar.tsx
msgid "Books"
msgstr "Livres"
```

CI enforces that **no `msgstr` entries are left empty** in non-English locales.

---

### 6) Load the catalog in `main.tsx`

Edit `apps/studio/src/main.tsx` to import and register the new locale:

```ts
import { messages as frMessages } from "./locales/fr.po"

// Add to i18n.load():
i18n.load({ en: enMessages, "pt-BR": ptBRMessages, es: esMessages, fr: frMessages })
```

> `LOCALES` and `AppLocale` are now re-exported from `main.tsx` via `src/i18n/locales.ts` — no change needed there.

---

### 7) Update AGENTS.md

Update the two references to the supported locale list in `AGENTS.md`:

- The sentence: `All user-visible text in apps/studio/ must be translated to all supported locales: **en, pt-BR, es**`
- The `### Available locales` section listing each locale and its description

---

### 8) Verify

```bash
pnpm --filter @adt/studio extract   # Should produce no diff
pnpm --filter @adt/studio lint      # lingui/no-unlocalized-strings must pass
pnpm typecheck                      # Strict TypeScript check
```

Then run the dev server and switch to the new locale in the UI:

```bash
pnpm dev
```

Open `http://localhost:5173?lang=fr` and confirm the UI renders in French.

---

### Locale routing

The Studio uses a `?lang=<locale>` query parameter for locale selection:

- Default (no param or `?lang=en`): English
- Other locales: `?lang=pt-BR`, `?lang=es`, `?lang=fr`, etc.

The router strips the `lang` param from the URL internally and re-appends it on navigation (see `main.tsx`).
