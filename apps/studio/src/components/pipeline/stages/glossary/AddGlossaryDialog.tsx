import { useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useLingui } from "@lingui/react/macro"
import { Loader2, RotateCw } from "lucide-react"
import { api } from "@/api/client"
import type { GlossaryItem } from "@/api/client"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useApiKey } from "@/hooks/use-api-key"

type BookWord = {
  display: string
  count: number
  sample: string
}

const TOKEN_RE = /[\p{L}][\p{L}\p{M}'\-]{3,}/gu
const SENTENCE_SPLIT_RE = /(?<=[.!?])\s+/u
const MAX_SUGGESTIONS = 8

function useBookWords(bookLabel: string) {
  const { data } = useQuery({
    queryKey: ["books", bookLabel, "text-catalog"],
    queryFn: () => api.getTextCatalog(bookLabel),
  })

  return useMemo(() => {
    const index = new Map<string, BookWord>()
    const entries = data?.entries ?? []
    for (const entry of entries) {
      const text = entry.text
      if (!text) continue
      const sentences = text.split(SENTENCE_SPLIT_RE)
      for (const sentence of sentences) {
        const seenInSentence = new Set<string>()
        const matches = sentence.matchAll(TOKEN_RE)
        for (const m of matches) {
          const original = m[0]
          const key = original.toLocaleLowerCase()
          const existing = index.get(key)
          if (existing) {
            if (!seenInSentence.has(key)) existing.count += 1
          } else {
            index.set(key, { display: original, count: 1, sample: sentence.trim() })
          }
          seenInSentence.add(key)
        }
      }
    }
    return index
  }, [data])
}

function parseList(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean)
}

function normalize(word: string): string {
  return word.trim().toLocaleLowerCase()
}

