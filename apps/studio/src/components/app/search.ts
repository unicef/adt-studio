const DIACRITICS = /\p{Diacritic}/gu

export function normalizeSearchText(value: string): string {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- Unicode normalization form, not UI copy
  return value.normalize("NFD").replace(DIACRITICS, "").toLowerCase()
}

export function searchTokens(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean)
}

const TITLE_START = 6
const WORD_START = 4
const TITLE_MATCH = 2
const EXTRA_MATCH = 1

export function scoreSearchMatch(tokens: string[], title: string, extra?: string): number | null {
  if (tokens.length === 0) return 0
  const haystack = normalizeSearchText(title)
  const secondary = extra ? normalizeSearchText(extra) : ""
  let score = 0
  for (const token of tokens) {
    const at = haystack.indexOf(token)
    if (at === 0) score += TITLE_START
    else if (at > 0) score += /[\s·/(-]/.test(haystack[at - 1]) ? WORD_START : TITLE_MATCH
    else if (secondary.includes(token)) score += EXTRA_MATCH
    else return null
  }
  return score
}

export function rankBySearch<T>(
  items: T[],
  tokens: string[],
  getText: (item: T) => { title: string; extra?: string },
): T[] {
  return items
    .map((item) => {
      const { title, extra } = getText(item)
      return { item, score: scoreSearchMatch(tokens, title, extra) }
    })
    .filter((entry): entry is { item: T; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
}
