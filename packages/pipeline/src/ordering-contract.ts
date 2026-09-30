import { DomUtils, parseDocument } from "htmlparser2"

// htmlparser2 does not expose a convenient public element type. Keep the
// untyped DOM detail inside this module and return a typed ordering contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Element = any

export interface OrderingContract {
  itemIds: string[]
  correctOrder: string[]
  answers: Record<string, string>
}

export interface OrderingInspection {
  isOrdering: boolean
  errors: string[]
  contract?: OrderingContract
}

function isTag(node: Element): boolean {
  return node?.type === "tag"
}

function findOrderingSections(root: Element): Element[] {
  return DomUtils.findAll(
    (el) =>
      isTag(el) &&
      el.name === "section" &&
      el.attribs?.["data-section-type"] === "activity_ordering",
    root.children ?? [],
  )
}

function parseCorrectOrder(raw: string): string[] | null {
  if (!raw.trim()) return null
  if (!raw.trim().startsWith("[")) {
    return raw.split(",").map((value) => value.trim()).filter(Boolean)
  }

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
      return null
    }
    return parsed.map((value) => value.trim()).filter(Boolean)
  } catch {
    return null
  }
}

export function inspectOrderingSection(section: Element): OrderingInspection {
  const errors: string[] = []
  const lists = DomUtils.findAll(
    (el) => isTag(el) && "data-activity-order-list" in (el.attribs ?? {}),
    section.children ?? [],
  )

  if (lists.length !== 1) {
    errors.push(
      `activity_ordering requires exactly one <ol data-activity-order-list>; found ${lists.length}.`,
    )
    return { isOrdering: true, errors }
  }

  const list = lists[0]
  if (list.name !== "ol") {
    errors.push("activity_ordering requires data-activity-order-list on an <ol> element.")
  }

  const directChildren = (list.children ?? []).filter(isTag) as Element[]
  const itemIds: string[] = []
  for (const child of directChildren) {
    const itemId = child.attribs?.["data-activity-item"]
    if (typeof itemId !== "string" || !itemId.trim()) {
      errors.push(
        "Every direct child of data-activity-order-list must have a non-empty data-activity-item id.",
      )
      continue
    }
    itemIds.push(itemId.trim())
  }

  if (itemIds.length < 2) {
    errors.push("activity_ordering requires at least two ordered items.")
  }

  const duplicateIds = itemIds.filter((itemId, index) => itemIds.indexOf(itemId) !== index)
  if (duplicateIds.length > 0) {
    errors.push(
      `activity_ordering item ids must be unique; duplicates: ${Array.from(new Set(duplicateIds)).join(", ")}.`,
    )
  }

  const encoded = section.attribs?.["data-correct-order"]
  const correctOrder = typeof encoded === "string" ? parseCorrectOrder(encoded) : null
  if (!correctOrder) {
    errors.push("activity_ordering requires a valid data-correct-order sequence.")
  } else {
    const itemSet = new Set(itemIds)
    const orderSet = new Set(correctOrder)
    const exactPermutation =
      correctOrder.length === itemIds.length &&
      orderSet.size === itemSet.size &&
      correctOrder.every((itemId) => itemSet.has(itemId))
    if (!exactPermutation) {
      errors.push(
        "data-correct-order must contain every data-activity-item id exactly once and no unknown ids.",
      )
    }
  }

  if (errors.length > 0 || !correctOrder) {
    return { isOrdering: true, errors }
  }

  return {
    isOrdering: true,
    errors: [],
    contract: {
      itemIds,
      correctOrder,
      answers: Object.fromEntries(
        correctOrder.map((itemId, index) => [itemId, String(index + 1)]),
      ),
    },
  }
}

export function inspectOrderingActivityHtml(html: string): OrderingInspection {
  const doc = parseDocument(html)
  const sections = findOrderingSections(doc)
  if (sections.length === 0) return { isOrdering: false, errors: [] }
  if (sections.length > 1) {
    return {
      isOrdering: true,
      errors: [`Expected one activity_ordering section; found ${sections.length}.`],
    }
  }
  return inspectOrderingSection(sections[0])
}
