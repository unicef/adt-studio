import { Search, X } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { i18n as linguiI18n } from "@lingui/core"
import type { MessageDescriptor } from "@lingui/core"

export type AmountKey = "concise" | "standard" | "comprehensive"

type GlossarySample = {
  word: MessageDescriptor
  definition: MessageDescriptor
  emojis: string
}

const GLOSSARY_SAMPLES: GlossarySample[] = [
  {
    word: msg`Allegory`,
    definition: msg`A story with characters and events that stand for a deeper, often moral, meaning.`,
    emojis: "📚 🔍",
  },
  {
    word: msg`Ecosystem`,
    definition: msg`The community of living organisms in a place and the way they interact with each other and their environment.`,
    emojis: "🌿 🦊",
  },
  {
    word: msg`Metaphor`,
    definition: msg`A figure of speech that describes one thing as if it were another to draw a comparison.`,
    emojis: "📝 ✨",
  },
  {
    word: msg`Photosynthesis`,
    definition: msg`The process plants use to turn sunlight, water, and carbon dioxide into food.`,
    emojis: "🌱 ☀️",
  },
  {
    word: msg`Symbiosis`,
    definition: msg`A close, long-term relationship between two different species, often benefiting both.`,
    emojis: "🐠 🐡",
  },
]

const AMOUNT_VISIBLE: Record<AmountKey, number> = {
  concise: 3,
  standard: 4,
  comprehensive: 5,
}

export function GlossaryPreview({ amount }: { amount: AmountKey }) {
  const visibleCount = AMOUNT_VISIBLE[amount]
  const visible = GLOSSARY_SAMPLES.slice(0, visibleCount)

  return (
    <div className="relative flex flex-1 min-h-0 overflow-hidden ">
      <span className="absolute right-4 top-4 z-10 rounded-full border border-border bg-lime-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-lime-700">
        <Trans>Sample</Trans>
      </span>

      <div className="flex w-full h-full items-center justify-center p-4 min-h-0">
        <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-[0_8px_24px_-12px_rgba(0,0,0,0.18)]">
          <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[14px] font-semibold text-foreground">
              <Trans>Glossary</Trans>
            </h2>
            <X
              className="h-3.5 w-3.5 text-[#a3a3a3]"
              strokeWidth={2}
              aria-hidden
            />
          </div>

          <div className="flex shrink-0 items-center justify-between px-4 pt-3.5">
            <span className="text-[12px] font-medium text-foreground">
              <Trans>Highlight words</Trans>
            </span>
            <span
              className="flex h-4 w-7 items-center rounded-full bg-border px-0.5"
              aria-hidden
            >
              <span className="h-3 w-3 rounded-full bg-background shadow-sm" />
            </span>
          </div>

          <div className="shrink-0 px-4 pt-3">
            <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5">
              <Search
                className="h-3 w-3 text-[#a3a3a3]"
                strokeWidth={2}
                aria-hidden
              />
              <span className="text-[11px] text-[#a3a3a3]">
                <Trans>Search...</Trans>
              </span>
            </div>
          </div>

          <div className="flex flex-1 min-h-0 flex-col gap-3.5 overflow-hidden px-4 pt-3.5 pb-2">
            {visible.map((sample, i) => (
              <GlossaryReaderEntry
                key={`${amount}-${i}`}
                word={linguiI18n._(sample.word)}
                definition={linguiI18n._(sample.definition)}
                emojis={sample.emojis}
                delay={i * 40}
              />
            ))}
            <p
              key={`more-${amount}`}
              aria-hidden
              className="mt-auto pt-1 text-center tracking-[0.4em] text-lime-400/70 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
            >
              ···
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function GlossaryReaderEntry({
  word,
  definition,
  emojis,
  delay,
}: {
  word: string
  definition: string
  emojis: string
  delay: number
}) {
  return (
    <div
      className="flex flex-col gap-1 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:ease-out"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "backwards" }}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="text-[12.5px] font-semibold text-foreground">
          {word}
        </span>
        <span className="text-[12px] leading-none">{emojis}</span>
      </div>
      <p className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
        {definition}
      </p>
    </div>
  )
}
