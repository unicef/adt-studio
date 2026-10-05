import { useEffect, useMemo, useState } from "react"
import { Play } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"

export function WordHighlightPreview({ enabled }: { enabled: boolean }) {
  const { t } = useLingui()
  const sentence = t`The quick brown fox jumps over the lazy dog.`
  const { words, wordIndices } = useMemo(() => {
    const parts = sentence.split(/(\s+)/)
    const indices = parts.map((part, i) => (/\s/.test(part) ? -1 : i)).filter((i) => i >= 0)
    return { words: parts, wordIndices: indices }
  }, [sentence])
  const [activeWord, setActiveWord] = useState(0)

  useEffect(() => {
    if (!enabled || wordIndices.length === 0) return
    setActiveWord(0)
    const id = window.setInterval(() => {
      setActiveWord((prev) => (prev + 1) % wordIndices.length)
    }, 450)
    return () => window.clearInterval(id)
  }, [enabled, wordIndices.length])

  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <Play className="h-3 w-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {enabled ? t`Preview: word-by-word` : t`Preview: per-sentence`}
        </span>
      </div>
      {enabled ? (
        <p className="text-sm leading-relaxed">
          {words.map((part, i) => {
            if (/\s/.test(part)) return <span key={i}>{part}</span>
            const isActive = wordIndices[activeWord] === i
            return (
              <span
                key={i}
                className={cn(
                  "rounded px-0.5 transition-colors duration-150",
                  isActive && "bg-yellow-200 text-yellow-950",
                )}
              >
                {part}
              </span>
            )
          })}
        </p>
      ) : (
        <p className="text-sm leading-relaxed">
          <span className="rounded-lg outline outline-2 outline-blue-300 bg-blue-100/30 text-foreground px-1 -mx-1">
            {sentence}
          </span>
        </p>
      )}
    </div>
  )
}