function createManualId(): string {
  return `gl_manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function commonPrefixLen(a: string, b: string): number {
  const min = Math.min(a.length, b.length)
  let i = 0
  while (i < min && a[i] === b[i]) i++
  return i
}

function commonSuffixLen(a: string, b: string): number {
  const min = Math.min(a.length, b.length)
  let i = 0
  while (i < min && a[a.length - 1 - i] === b[b.length - 1 - i]) i++
  return i
}

function findCandidateVariations(
  word: string,
  index: Map<string, BookWord>
): string[] {
  const lower = word.toLocaleLowerCase()
  if (lower.length < 4) return []
  const matches: { display: string; count: number }[] = []
  for (const [key, w] of index) {
    if (key === lower) continue
    if (Math.abs(key.length - lower.length) > 5) continue
    const maxLen = Math.max(key.length, lower.length)
    const minLen = Math.min(key.length, lower.length)
    const prefix = commonPrefixLen(key, lower)
    const suffix = commonSuffixLen(key, lower)
    // Clamp combined coverage so prefix+suffix can't exceed the shorter word's length.
    const coverage = Math.min(prefix + suffix, minLen)
    const threshold = Math.max(4, Math.floor(maxLen * 0.7))
    if (coverage >= threshold) {
      matches.push({ display: w.display, count: w.count })
    }
  }
  matches.sort((a, b) => b.count - a.count)
  return matches.slice(0, 10).map((m) => m.display)
}

export function AddGlossaryDialog({
  open,
  onOpenChange,
  bookLabel,
  existingItems,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookLabel: string
  existingItems: GlossaryItem[]
  onAdd: (item: GlossaryItem) => void
}) {
  const { t } = useLingui()
  const wordIndex = useBookWords(bookLabel)
  const { apiKey, hasStructuredTextProvider } = useApiKey()

  const [word, setWord] = useState("")
  const [definition, setDefinition] = useState("")
  const [variations, setVariations] = useState("")
  const [emojis, setEmojis] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [generating, setGenerating] = useState(false)
  const generateReqId = useRef(0)
  const suggestionsRef = useRef<HTMLDivElement>(null)
  const regenerateButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) {
      setWord("")
      setDefinition("")
      setVariations("")
      setEmojis("")
      setError(null)
      setShowSuggestions(false)
      setHighlight(0)
      setGenerating(false)
      generateReqId.current += 1
    }
  }, [open])

  const autoGenerate = async (targetWord: string, sample: string) => {
    if (!hasStructuredTextProvider || !targetWord) return
    const reqId = ++generateReqId.current
    setGenerating(true)
    setError(null)
    try {
      const candidates = findCandidateVariations(targetWord, wordIndex)
      const result = await api.generateGlossaryItem(bookLabel, apiKey, {
        word: targetWord,
        context: sample,
        candidateVariations: candidates,
      })
      if (reqId !== generateReqId.current) return
      setDefinition(result.definition)
      setVariations(result.variations.join(", "))
      setEmojis(result.emojis.join(" "))
    } catch (e) {
      if (reqId !== generateReqId.current) return
      setError(e instanceof Error ? e.message : t`Failed to generate glossary entry.`)
    } finally {
      if (reqId === generateReqId.current) setGenerating(false)
    }
  }

  const existingWordSet = useMemo(
    () => new Set(existingItems.map((item) => normalize(item.word))),
    [existingItems]
  )

  const suggestions = useMemo(() => {
    const prefix = word.trim().toLocaleLowerCase()
    if (prefix.length < 2) return []
    const out: (BookWord & { key: string })[] = []
    for (const [key, w] of wordIndex) {
      if (!key.startsWith(prefix)) continue
      if (existingWordSet.has(key)) continue
      out.push({ key, ...w })
    }
    out.sort((a, b) => b.count - a.count)
    return out.slice(0, MAX_SUGGESTIONS)
  }, [word, wordIndex, existingWordSet])

  const exactMatch = useMemo(() => {
    const key = normalize(word)
    if (!key) return null
    return wordIndex.get(key) ?? null
  }, [word, wordIndex])

  const selectSuggestion = (s: BookWord) => {
    setWord(s.display)
    setShowSuggestions(false)
    setError(null)
    void autoGenerate(s.display, s.sample)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlight((h) => (h + 1) % suggestions.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      selectSuggestion(suggestions[highlight])
    } else if (e.key === "Escape") {
      setShowSuggestions(false)
    }
  }

  const handleSubmit = () => {
    const w = word.trim()
    const d = definition.trim()
    if (!w || !d) {
      setError(t`Word and definition are required.`)
      return
    }
    if (existingWordSet.has(normalize(w))) {
      setError(t`A glossary term with this word already exists.`)
      return
    }
    onAdd({
      id: createManualId(),
      source: "manual",
      word: w,
      definition: d,
      variations: parseList(variations),
      emojis: parseList(emojis),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={
          {
            "--accent-color": "#65a30d",
            "--ring": "#65a30d",
          } as React.CSSProperties
        }
      >
        <DialogHeader>
          <DialogTitle>{t`Add Glossary Term`}</DialogTitle>
          <DialogDescription>
            {t`Create a manual glossary entry that stays in the book even if AI glossary generation is rerun.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5 relative">
            <Label htmlFor="glossary-word">{t`Word`}</Label>
            <div className="flex gap-2">
              <Input
                id="glossary-word"
                value={word}
                onChange={(e) => {
                  setWord(e.target.value)
                  setError(null)
                  setShowSuggestions(true)
                  setHighlight(0)
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={(e) => {
                  // Delay so an onMouseDown on a suggestion item can register before we hide the list.
                  setTimeout(() => setShowSuggestions(false), 120)
                  // Skip auto-generate when focus moves to the regenerate button — it will fire its own onClick.
                  if (e.relatedTarget === regenerateButtonRef.current) return
                  const trimmed = word.trim()
                  if (
                    hasStructuredTextProvider &&
                    trimmed &&
                    !definition.trim() &&
                    !generating
                  ) {
                    const sample = wordIndex.get(normalize(trimmed))?.sample ?? ""
                    void autoGenerate(trimmed, sample)
                  }
                }}
                onKeyDown={handleKeyDown}
                placeholder={t`Start typing to see words from the book…`}
                autoComplete="off"
                disabled={generating}
              />
              <Button
                ref={regenerateButtonRef}
                type="button"
                variant="ghost"
                size="icon"
                disabled={!hasStructuredTextProvider || !word.trim() || generating}
                onClick={() => {
                  const sample = wordIndex.get(normalize(word))?.sample ?? ""
                  void autoGenerate(word.trim(), sample)
                }}
                title={hasStructuredTextProvider ? t`Regenerate definition, variations, and emoji` : t`Set your API key to auto-generate`}
                className="shrink-0 text-muted-foreground"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RotateCw className="h-4 w-4" />
                )}
              </Button>
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute left-0 right-0 top-full mt-1 z-20 bg-popover border rounded-md shadow-md max-h-60 overflow-y-auto"
              >
                {suggestions.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault()
                      selectSuggestion(s)
                    }}
                    onMouseEnter={() => setHighlight(i)}
                    className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between gap-3 ${
                      i === highlight ? "bg-accent" : ""
                    }`}
                  >
                    <span className="truncate">{s.display}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {s.count}×
                    </span>
                  </button>
                ))}
              </div>
            )}
            {exactMatch && !showSuggestions && (
              <p className="text-xs text-muted-foreground italic line-clamp-2">
                {t`In book:`} “{exactMatch.sample}”
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="glossary-definition">{t`Definition`}</Label>
            <div className="relative">
              <Textarea
                id="glossary-definition"
                value={definition}
                onChange={(e) => {
                  setDefinition(e.target.value)
                  setError(null)
                }}
                rows={4}
                placeholder={generating ? t`Generating…` : t`Explain the term in simple language.`}
                disabled={generating}
              />
              {generating && (
                <Loader2 className="absolute right-2 top-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="glossary-variations">{t`Variations`}</Label>
            <Input
              id="glossary-variations"
              value={variations}
              onChange={(e) => setVariations(e.target.value)}
              placeholder={t`photosynthetic, photosynthesizing`}
              disabled={generating}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="glossary-emojis">{t`Emoji`}</Label>
            <Input
              id="glossary-emojis"
              value={emojis}
              onChange={(e) => setEmojis(e.target.value)}
              placeholder={t`🌿`}
              disabled={generating}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t`Cancel`}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={generating}
            className="bg-lime-600 text-white hover:bg-lime-700 border-0"
          >
            {t`Add Term`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
