type AnswerValue = string | boolean | number

export interface OrderingAnswerUpdate {
  html: string
  answers: Record<string, AnswerValue>
}

function rankOf(value: AnswerValue | undefined, size: number): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  const rank = Number(value)
  return Number.isInteger(rank) && rank >= 1 && rank <= size ? rank : null
}

/**
 * Apply one author edit to an ordering rank while preserving a 1..N
 * permutation. Selecting an occupied rank swaps the two items, and the
 * inspectable HTML contract is updated atomically with activityAnswers.
 */
export function updateOrderingAnswer(
  html: string,
  answers: Record<string, AnswerValue>,
  itemId: string,
  value: AnswerValue,
): OrderingAnswerUpdate | null {
  if (!html || typeof DOMParser === "undefined") return null

  const doc = new DOMParser().parseFromString(html, "text/html")
  const section = doc.querySelector<HTMLElement>(
    'section[data-section-type="activity_ordering"]',
  )
  const list = section?.querySelector<HTMLElement>("[data-activity-order-list]")
  if (!section || !list) return null

  const itemIds = Array.from(
    list.querySelectorAll<HTMLElement>(":scope > [data-activity-item]"),
  ).map((item) => item.getAttribute("data-activity-item") ?? "")
  if (
    itemIds.length < 2 ||
    itemIds.some((id) => !id) ||
    new Set(itemIds).size !== itemIds.length ||
    !itemIds.includes(itemId)
  ) {
    return null
  }

  const ranked = itemIds.map((id) => ({ id, rank: rankOf(answers[id], itemIds.length) }))
  if (
    ranked.some(({ rank }) => rank === null) ||
    new Set(ranked.map(({ rank }) => rank)).size !== itemIds.length
  ) {
    return null
  }

  const nextRank = rankOf(value, itemIds.length)
  const current = ranked.find(({ id }) => id === itemId)
  if (!current || nextRank === null || current.rank === null || current.rank === nextRank) {
    return null
  }

  const displaced = ranked.find(({ rank }) => rank === nextRank)
  if (!displaced) return null

  const nextAnswers: Record<string, AnswerValue> = { ...answers }
  nextAnswers[itemId] = String(nextRank)
  nextAnswers[displaced.id] = String(current.rank)

  const correctOrder = itemIds
    .map((id) => ({ id, rank: rankOf(nextAnswers[id], itemIds.length) }))
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map(({ id }) => id)
  section.setAttribute("data-correct-order", correctOrder.join(","))

  return { html: doc.body.innerHTML, answers: nextAnswers }
}
