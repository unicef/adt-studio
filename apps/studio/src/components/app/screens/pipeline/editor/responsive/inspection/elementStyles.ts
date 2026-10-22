import { declarations } from "./styleChanges"

function selectors(value: string) {
  const result: string[] = []
  let start = 0, depth = 0, quote = ""
  for (let index = 0; index < value.length; index++) {
    const char = value[index]
    if (char === "\\") { index++; continue }
    if (quote) { if (char === quote) quote = ""; continue }
    if (char === '"' || char === "'") quote = char
    else if (char === "(" || char === "[") depth++
    else if (char === ")" || char === "]") depth--
    else if (char === "," && !depth) { result.push(value.slice(start, index).trim()); start = index + 1 }
  }
  return [...result, value.slice(start).trim()]
}

// Choose properties from the element's declarations, rather than enumerating the
// browser's hundreds of initial values. The browser still resolves their values:
// this is not a second cascade implementation or a list of winning CSS rules.
export function elementStyles(element: HTMLElement, includeRules: boolean) {
  const inline = declarations(element.getAttribute("style") ?? "")
  const properties = new Set(Object.keys(inline))
  const view = element.ownerDocument.defaultView!
  function matches(selector: string, scope?: Element) {
    try {
      // Leave global resets and universal Tailwind variable initializers out.
      if (/(?:^|[\s>+~])(?:\*|:where\(\*\)|:is\(\*\))$/.test(selector)) return false
      return scope && scope !== element && selector.includes(":scope")
        ? [...scope.querySelectorAll(selector)].includes(element)
        : element.matches(selector)
    } catch { return false }
  }
  function add(style: CSSStyleDeclaration) {
    for (const property of Array.from(style)) {
      if (property !== "all" && !property.startsWith("--tw-")) properties.add(property)
    }
  }
  const visited = new Set<CSSStyleSheet>()
  function sheet(value: CSSStyleSheet | null) {
    if (!value || value.disabled || visited.has(value)) return
    visited.add(value)
    if (value.media.mediaText && !view.matchMedia(value.media.mediaText).matches) return
    // Cross-origin sheets can be applied by the browser but not read through CSSOM.
    try { rules(value.cssRules) } catch { /* Keep inspecting accessible sheets. */ }
  }
  function rules(values: CSSRuleList, parent = "", scope?: Element) {
    for (const rule of Array.from(values)) {
      if (rule instanceof CSSImportRule) { sheet(rule.styleSheet); continue }
      if (rule instanceof CSSMediaRule && !view.matchMedia(rule.conditionText).matches) continue
      if (rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue
      if (typeof CSSScopeRule !== "undefined" && rule instanceof CSSScopeRule) {
        try {
          const root = rule.start ? element.closest(rule.start) : scope
          if (rule.start && !root) continue
          const limit = rule.end ? element.closest(rule.end) : null
          if (limit && root?.contains(limit)) continue
          rules(rule.cssRules, parent, root ?? undefined)
        } catch { /* Ignore unsupported scope selectors. */ }
        continue
      }
      if (rule instanceof CSSStyleRule) {
        // eslint-disable-next-line lingui/no-unlocalized-strings -- CSS selector syntax, never UI copy.
        const nested = `:is(${parent})`
        const selector = parent ? selectors(rule.selectorText).map(value => value.includes("&")
          ? value.replaceAll("&", nested)
          : [nested, value].join(" ")).join(", ") : rule.selectorText
        if (selectors(selector).some(value => matches(value, scope))) add(rule.style)
        if (rule.cssRules) rules(rule.cssRules, selector, scope)
      } else if (typeof CSSNestedDeclarations !== "undefined" && rule instanceof CSSNestedDeclarations) {
        if (parent && selectors(parent).some(value => matches(value, scope))) add(rule.style)
      } else if (rule instanceof CSSGroupingRule) {
        // Container variants contribute property names, not their declared values.
        // getComputedStyle below resolves the actual current canvas breakpoint.
        rules(rule.cssRules, parent, scope)
      }
    }
  }
  if (includeRules) {
    for (const value of [...element.ownerDocument.styleSheets, ...element.ownerDocument.adoptedStyleSheets]) sheet(value)
  }
  const computed = view.getComputedStyle(element)
  return { inline, computed: Object.fromEntries([...properties].sort()
    .map(property => [property, computed.getPropertyValue(property)])
    .filter(([, value]) => value !== "")) }
}
