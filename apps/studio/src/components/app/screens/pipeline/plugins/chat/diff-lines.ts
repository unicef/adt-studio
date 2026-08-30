import type { FileDiffLine } from "@/components/agents/file-diff"

const MAX_DIFF_LINES = 120

/**
 * Line-level diff via the classic LCS table. Inputs are one section's HTML or a
 * single catalog entry, so the quadratic table stays small; anything larger is
 * truncated before it reaches here.
 */
export function diffLines(before: string, after: string): FileDiffLine[] {
  const source = splitLines(before)
  const target = splitLines(after)
  const lcs = longestCommonSubsequence(source, target)

  const lines: FileDiffLine[] = []
  let sourceIndex = 0
  let targetIndex = 0
  let oldLine = 1
  let newLine = 1

  const push = (type: FileDiffLine["type"], content: string) => {
    lines.push({
      id: `l${lines.length}`,
      type,
      oldLine: type === "added" ? undefined : oldLine++,
      newLine: type === "removed" ? undefined : newLine++,
      content,
    })
  }

  while (sourceIndex < source.length || targetIndex < target.length) {
    const common = lcs[sourceIndex]?.[targetIndex] ?? 0
    if (
      sourceIndex < source.length &&
      targetIndex < target.length &&
      source[sourceIndex] === target[targetIndex]
    ) {
      push("context", source[sourceIndex])
      sourceIndex++
      targetIndex++
    } else if (
      targetIndex < target.length &&
      (sourceIndex === source.length || (lcs[sourceIndex]?.[targetIndex + 1] ?? 0) >= common)
    ) {
      push("added", target[targetIndex])
      targetIndex++
    } else if (sourceIndex < source.length) {
      push("removed", source[sourceIndex])
      sourceIndex++
    }

    if (lines.length >= MAX_DIFF_LINES) break
  }

  return lines
}

function splitLines(value: string): string[] {
  if (!value) return []
  return value.replace(/></g, ">\n<").split(/\r?\n/)
}

function longestCommonSubsequence(source: string[], target: string[]): number[][] {
  const table: number[][] = Array.from({ length: source.length + 1 }, () =>
    new Array<number>(target.length + 1).fill(0),
  )
  for (let i = source.length - 1; i >= 0; i--) {
    for (let j = target.length - 1; j >= 0; j--) {
      table[i][j] =
        source[i] === target[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1])
    }
  }
  return table
}
