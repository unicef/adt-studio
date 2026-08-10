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
}: {
  text: string
  timestamps?: WordTimestampEntry
  currentTime: number
  isPlaying: boolean
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
    return <p className="text-sm leading-relaxed mt-0.5">{text}</p>
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
    <p className="text-sm leading-relaxed mt-0.5">
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
                ? "bg-pink-500 text-white"
                : past
                  ? "text-foreground"
                  : "text-muted-foreground/50",
            )}
          >
            {segment.text}
          </span>
        )
      })}
    </p>
  )
}
