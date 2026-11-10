import { useMemo } from "react"
import type { WordTimestampEntry } from "@/api/client"
import { cn } from "@/lib/utils"
import {
  buildDisplayWordSegments,
  mapTimedWordsToDisplayWords,
} from "../lib/speech-highlight-alignment"

export function SpeechHighlightedText({
  text,
  timestamps,
  currentTime,
  isPlaying,
  accent,
  className,
}: {
  text: string
  timestamps?: WordTimestampEntry
  currentTime: number
  isPlaying: boolean
  accent?: string
  className?: string
}) {
  const segments = useMemo(() => buildDisplayWordSegments(text), [text])
  const timestampMappings = useMemo(
    () =>
      timestamps && isPlaying
        ? mapTimedWordsToDisplayWords(text, timestamps.words)
        : null,
    [isPlaying, text, timestamps],
  )

  if (!timestamps || !timestampMappings || !isPlaying) {
    return <p className={cn("text-sm leading-relaxed mt-0.5", className)}>{text}</p>
  }

  const activeWords = new Set<number>()
  const pastWords = new Set<number>()
  timestamps.words.forEach((word, timestampIndex) => {
    const mappedWords = timestampMappings[timestampIndex] ?? []
    if (currentTime >= word.start && currentTime < word.end) {
      mappedWords.forEach((wordIndex) => activeWords.add(wordIndex))
    } else if (currentTime >= word.end) {
      mappedWords.forEach((wordIndex) => pastWords.add(wordIndex))
    }
  })

  return (
    <p className={cn("text-sm leading-relaxed mt-0.5", className)}>
      {segments.map((segment, index) => {
        if (segment.wordIndex === null) return segment.text
        const active = activeWords.has(segment.wordIndex)
        const past = pastWords.has(segment.wordIndex)
        return (
          <span
            key={`${index}:${segment.wordIndex}`}
            className={cn(
              "rounded-sm px-0.5 transition-all duration-100 inline",
              active
                ? accent
                  ? "text-white"
                  : "bg-pink-500 text-white"
                : past
                  ? "text-foreground"
                  : "text-muted-foreground/50",
            )}
            style={active && accent ? { backgroundColor: accent } : undefined}
          >
            {segment.text}
          </span>
        )
      })}
    </p>
  )
}
