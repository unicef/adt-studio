import postcss from "postcss"
import { JSDOM, VirtualConsole } from "jsdom"

type VariableLookup = (name: string) => readonly { value: string; lookup: VariableLookup }[]

/** Stands in for any variable value to detect var() in a URL position. */
const VARIABLE_URL_PROBE = "adt-variable-url-probe"

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
  recoverNonResourceStrings = false,
  stylesheet = false,
): Array<{ url: string; stylesheet: boolean }> {
  const references: Array<{ url: string; stylesheet: boolean }> = []
  let position = 0
  let blockDepth = 0
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
  const string = (requiredClose = true): string => {
    const quote = value[position++]
    let result = ""
    while (position < value.length && value[position] !== quote) {
      result += value[position] === "\\" ? escape() : value[position++]
    }
    if (value[position++] !== quote && requiredClose) throw new Error("Unclosed CSS string")
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
  const walk = (parent = "", nested = false) => {
    let importPending = false
    let declarationStart = false
    while (position < value.length) {
      skip()
      const char = value[position]
      if (!char) break
      // An anonymous (...) group has no resource context, but still owns its
      // closing delimiter. Only the outer frame can recover a stray ')'.
      if (char === ")") { position++; if (nested) return; continue }
      if (stylesheet && !parent && /^@import\b/i.test(value.slice(position))) {
        position += 7
        importPending = true
        continue
      }
      if (char === '"' || char === "'") {
        declarationStart = false
        const url = string(!recoverNonResourceStrings || parent === "image-set" || parent === "-webkit-image-set" || importRule || importPending)
        if (parent === "image-set" || parent === "-webkit-image-set" || (!parent && (importRule || importPending))) {
          references.push({ url, stylesheet: !parent && (importRule || importPending) })
        }
        importPending = false
        continue
      }
      if (/[\w-]/.test(char) || char === "\\" || char.charCodeAt(0) >= 128) {
        const property = declarationStart
        declarationStart = false
        let name = ""
        while (position < value.length) {
          const next = value[position]
          if (next === "\\") name += escape()
          else if (/[\w-]/.test(next) || next.charCodeAt(0) >= 128) name += value[position++]
          else break
        }
        // A dashed selector identifier is not a custom property. Definitions
        // start a declaration and have a colon (possibly after comments).
        if (stylesheet && property && name.startsWith("--")) {
          skip()
          if (value[position] === ":") variables(name)
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
        if (name.toLowerCase() !== "url") { walk(name.toLowerCase(), true); continue }
        skip()
        let url = ""
        if (value[position] === '"' || value[position] === "'") { url = string(); skip() }
        else while (position < value.length && value[position] !== ")") url += value[position] === "\\" ? escape() : value[position++]
        if (value[position++] !== ")") throw new Error("Unclosed CSS URL")
        references.push({ url: url.trim(), stylesheet: !parent && (importRule || importPending) })
        importPending = false
        continue
      }
      position++
      if (stylesheet && char === "{") blockDepth++
      if (stylesheet && char === "}") blockDepth = Math.max(0, blockDepth - 1)
      declarationStart = char === ";" || char === "{" || (char === "}" && blockDepth > 0)
      if (char === ";" || char === "{" || char === "}") importPending = false
      if (char === "(") walk("", true)
    }
  }
  walk(context)
  return references
}

export function parseCssSource(css: string, inline: boolean | "stylesheet" = false) {
  // PostCSS does not tokenize escaped at-rule names. Normalize only those
  // identifiers (not arbitrary escapes that could turn URL bytes into syntax).
  const normalized = css.replace(/@((?:\\[0-9a-f]{1,6}[\t\n\r\f ]?|\\[^\n\r\f]|[\w-])+)/gi, (raw, identifier: string) => {
    const decoded = valueReferences(`url(${identifier})`)[0]?.url
    return decoded && /^[a-z-]+$/i.test(decoded) ? `@${decoded}` : raw
  })
  let root: postcss.Root
  let recoveredReferences: ReturnType<typeof valueReferences> = []
  try { root = postcss.parse(normalized) }
  catch (error) {
    if (!inline) throw error
    // Saved styles follow the browser's CSS recovery, without rewriting HTML.
    // Check original resource tokens first: CSSOM must not silently discard an
    // unsafe URL or repair an ambiguous resource string/function into proof.
    let variableRecovery = false
    recoveredReferences = valueReferences(normalized, false, () => { variableRecovery = true; return [] }, "", new Map(), inline === true, inline === "stylesheet")
    // CSSOM can discard a malformed declaration containing a custom property
    // or its consumer. Without their original scopes it cannot prove the URL
    // selected by another rule, so keep that ambiguous stylesheet fail-closed.
    if (inline === "stylesheet" && variableRecovery) throw error
    const dom = new JSDOM("", { virtualConsole: new VirtualConsole() })
    try {
      if (inline === "stylesheet") {
        const style = dom.window.document.createElement("style")
        style.textContent = normalized
        dom.window.document.head.append(style)
        if (!style.sheet) throw error
        root = postcss.parse(Array.from(style.sheet.cssRules, rule => rule.cssText).join("\n"))
      } else {
        const style = dom.window.document.createElement("div").style
        style.cssText = normalized
        root = postcss.parse(style.cssText)
      }
    } finally { dom.window.close() }
  }
  const selectorFor = (node: postcss.Node): string | undefined => {
    const parent = node.parent
    if (parent?.type === "rule" && "selector" in parent && typeof parent.selector === "string") return parent.selector
    return parent ? selectorFor(parent) : undefined
  }
  const conditional = (node: postcss.Node): boolean => {
    const parent = node.parent
    // CSSOM does not reliably expose declarations around nested blocks. Keep
    // their possible values under the same selector-scoped proof as at-rules.
    const nestedRule = parent?.type === "rule" && (parent.parent?.type === "rule"
      || parent.nodes?.some(child => child.type === "rule" || child.type === "atrule"))
    return parent?.type === "atrule" || nestedRule || (!!parent && conditional(parent))
  }
  const declarations: Array<{ property: string; value: string; selector?: string; variables: boolean; conditional: boolean }> = []
  const imports: string[] = []
  imports.push(...recoveredReferences.filter(reference => reference.stylesheet).map(reference => reference.url))
  // References that do not depend on the consuming document: computed once per
  // stylesheet instead of once per page that links it.
  const directReferences: Array<{ url: string; stylesheet: boolean }> = []
  // Whether any custom property in this source can carry a URL to a consumer:
  // a definition that itself contains url()/image-set(), or a var() used where
  // a quoted string is a URL (image-set). Only then is element scoping needed.
  let variableUrls = false
  root.walkDecls(declaration => {
    declaration.prop = valueReferences(`url(${declaration.prop})`)[0]?.url ?? declaration.prop
    let variables = false
    const references = valueReferences(declaration.value, false, () => {
      variables = true
      return [{ value: `"${VARIABLE_URL_PROBE}"`, lookup: () => [] }]
    })
    const direct = references.filter(reference => reference.url !== VARIABLE_URL_PROBE)
    if (direct.length !== references.length) variableUrls = true
    if (declaration.prop.startsWith("--")) { if (direct.length) variableUrls = true }
    else directReferences.push(...direct)
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
  return { declarations, imports, customCss: custom.toString(), directReferences, variableUrls, recoveredReferences }
}

/** Resolve possible variable values in one document's linked/imported/inline
 * CSS, never across independent pages. URLs use the consumer declaration's
 * base path, including when the quoted value came from another stylesheet. */
export function cssReferences(sources: readonly { parsed: ReturnType<typeof parseCssSource>; from: string; inlineStyle?: string }[], html?: string) {
  const recovered = sources.flatMap(({ parsed, from }) => parsed.recoveredReferences.map(reference => ({ ...reference, from })))
  // No variable in this document can resolve to a URL (true for the generated
  // Tailwind/Font Awesome/fonts stylesheets): the per-stylesheet references are
  // complete, and building a DOM per page to scope variables would find nothing.
  if (!sources.some(source => source.parsed.variableUrls)) {
    return [...recovered, ...sources.flatMap(({ parsed, from }) => parsed.directReferences.map(reference => ({ ...reference, from })))]
  }
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
        // media/support/container/layer and nested rules for this element, rather than
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
    return [...recovered, ...sources.flatMap(({ parsed, from, inlineStyle }) => parsed.declarations.flatMap(declaration => {
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
    }))]
  } finally { dom?.window.close() }
}
