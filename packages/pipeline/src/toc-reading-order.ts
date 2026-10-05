import type { TocEntry } from "@adt/types"

/**
 * Order a TOC without changing the hierarchy encoded by its levels. A parent
 * and its descendants move together, using their earliest resolved section as
 * the group's position. Unlinked/pruned parents therefore stay with children;
 * wholly unmatched groups sort last, stably, among comparable siblings.
 *
 * Siblings with different levels keep their relative runs. Moving a level-3
 * sibling after a level-2 sibling would make it that sibling's child when the
 * flat TOC is read again. Keeping those boundaries preserves skipped heading
 * levels without rewriting user-authored levels or stored entries.
 */
export function orderTocEntries(
  entries: readonly TocEntry[],
  positionById: ReadonlyMap<string, number>,
): TocEntry[] {
  const roots: number[] = []
  const children = entries.map(() => [] as number[])
  const stack: number[] = []
  const positions = entries.map((entry) => positionById.get(entry.sectionId) ?? Infinity)

  for (let index = 0; index < entries.length; index++) {
    while (stack.length && entries[stack[stack.length - 1]].level >= entries[index].level) {
      stack.pop()
    }
    const parent = stack[stack.length - 1]
    if (parent === undefined) roots.push(index)
    else children[parent].push(index)
    stack.push(index)
  }

  // Children have greater indices than their parent in the original preorder.
  for (let index = entries.length - 1; index >= 0; index--) {
    for (const child of children[index]) {
      positions[index] = Math.min(positions[index], positions[child])
    }
  }

  const result: TocEntry[] = []
  const visit = (siblings: number[]) => {
    for (let start = 0; start < siblings.length;) {
      let end = start + 1
      while (end < siblings.length && entries[siblings[end]].level === entries[siblings[start]].level) end++
      const ordered = siblings.slice(start, end).sort((a, b) =>
        positions[a] === positions[b] ? a - b : positions[a] - positions[b],
      )
      for (const index of ordered) {
        result.push(entries[index])
        visit(children[index])
      }
      start = end
    }
  }
  visit(roots)
  return result
}
