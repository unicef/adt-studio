// Treat consecutive text/inline siblings as one target so a block cannot be
// dropped into the middle of a sentence. Indexes are from the editor model,
// before removal, including text and whitespace nodes that have no DOM ID.
export function flowOrder(parent: HTMLElement, children: readonly string[]) {
  const targets: { element?: HTMLElement; before: number; after: number; bounds: () => DOMRect }[] = []
  const nodes = Array.from(parent.childNodes)
  let runStart = 0
  let modelStart = 0

  function prose(end: number, modelEnd: number) {
    const run = nodes.slice(runStart, end)
    if (!run.some(node => node.nodeType === Node.TEXT_NODE ? node.textContent?.trim() : node instanceof HTMLElement)) return
    const range = document.createRange()
    range.setStartBefore(run[0])
    range.setEndAfter(run[run.length - 1])
    const bounds = range.getBoundingClientRect()
    if (bounds.height > 0 && bounds.width > 0) {
      targets.push({ before: modelStart, after: modelEnd, bounds: () => range.getBoundingClientRect() })
    }
  }

  for (const [index, node] of nodes.entries()) {
    if (!(node instanceof HTMLElement)) continue
    const display = getComputedStyle(node).display
    if (display.startsWith("inline") || display === "none") continue
    const modelIndex = children.indexOf(node.dataset.adtId ?? "")
    // Never guess insertion indexes if the rendered structure differs.
    if (modelIndex < modelStart) return []
    prose(index, modelIndex)
    targets.push({ element: node, before: modelIndex, after: modelIndex + 1, bounds: () => node.getBoundingClientRect() })
    runStart = index + 1
    modelStart = modelIndex + 1
  }
  prose(nodes.length, children.length)
  return targets
}
