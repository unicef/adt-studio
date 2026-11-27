/* eslint-disable lingui/no-unlocalized-strings -- sample words in each language itself (a greeting); they show the language, they are never translated */
import { cn } from "@/lib/utils"

/** A greeting in each language, written in it. Others fall back to the language's own name. */
const SAMPLE: Record<string, { hello: string }> = {
  en: { hello: "Hello!" },
  pt: { hello: "Olá!" },
  es: { hello: "¡Hola!" },
  fr: { hello: "Bonjour !" },
  sq: { hello: "Përshëndetje!" },
  it: { hello: "Ciao!" },
  de: { hello: "Hallo!" },
  nl: { hello: "Hallo!" },
  ro: { hello: "Bună!" },
  pl: { hello: "Cześć!" },
  tr: { hello: "Merhaba!" },
  sw: { hello: "Habari!" },
  ru: { hello: "Привет!" },
  uk: { hello: "Привіт!" },
  sr: { hello: "Здраво!" },
  ar: { hello: "مرحبا!" },
  fa: { hello: "سلام!" },
  hi: { hello: "नमस्ते!" },
  bn: { hello: "নমস্কার!" },
  zh: { hello: "你好！" },
  ja: { hello: "こんにちは！" },
  ko: { hello: "안녕하세요!" },
}

/** Own names the browser may not know (Albanian's, above all): the language, and its countries' names in it. */
const OWN: Record<string, { name: string; places?: Record<string, string> }> = {
  sq: { name: "Shqip", places: { AL: "Shqipëri", XK: "Kosovë", MK: "Maqedonia e Veriut", ME: "Mali i Zi", RS: "Serbi", GR: "Greqi" } },
  en: { name: "English" },
  pt: { name: "Português" },
  es: { name: "Español" },
  fr: { name: "Français" },
}

/** A language's own name from the list above, when it's there ("Shqip"). */
export function ownName(base: string): string | null {
  return OWN[base.toLowerCase()]?.name ?? null
}

/** The name of a language, or a country, written in the language itself ("Português", "Brasil"). */
export function inItself(code: string, type: "language" | "region", of: string): string {
  const own = OWN[code.split("-")[0]!.toLowerCase()]
  if (type === "language" && own && of.toLowerCase() === code.split("-")[0]!.toLowerCase()) return own.name
  if (type === "region" && own?.places?.[of.toUpperCase()]) return own.places[of.toUpperCase()]!
  try {
    const name = new Intl.DisplayNames([code], { type }).of(of) ?? of
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1)
  } catch {
    return of
  }
}

function Bubble({ children, className, tail, style }: { children: string; className: string; tail: "left" | "right" | "center"; style?: React.CSSProperties }) {
  return (
    <span className={cn("absolute z-10 whitespace-nowrap rounded-[16px] px-3.5 py-1.5 font-bold shadow-[0_10px_22px_-12px_rgba(15,23,42,0.55),inset_0_-3px_0_rgba(0,0,0,0.08)] animate-in fade-in zoom-in-90 fill-mode-both duration-500 motion-reduce:animate-none", className)} style={style}>
      {children}
      <span aria-hidden className={cn("absolute -bottom-1.5 size-3.5 rotate-45 rounded-[3px] bg-inherit", tail === "left" ? "left-5" : tail === "right" ? "right-5" : "left-1/2 -translate-x-1/2")} />
    </span>
  )
}

/**
 * The book in the language picked: the open book and the globe (an illustration, like the other
 * screens'), with speech bubbles saying hello, the language's own name and, once known, the
 * variety's country, all written in it ("Olá!", "Português", "Brasil"). The bubbles follow the
 * pick and pop in again when the language or the variety changes. Decoration only.
 */
export function LanguageBook({ code }: { code: string | null }) {
  const base = code ? code.split("-")[0]!.toLowerCase() : null
  const country = code?.split("-")[1]
  const sample = base ? SAMPLE[base] : undefined
  const language = base ? inItself(base, "language", base) : "?"
  const place = base && country ? inItself(base, "region", country.toUpperCase()) : null
  return (
    <span key={code ?? "none"} aria-hidden className="relative block aspect-[3/2] h-full max-w-full" dir="ltr">
      {/* The book and the world (public/add-book/language.png); the words around it are the language's own. */}
      <img src="/add-book/language.png" alt="" draggable={false} className="absolute inset-0 h-full w-full object-contain" />
      {/* What the book says, in its language. */}
      <Bubble className="left-[6%] top-[6%] bg-brand-600 text-[clamp(15px,2vw,20px)] text-white" tail="right">
        {sample?.hello ?? language}
      </Bubble>
      <Bubble className="left-[2%] top-[36%] bg-amber-300 text-[clamp(12px,1.5vw,15px)] text-amber-950 [animation-delay:90ms]" tail="right">
        {language}
      </Bubble>
      {place && (
        <Bubble className="right-[2%] top-[18%] bg-emerald-300 text-[clamp(12px,1.5vw,15px)] text-emerald-950 [animation-delay:180ms]" tail="left">
          {place}
        </Bubble>
      )}
    </span>
  )
}
