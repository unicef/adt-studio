export type PromptDiffRow = {
  kind: "added" | "removed" | "unchanged"
  value: string
  oldLineNumber: number | null
  newLineNumber: number | null
}

export function buildPromptLineDiff(
  currentContent: string,
  selectedContent: string,
): PromptDiffRow[] {
  const oldLines = splitPromptLines(currentContent)
  const newLines = splitPromptLines(selectedContent)
  const lengths = Array.from({ length: oldLines.length + 1 }, () =>
    Array<number>(newLines.length + 1).fill(0),
  )

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      lengths[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? lengths[oldIndex + 1][newIndex + 1] + 1
        : Math.max(lengths[oldIndex + 1][newIndex], lengths[oldIndex][newIndex + 1])
    }
  }

  const rows: PromptDiffRow[] = []
  let oldIndex = 0
  let newIndex = 0

  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      rows.push({
        kind: "unchanged",
        value: oldLines[oldIndex],
        oldLineNumber: oldIndex + 1,
        newLineNumber: newIndex + 1,
      })
      oldIndex += 1
      newIndex += 1
    } else if (lengths[oldIndex + 1][newIndex] >= lengths[oldIndex][newIndex + 1]) {
      rows.push({
        kind: "removed",
        value: oldLines[oldIndex],
        oldLineNumber: oldIndex + 1,
        newLineNumber: null,
      })
      oldIndex += 1
    } else {
      rows.push({
        kind: "added",
        value: newLines[newIndex],
        oldLineNumber: null,
        newLineNumber: newIndex + 1,
      })
      newIndex += 1
    }
  }

  while (oldIndex < oldLines.length) {
    rows.push({
      kind: "removed",
      value: oldLines[oldIndex],
      oldLineNumber: oldIndex + 1,
      newLineNumber: null,
    })
    oldIndex += 1
  }

  while (newIndex < newLines.length) {
    rows.push({
      kind: "added",
      value: newLines[newIndex],
      oldLineNumber: null,
      newLineNumber: newIndex + 1,
    })
    newIndex += 1
  }

  return rows
}

function splitPromptLines(content: string): string[] {
  if (content.length === 0) return []
  return content.replace(/\r\n/g, "\n").split("\n")
}
