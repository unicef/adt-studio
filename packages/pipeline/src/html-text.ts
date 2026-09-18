/** Zero-padded 3-digit number */
export function pad3(n: number): string {
  return String(n).padStart(3, "0")
}


/**
 * Like DomUtils.textContent but skips the children of any <script>/<style>
 * descendants. Used so a stray inline script inside a data-id element doesn't
 * leak its source into the catalogued text (and from there into the runtime's
 * innerHTML replacement on translation).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function textContentExcludingScripts(node: any): string {
  if (!node) return ""
  if (node.type === "text") return node.data ?? ""
  const tagName = (node.name ?? node.type ?? "").toLowerCase()
  if (tagName === "script" || tagName === "style") return ""
  if (Array.isArray(node.children)) {
    let out = ""
    for (const child of node.children) {
      out += textContentExcludingScripts(child)
    }
    return out
  }
  return ""
}
