import type { Context } from "hono"
import { getCookie } from "hono/cookie"
import type { Publication } from "@adt/types"
import type { Env } from "./env.js"
import type { PublicationStore } from "./store.js"

/**
 * The access-code page speaks the book's interface language — the one the reader itself will
 * open in — so the door and the room behind it never disagree.
 *
 * The words live here, inside the worker, rather than in the book: a link shared long ago gets
 * the translated door the moment its host is updated, without being re-packaged. Only Studio's
 * own languages are translated; any other language falls back to English, string by string,
 * the same way the reader treats a catalog with gaps.
 */
export interface GateStrings {
  badge: string
  intro: string
  nameLabel: string
  codeLabel: string
  hint: string
  wrongCode: string
  waiting: string
  button: string
}

export const GATE_STRINGS = {
  en: {
    badge: "Access code needed",
    intro: "You've been invited to read this book and leave comments. Enter your name and the code you were given.",
    nameLabel: "Your name",
    codeLabel: "Access code",
    hint: "Capital or small letters both work.",
    wrongCode: "That code doesn't open this book. Check it and try again.",
    waiting: "Too many tries. Wait a moment, then enter the code again.",
    button: "Open the book",
  },
  "pt-BR": {
    badge: "Código de acesso necessário",
    intro: "Você recebeu um convite para ler este livro e deixar comentários. Digite seu nome e o código que você recebeu.",
    nameLabel: "Seu nome",
    codeLabel: "Código de acesso",
    hint: "Pode usar letras maiúsculas ou minúsculas.",
    wrongCode: "Esse código não abre este livro. Confira e tente de novo.",
    waiting: "Muitas tentativas. Aguarde um momento e digite o código novamente.",
    button: "Abrir o livro",
  },
  es: {
    badge: "Se necesita un código de acceso",
    intro: "Te invitaron a leer este libro y dejar comentarios. Escribe tu nombre y el código que te dieron.",
    nameLabel: "Tu nombre",
    codeLabel: "Código de acceso",
    hint: "Puedes usar mayúsculas o minúsculas.",
    wrongCode: "Ese código no abre este libro. Revísalo e inténtalo de nuevo.",
    waiting: "Demasiados intentos. Espera un momento y vuelve a escribir el código.",
    button: "Abrir el libro",
  },
  fr: {
    badge: "Code d'accès requis",
    intro: "On vous invite à lire ce livre et à laisser des commentaires. Saisissez votre nom et le code qui vous a été donné.",
    nameLabel: "Votre nom",
    codeLabel: "Code d'accès",
    hint: "Majuscules ou minuscules, les deux fonctionnent.",
    wrongCode: "Ce code n'ouvre pas ce livre. Vérifiez-le et réessayez.",
    waiting: "Trop de tentatives. Patientez un instant, puis saisissez à nouveau le code.",
    button: "Ouvrir le livre",
  },
  sq: {
    badge: "Nevojitet kodi i hyrjes",
    intro: "Jeni ftuar ta lexoni këtë libër dhe të lini komente. Shkruani emrin tuaj dhe kodin që ju është dhënë.",
    nameLabel: "Emri juaj",
    codeLabel: "Kodi i hyrjes",
    hint: "Mund të përdorni shkronja të mëdha ose të vogla.",
    wrongCode: "Ky kod nuk e hap këtë libër. Kontrollojeni dhe provoni përsëri.",
    waiting: "Shumë përpjekje. Prisni pak, pastaj shkruajeni kodin përsëri.",
    button: "Hape librin",
  },
} as const satisfies Record<string, GateStrings>

export type GateLanguage = keyof typeof GATE_STRINGS

const GATE_LANGUAGES = Object.keys(GATE_STRINGS) as GateLanguage[]

/**
 * A book language to the dictionary that speaks it: the exact tag first, then its base language
 * — the packager's own fallback for interface catalogs — so `pt-PT` still gets Portuguese and
 * `en-US` gets English. Case-insensitive, because book configs and catalogs disagree on case.
 */
