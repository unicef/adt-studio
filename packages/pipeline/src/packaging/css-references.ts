import postcss from "postcss"
import { JSDOM, VirtualConsole } from "jsdom"

type VariableLookup = (name: string) => readonly { value: string; lookup: VariableLookup }[]

// Portable packages must retain assets used after ordinary reader interaction,
// even when the static validation DOM is not currently hovered/focused/checked.
const interactionState = /:(?:hover|active|focus(?:-visible|-within)?|visited|target|checked|indeterminate|disabled|enabled|open)\b/g
function possibleSelector(selector: string): string {
  return selector.replace(/:not\(\s*:(?:hover|active|focus(?:-visible|-within)?|visited|target|checked|indeterminate|disabled|enabled|open)\s*\)/g, "")
    .replace(interactionState, "") || "*"
}

/** CSS values need token boundaries: strings in image-set() are URLs, while
 * strings in content/type() are not. Decode CSS escapes before resolving paths
 * and never discover dependencies inside comments or quoted prose. */
function valueReferences(
  value: string,
  importRule = false,
  variables: VariableLookup = () => [],
  context = "",
  visited: Map<VariableLookup, Set<string>> = new Map(),
): Array<{ url: string; stylesheet: boolean }> {
  const references: Array<{ url: string; stylesheet: boolean }> = []
  let position = 0
  const escape = (): string => {
    position++ // backslash
    const hex = /^[0-9a-f]{1,6}/i.exec(value.slice(position))?.[0]
    if (hex) {
      position += hex.length
      if (/\s/.test(value[position] ?? "")) {
        if (value[position] === "\r" && value[position + 1] === "\n") position++
        position++
      }
      const code = parseInt(hex, 16)
      return code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? "\ufffd" : String.fromCodePoint(code)
    }
    if (value[position] === "\r" && value[position + 1] === "\n") position++
    const char = value[position++] ?? ""
    return /[\n\r\f]/.test(char) ? "" : char
  }
  const string = (): string => {
    const quote = value[position++]
    let result = ""
    while (position < value.length && value[position] !== quote) {
      result += value[position] === "\\" ? escape() : value[position++]
    }
    if (value[position++] !== quote) throw new Error("Unclosed CSS string")
    return result
  }
  const skip = () => {
    while (position < value.length) {
      if (/\s/.test(value[position])) { position++; continue }
      if (value.slice(position, position + 2) !== "/*") break
      const end = value.indexOf("*/", position + 2)
      if (end < 0) throw new Error("Unclosed CSS comment")
      position = end + 2
    }
  }
  const variableArguments = () => {
    const start = position
    let depth = 1, comma = -1
    while (position < value.length) {
      const char = value[position]
      if (char === '"' || char === "'") { string(); continue }
      if (char === "\\") { escape(); continue }
      if (value.slice(position, position + 2) === "/*") { skip(); continue }
      if (char === "(") depth++
      if (char === ")" && --depth === 0) {
        const end = position++
        const rawName = value.slice(start, comma < 0 ? end : comma).replace(/\/\*[\s\S]*?\*\//g, "").trim()
        const name = valueReferences(`url(${rawName})`)[0]?.url ?? ""
        return { name, fallback: comma < 0 ? undefined : value.slice(comma + 1, end) }
      }
      // A comma in a nested function is not the fallback separator.
      if (char === "," && depth === 1 && comma < 0) comma = position
      position++
    }
    throw new Error("Unclosed CSS variable")
  }
  const walk = (parent = "") => {
    while (position < value.length) {
      skip()
      const char = value[position]
      if (!char) break
      if (char === ")") { position++; return }
      if (char === '"' || char === "'") {
        const url = string()
        if (parent === "image-set" || parent === "-webkit-image-set" || (!parent && importRule)) {
          references.push({ url, stylesheet: !parent && importRule })
        }
        continue
      }
      if (/[\w-]/.test(char) || char === "\\" || char.charCodeAt(0) >= 128) {
        let name = ""
        while (position < value.length) {
          const next = value[position]
          if (next === "\\") name += escape()
          else if (/[\w-]/.test(next) || next.charCodeAt(0) >= 128) name += value[position++]
          else break
        }
        if (value[position] !== "(") continue
        position++
        if (name.toLowerCase() === "var") {
          const { name: property, fallback } = variableArguments()
          const key = JSON.stringify([property, parent, importRule])
          const seen = visited.get(variables) ?? new Set<string>()
          visited.set(variables, seen)
          if (!seen.has(key)) {
            seen.add(key)
            for (const candidate of variables(property)) {
              references.push(...valueReferences(candidate.value, importRule, candidate.lookup, parent, visited))
            }
          }
          // Keep declared fallback assets portable too: CSS inheritance and
          // conditional rules may select them in another viewport/state.
          if (fallback !== undefined) references.push(...valueReferences(fallback, importRule, variables, parent, visited))
          continue
        }
        if (name.toLowerCase() !== "url") { walk(name.toLowerCase()); continue }
        skip()
        let url = ""
        if (value[position] === '"' || value[position] === "'") { url = string(); skip() }
        else while (position < value.length && value[position] !== ")") url += value[position] === "\\" ? escape() : value[position++]
        if (value[position++] !== ")") throw new Error("Unclosed CSS URL")
        references.push({ url: url.trim(), stylesheet: !parent && importRule })
        continue
      }
      position++
      if (char === "(") walk()
    }
  }
  walk(context)
  return references
}

export function parseCssSource(css: string) {
  // PostCSS does not tokenize escaped at-rule names. Normalize only those
  // identifiers (not arbitrary escapes that could turn URL bytes into syntax).
  const normalized = css.replace(/@((?:\\[0-9a-f]{1,6}[\t\n\r\f ]?|\\[^\n\r\f]|[\w-])+)/gi, (raw, identifier: string) => {
    const decoded = valueReferences(`url(${identifier})`)[0]?.url
    return decoded && /^[a-z-]+$/i.test(decoded) ? `@${decoded}` : raw
  })
  const root = postcss.parse(normalized)
  const selectorFor = (node: postcss.Node): string | undefined => {
    const parent = node.parent
    if (parent?.type === "rule" && "selector" in parent && typeof parent.selector === "string") return parent.selector
    return parent ? selectorFor(parent) : undefined
  }
  const conditional = (node: postcss.Node): boolean => {
    const parent = node.parent
    return parent?.type === "atrule" || (!!parent && conditional(parent))
  }
  const declarations: Array<{ property: string; value: string; selector?: string; variables: boolean; conditional: boolean }> = []
  const imports: string[] = []
  root.walkDecls(declaration => {
    declaration.prop = valueReferences(`url(${declaration.prop})`)[0]?.url ?? declaration.prop
    let variables = false
    valueReferences(declaration.value, false, () => { variables = true; return [] })
    const selector = selectorFor(declaration)
    declarations.push({ property: declaration.prop, value: declaration.value, selector, variables,
      conditional: conditional(declaration) || (selector !== undefined && possibleSelector(selector) !== selector) })
  })
  root.walkAtRules(rule => {
    // Reuse CSS escape decoding for at-rule identifiers as well as values.
    const name = valueReferences(`url(${rule.name})`)[0]?.url.toLowerCase()
    if (name === "import") imports.push(...valueReferences(rule.params, true).map(reference => reference.url))
  })
  const custom = root.clone()
  custom.walkDecls(declaration => { if (!declaration.prop.startsWith("--")) declaration.remove() })
  custom.walkAtRules("import", rule => { rule.remove() })
  return { declarations, imports, customCss: custom.toString() }
}

/** Resolve possible variable values in one document's linked/imported/inline
 * CSS, never across independent pages. URLs use the consumer declaration's
 * base path, including when the quoted value came from another stylesheet. */
export function cssReferences(sources: readonly { parsed: ReturnType<typeof parseCssSource>; from: string; inlineStyle?: string }[], html?: string) {
  const variables = new Map<string, string[]>()
  for (const { parsed } of sources) for (const declaration of parsed.declarations) {
    if (!declaration.property.startsWith("--")) continue
    variables.set(declaration.property, [...(variables.get(declaration.property) ?? []), declaration.value])
  }
  const possible: VariableLookup = name => (variables.get(name) ?? []).map(value => ({ value, lookup: possible }))
  const conditionalDefinitions = sources.flatMap(source => source.parsed.declarations)
    .filter(declaration => declaration.conditional && declaration.property.startsWith("--"))
  // Use the existing DOM/CSS implementation for selector specificity, inline
  // overrides and element scope. Scripts/resources are never enabled. Only
  // custom-property rules are installed, avoiding a full layout/style pass.
  const needsScope = sources.some(source => source.parsed.declarations.some(declaration => declaration.variables && !declaration.property.startsWith("--")))
  const dom = html === undefined || !needsScope ? undefined : new JSDOM(html, { virtualConsole: new VirtualConsole() })
  try {
    const document = dom?.window.document
    if (document) {
      for (const node of document.querySelectorAll('style, link[rel="stylesheet"]')) node.remove()
      for (const source of sources) if (source.inlineStyle === undefined) {
        const style = document.createElement("style")
        style.textContent = source.parsed.customCss
        document.head.append(style)
      }
    }
    const lookups = new Map<Element, VariableLookup>()
    const forElement = (element: Element): VariableLookup => {
      let lookup = lookups.get(element)
      if (!lookup) {
        const style = dom!.window.getComputedStyle(element)
        // JSDOM has no viewport/layout engine. Keep the possible values from
        // media/support/container/layer rules for this element, rather than
        // incorrectly proving only the default viewport's asset set complete.
        const alternatives = conditionalDefinitions.filter(declaration => {
          if (!declaration.selector) return true
          try { return element.matches(possibleSelector(declaration.selector)) } catch { return true }
        })
        lookup = name => {
          const value = style.getPropertyValue(name).trim()
          const conditional = alternatives.filter(declaration => declaration.property === name)
            .flatMap(declaration => {
              if (declaration.value === "initial") return []
              if (declaration.value === "inherit" || declaration.value === "unset") return element.parentElement ? forElement(element.parentElement)(name) : []
              return [{ value: declaration.value, lookup: lookup! }]
            })
          if (value && value !== "inherit" && value !== "unset") {
            return [...(value === "initial" ? [] : [{ value, lookup: lookup! }]), ...conditional]
          }
          return [...conditional, ...(element.parentElement ? forElement(element.parentElement)(name) : [])]
        }
        lookups.set(element, lookup)
      }
      return lookup
    }
    const targets = new Map<string, Element[]>()
    return sources.flatMap(({ parsed, from, inlineStyle }) => parsed.declarations.flatMap(declaration => {
      // Definitions are expanded at their consumer, with that consumer's URL
      // base. Prose/custom-property declarations alone are not image consumers.
      if (declaration.property.startsWith("--")) return []
      if (!declaration.variables) return valueReferences(declaration.value).map(reference => ({ ...reference, from }))
      const key = JSON.stringify([inlineStyle, declaration.selector])
      let elements = targets.get(key)
      if (!elements) {
        elements = []
        if (document) {
          if (inlineStyle !== undefined) elements = [...document.querySelectorAll("[style]")].filter(element => element.getAttribute("style") === inlineStyle)
          else if (declaration.selector) {
            try { elements = [...document.querySelectorAll(possibleSelector(declaration.selector))] } catch { /* Unresolved nested selectors retain conservative candidates. */ }
          }
        }
        targets.set(key, elements)
      }
      const contexts = elements.length ? elements.map(forElement) : [possible]
      return contexts.flatMap(lookup => valueReferences(declaration.value, false, lookup)
        .map(reference => ({ ...reference, from })))
    }))
  } finally { dom?.window.close() }
}
