/* eslint-disable lingui/no-unlocalized-strings -- sample words in each language itself (a greeting, "once upon a time"); they show the language, they are never translated */
import { cn } from "@/lib/utils"

/** A greeting and the start of a story in each language, written in it. Others fall back to the language's own name. */
const SAMPLE: Record<string, { hello: string; story: string; rtl?: boolean }> = {
  en: { hello: "Hello!", story: "Once upon a time…" },
  pt: { hello: "Olá!", story: "Era uma vez…" },
  es: { hello: "¡Hola!", story: "Había una vez…" },
  fr: { hello: "Bonjour !", story: "Il était une fois…" },
  sq: { hello: "Përshëndetje!", story: "Na ishte një herë…" },
  it: { hello: "Ciao!", story: "C'era una volta…" },
  de: { hello: "Hallo!", story: "Es war einmal…" },
  nl: { hello: "Hallo!", story: "Er was eens…" },
  ro: { hello: "Bună!", story: "A fost odată…" },
  pl: { hello: "Cześć!", story: "Dawno, dawno temu…" },
  tr: { hello: "Merhaba!", story: "Bir varmış, bir yokmuş…" },
  sw: { hello: "Habari!", story: "Hapo zamani za kale…" },
  ru: { hello: "Привет!", story: "Жили-были…" },
  uk: { hello: "Привіт!", story: "Жили-були…" },
  sr: { hello: "Здраво!", story: "Била једном…" },
  ar: { hello: "مرحبا!", story: "كان يا ما كان…", rtl: true },
  fa: { hello: "سلام!", story: "یکی بود، یکی نبود…", rtl: true },
  hi: { hello: "नमस्ते!", story: "एक समय की बात है…" },
  bn: { hello: "নমস্কার!", story: "এক দেশে ছিল…" },
  zh: { hello: "你好！", story: "从前……" },
  ja: { hello: "こんにちは！", story: "むかしむかし…" },
  ko: { hello: "안녕하세요!", story: "옛날 옛적에…" },
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
 * The book in the language picked: an open book whose page starts a story in that language, with
 * speech bubbles saying hello, the language's own name and, once known, the variety's country,
 * all written in it ("Olá!", "Português", "Brasil"). Drawn here (no image), so it follows the pick;
 * it pops in again when the language or the variety changes. Decoration only.
 */
export function LanguageBook({ code }: { code: string | null }) {
  const base = code ? code.split("-")[0]!.toLowerCase() : null
  const country = code?.split("-")[1]
  const sample = base ? SAMPLE[base] : undefined
  const language = base ? inItself(base, "language", base) : "?"
  const place = base && country ? inItself(base, "region", country.toUpperCase()) : null
  const dir = sample?.rtl ? "rtl" : "ltr"
  return (
    <span key={code ?? "none"} aria-hidden className="relative block aspect-[3/2] h-full max-w-full" dir="ltr">
      {/* The open book: blue cover, two cream pages, the story's first words on the left one. */}
      <svg viewBox="0 0 300 200" className="absolute inset-x-0 bottom-0 mx-auto h-[74%] w-auto drop-shadow-[0_14px_18px_rgba(15,23,42,0.25)]">
        <path d="M18 70 Q150 50 282 70 L282 192 Q150 176 18 192 Z" className="fill-brand-600" />
        <path d="M150 62 Q90 46 28 58 L28 180 Q90 168 150 182 Z" className="fill-[#fbf9f4] dark:fill-zinc-100" />
        <path d="M150 62 Q210 46 272 58 L272 180 Q210 168 150 182 Z" className="fill-[#f4f1ea] dark:fill-zinc-200" />
        <path d="M150 62 L150 182" className="stroke-slate-300" strokeWidth="1.5" />
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={170} y={84 + i * 18} width={i === 3 ? 56 : 84} height={6} rx={3} className="fill-slate-300" />
        ))}
        {/* The story's first words, written on the left page (wrapping inside it). */}
        <foreignObject x={38} y={70} width={104} height={64}>
          <div dir={dir} className="flex h-full items-center justify-center text-center text-[15px] font-bold leading-[1.15] text-slate-700">
            {sample?.story ?? language}
          </div>
        </foreignObject>
        {[0, 1].map((i) => (
          <rect key={i} x={46} y={140 + i * 14} width={i === 1 ? 52 : 86} height={6} rx={3} className="fill-slate-300" />
        ))}
        <rect x={210} y={150} width={36} height={14} rx={4} className="fill-amber-300" />
      </svg>
      {/* What the book says, in its language. */}
      <Bubble className="left-1/2 top-[2%] -translate-x-1/2 bg-brand-600 text-[clamp(15px,2vw,20px)] text-white" tail="center">
        {sample?.hello ?? language}
      </Bubble>
      <Bubble className="left-[3%] top-[26%] bg-amber-300 text-[clamp(12px,1.5vw,15px)] text-amber-950 [animation-delay:90ms]" tail="right">
        {language}
      </Bubble>
      {place && (
        <Bubble className="right-[3%] top-[24%] bg-emerald-300 text-[clamp(12px,1.5vw,15px)] text-emerald-950 [animation-delay:180ms]" tail="left">
          {place}
        </Bubble>
      )}
    </span>
  )
}