export function gateLanguageFor(bookLanguage: string | null | undefined): GateLanguage | null {
  if (!bookLanguage) return null
  const wanted = bookLanguage.toLowerCase()
  const exact = GATE_LANGUAGES.find((lang) => lang.toLowerCase() === wanted)
  if (exact) return exact
  const base = wanted.split("-")[0]
  return GATE_LANGUAGES.find((lang) => lang.toLowerCase().split("-")[0] === base) ?? null
}

export interface BookLanguages {
  available: string[]
  default: string | null
}

const NO_LANGUAGES: BookLanguages = { available: [], default: null }

/** The reader's own persistence key. `readPersistedLanguage` in the runtime reads the same one. */
export const READER_LANGUAGE_KEY = "currentLanguage"

/** The reader stores the value JSON-encoded; older builds stored it bare. Both are accepted. */
export function parseStoredLanguage(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === "string" && parsed.length > 0 ? parsed : raw
  } catch {
    return raw
  }
}

/**
 * The language the reader will open in — `pickLanguage` in the runtime, restated: a stored
 * choice the book offers, otherwise the book's default, otherwise English.
 */
export function pickBookLanguage(languages: BookLanguages, stored: string | null): string {
  const fallback = languages.default ?? "en"
  if (languages.available.length === 0) return stored ?? fallback
  if (stored && languages.available.includes(stored)) return stored
  return fallback
}

/** The book's declared languages, read from its own `assets/config.json`. A book that cannot
 *  be read, or declares nothing, has no languages — and the door speaks English. */
export async function readBookLanguages<E extends { Bindings: Env }>(
  c: Context<E>,
  store: PublicationStore,
  publication: Publication,
): Promise<BookLanguages> {
  const relative = "assets/config.json"
  try {
    const prefix = await store.findSnapshotPrefix(publication.token, publication.current_version, relative)
    if (prefix === null) return NO_LANGUAGES
    const key = `${prefix}/${relative}`
    let text: string | null = null
    if (c.env.ASSETS) {
      const asset = await c.env.ASSETS.fetch(new Request(new URL(`/${key}`, c.req.url)))
      if (asset.ok) text = await asset.text()
    }
    if (text === null && c.env.SNAPSHOTS) {
      const object = await c.env.SNAPSHOTS.get(key)
      if (object) text = await object.text()
    }
    if (text === null) return NO_LANGUAGES
    const config = JSON.parse(text) as { languages?: { available?: unknown; default?: unknown } }
    const available = Array.isArray(config.languages?.available)
      ? config.languages.available.filter((lang): lang is string => typeof lang === "string" && lang.length > 0)
      : []
    const fallback = config.languages?.default
    return { available, default: typeof fallback === "string" && fallback.length > 0 ? fallback : null }
  } catch {
    return NO_LANGUAGES
  }
}

export interface GateLocale {
  /** The book language the reader will open in, e.g. `pt-BR`. */
  bookLanguage: string
  /** The dictionary the page is rendered in. */
  language: GateLanguage
  strings: GateStrings
  /** Every book language the page may switch to in the browser, mapped to its dictionary —
   *  only needed when the reader's saved choice lives in local storage, which the server
   *  cannot see. */
  alternatives: Record<string, GateLanguage>
  book: BookLanguages
}

export function stringsFor(language: GateLanguage): GateStrings {
  return { ...GATE_STRINGS.en, ...GATE_STRINGS[language] }
}

/** Server side of the choice: the book's config and the reader's cookie, when there is one. */
export function resolveGateLocale<E extends { Bindings: Env }>(
  c: Context<E>,
  book: BookLanguages,
): GateLocale {
  const stored = parseStoredLanguage(getCookie(c, READER_LANGUAGE_KEY))
  const bookLanguage = pickBookLanguage(book, stored)
  const language = gateLanguageFor(bookLanguage) ?? "en"
  const alternatives: Record<string, GateLanguage> = {}
  for (const lang of book.available) alternatives[lang] = gateLanguageFor(lang) ?? "en"
  return { bookLanguage, language, strings: stringsFor(language), alternatives, book }
}
