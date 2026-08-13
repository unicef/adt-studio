const WORD_PATTERN = /[\p{L}\p{N}\p{M}]+(?:[’'-][\p{L}\p{N}\p{M}]+)*/gu

export interface DisplayWordSegment {
  text: string
  wordIndex: number | null
}

interface AlignmentWord {
  normalizedText: string
  wordIndex: number
}

function wordsIn(text: string): AlignmentWord[] {
  return Array.from(text.matchAll(WORD_PATTERN), (match, wordIndex) => ({
    normalizedText: match[0].normalize().toLocaleLowerCase(),
    wordIndex,
  }))
}

function exactAnchors(source: string[], target: string[]): Array<[number, number]> {
  // Normalized speech usually differs in only a small region. Bound the LCS
  // matrix for pathological paragraphs and use ordered greedy anchors beyond
  // that point; unmatched regions still receive proportional mappings.
  if (source.length * target.length > 250_000) {
    const anchors: Array<[number, number]> = []
    let sourceCursor = 0
    for (let targetIndex = 0; targetIndex < target.length; targetIndex++) {
      const sourceIndex = source.indexOf(target[targetIndex], sourceCursor)
      if (sourceIndex < 0) continue
      anchors.push([sourceIndex, targetIndex])
      sourceCursor = sourceIndex + 1
    }
    return anchors
  }

  const lengths = Array.from(
    { length: source.length + 1 },
    () => new Uint32Array(target.length + 1),
  )
  for (let sourceIndex = 1; sourceIndex <= source.length; sourceIndex++) {
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex++) {
      lengths[sourceIndex][targetIndex] =
        source[sourceIndex - 1] === target[targetIndex - 1]
          ? lengths[sourceIndex - 1][targetIndex - 1] + 1
          : Math.max(
              lengths[sourceIndex - 1][targetIndex],
              lengths[sourceIndex][targetIndex - 1],
            )
    }
  }

  const anchors: Array<[number, number]> = []
  let sourceIndex = source.length
  let targetIndex = target.length
  while (sourceIndex > 0 && targetIndex > 0) {
    if (source[sourceIndex - 1] === target[targetIndex - 1]) {
      anchors.push([sourceIndex - 1, targetIndex - 1])
      sourceIndex--
      targetIndex--
    } else if (
      lengths[sourceIndex - 1][targetIndex] >=
      lengths[sourceIndex][targetIndex - 1]
    ) {
      sourceIndex--
    } else {
      targetIndex--
    }
  }
  return anchors.reverse()
}

function mapTargetToSource(source: string[], target: string[]): number[][] | null {
  if (source.length === 0 || target.length === 0) return null

  const mappings = Array.from({ length: target.length }, () => [] as number[])
  let sourceCursor = 0
  let targetCursor = 0

  const mapChangedRegion = (sourceEnd: number, targetEnd: number) => {
    const sourceCount = sourceEnd - sourceCursor
    const targetCount = targetEnd - targetCursor
    if (targetCount === 0) return

    if (sourceCount === 0) {
      const neighbor = sourceCursor > 0 ? sourceCursor - 1 : sourceCursor
      for (let index = targetCursor; index < targetEnd; index++) {
        mappings[index] = [Math.min(neighbor, source.length - 1)]
      }
      return
    }

    for (let offset = 0; offset < targetCount; offset++) {
      const first = Math.floor((offset * sourceCount) / targetCount)
      const last = Math.max(
        first + 1,
        Math.ceil(((offset + 1) * sourceCount) / targetCount),
      )
      mappings[targetCursor + offset] = Array.from(
        { length: Math.min(sourceCount, last) - first },
        (_, index) => sourceCursor + first + index,
      )
    }
  }

  for (const [sourceAnchor, targetAnchor] of exactAnchors(source, target)) {
    mapChangedRegion(sourceAnchor, targetAnchor)
    mappings[targetAnchor] = [sourceAnchor]
    sourceCursor = sourceAnchor + 1
    targetCursor = targetAnchor + 1
  }
  mapChangedRegion(source.length, target.length)
  return mappings.every((mapping) => mapping.length > 0) ? mappings : null
}

/** Map each timed Whisper word to the visible display-word indices it represents. */
export function mapTimedWordsToDisplayWords(
  displayText: string,
  timedWords: Array<{ word: string }>,
): number[][] | null {
  const displayWords = wordsIn(displayText)
  const timedTokens = timedWords.flatMap((timedWord, timedWordIndex) =>
    wordsIn(timedWord.word).map((word) => ({
      timedWordIndex,
      normalizedText: word.normalizedText,
    })),
  )
  const tokenMappings = mapTargetToSource(
    displayWords.map((word) => word.normalizedText),
    timedTokens.map((word) => word.normalizedText),
  )
  if (!tokenMappings) return null

  const byTimedWord = Array.from(
    { length: timedWords.length },
    () => new Set<number>(),
  )
  timedTokens.forEach((token, tokenIndex) => {
    for (const displayWordIndex of tokenMappings[tokenIndex]) {
      byTimedWord[token.timedWordIndex].add(displayWordIndex)
    }
  })
  return byTimedWord.map((indices) => [...indices].sort((a, b) => a - b))
}

/** Preserve every display character while identifying highlightable word runs. */
export function buildDisplayWordSegments(text: string): DisplayWordSegment[] {
  const segments: DisplayWordSegment[] = []
  let previousEnd = 0
  let wordIndex = 0
  for (const match of text.matchAll(WORD_PATTERN)) {
    const start = match.index ?? 0
    if (start > previousEnd) {
      segments.push({ text: text.slice(previousEnd, start), wordIndex: null })
    }
    segments.push({ text: match[0], wordIndex })
    previousEnd = start + match[0].length
    wordIndex++
  }
  if (previousEnd < text.length) {
    segments.push({ text: text.slice(previousEnd), wordIndex: null })
  }
  return segments
}
