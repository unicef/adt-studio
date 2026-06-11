#!/usr/bin/env tsx
/**
 * Automatically translates missing msgstr entries in non-source .po locale files.
 * Reads the English source strings from en.po and translates them in batches for
 * each locale that has empty msgstr entries.
 *
 * Usage:
 *   OPENAI_API_KEY=<key> pnpm --filter @adt/landing translate:missing
 *
 * Environment variables:
 *   OPENAI_API_KEY   (required) OpenAI API key
 *   TRANSLATE_MODEL  (optional) Model in "provider:model" format. Default: "openai:gpt-4o"
 *                    Examples: "openai:gpt-4o-mini", "openai:gpt-4-turbo"
 */
import { generateObject, type LanguageModel } from "ai"
import { openai } from "@ai-sdk/openai"
import { z } from "zod"
import { readFileSync, writeFileSync, readdirSync } from "fs"
import { join, basename, dirname } from "path"
import { fileURLToPath } from "url"
import { LOCALE_NAMES } from "../src/i18n/locales.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = join(__dirname, "../src/locales")
const SOURCE_LOCALE = "en"

function resolveModel(modelId: string): LanguageModel {
  const [provider, model] = modelId.includes(":")
    ? modelId.split(":", 2)
    : ["openai", modelId]

  switch (provider) {
    case "openai":
      return openai(model)
    default:
      throw new Error(
        `Unsupported provider: "${provider}". Currently supported: "openai"`,
      )
  }
}

const TranslationSchema = z.object({
  translations: z.array(z.object({ msgid: z.string(), msgstr: z.string() })),
})

interface PoEntry {
  msgid: string
  msgstrLineIndex: number
}

/**
 * Parses a .po file and returns all entries that have an empty msgstr,
 * along with the line index of the msgstr so we can patch it in place.
 */
function findMissingEntries(filePath: string): PoEntry[] {
  const lines = readFileSync(filePath, "utf-8").split("\n")
  const missing: PoEntry[] = []

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]
    const next = lines[i + 1]

    // Skip obsolete entries
    if (line.startsWith("#~")) continue

    // Single-line msgid (non-empty) followed immediately by empty msgstr
    if (
      line.startsWith('msgid "') &&
      line !== 'msgid ""' &&
      next === 'msgstr ""'
    ) {
      missing.push({
        msgid: line.slice(7, -1), // strip msgid " and trailing "
        msgstrLineIndex: i + 1,
      })
    }
  }

  return missing
}

/**
 * Patches a .po file in-place, writing translations at the given line indices.
 */
function applyTranslations(
  filePath: string,
  patches: Map<number, string>,
): void {
  const lines = readFileSync(filePath, "utf-8").split("\n")

  for (const [lineIndex, translation] of patches) {
    // Escape backslashes and double quotes for .po string format
    const escaped = translation.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    lines[lineIndex] = `msgstr "${escaped}"`
  }

  writeFileSync(filePath, lines.join("\n"), "utf-8")
}

/**
 * Calls the configured LLM to translate a batch of English strings to the target locale.
 * Returns a map of msgid -> translated string.
 */
async function translateBatch(
  model: LanguageModel,
  locale: string,
  entries: PoEntry[],
): Promise<Map<string, string>> {
  const localeName = LOCALE_NAMES[locale] ?? locale

  const stringsJson = JSON.stringify(
    entries.map((e) => e.msgid),
    null,
    2,
  )

  const { object } = await generateObject({
    model,
    schema: TranslationSchema,
    system: `You are a professional UI translator. Translate English UI strings to ${localeName}.
Rules:
- Preserve all {variable} placeholders exactly as-is (e.g. {0}, {name}, {stepLabel})
- Preserve all HTML tags exactly as-is
- Be concise — these are short UI labels and messages, not prose
- Match the tone of the original (formal/informal)
- Include ALL strings from the input — do not skip any`,
    messages: [
      {
        role: "user",
        content: `Translate these ${entries.length} UI strings to ${localeName}:\n\n${stringsJson}`,
      },
    ],
  })

  const result = new Map<string, string>()
  for (const item of object.translations) {
    if (item.msgid && item.msgstr) {
      result.set(item.msgid, item.msgstr)
    }
  }
  return result
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY is not set")
    process.exit(1)
  }

  const modelId = process.env.TRANSLATE_MODEL || "openai:gpt-4o"
  const model = resolveModel(modelId)
  console.log(`Using model: ${modelId}`)

  const poFiles = readdirSync(LOCALES_DIR).filter(
    (f) => f.endsWith(".po") && basename(f, ".po") !== SOURCE_LOCALE,
  )

  if (poFiles.length === 0) {
    console.log("No non-source locale files found.")
    return
  }

  let totalTranslated = 0

  for (const file of poFiles) {
    const locale = basename(file, ".po")
    const filePath = join(LOCALES_DIR, file)
    const missing = findMissingEntries(filePath)

    if (missing.length === 0) {
      console.log(`✓ ${locale}: no missing translations`)
      continue
    }

    console.log(`→ ${locale}: translating ${missing.length} missing string(s)...`)

    const translations = await translateBatch(model, locale, missing)

    const patches = new Map<number, string>()
    let matched = 0

    for (const entry of missing) {
      const translation = translations.get(entry.msgid)
      if (translation) {
        patches.set(entry.msgstrLineIndex, translation)
        matched++
      } else {
        console.warn(`  ⚠ No translation returned for: "${entry.msgid}"`)
      }
    }

    applyTranslations(filePath, patches)
    totalTranslated += matched
    console.log(`✓ ${locale}: applied ${matched}/${missing.length} translations`)
  }

  console.log(`\nDone. Total strings translated: ${totalTranslated}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
