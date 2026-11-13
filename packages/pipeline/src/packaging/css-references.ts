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

const quotedValue = (value: string) => /^(?:"(?:[^"\\\r\n\f]|\\[\s\S])*"|'(?:[^'\\\r\n\f]|\\[\s\S])*')$/.test(value)

/** Only this small selector grammar supplies a cascade proof. Other selectors
 * still contribute conservative candidates; CSSOM is not a specificity oracle.
 * In particular, do not expand arbitrary selector lists or replace arbitrary &.
 */
function simpleSelector(selector: string) {
  const parts = selector.replace(/^[\t\n\r\f ]+|[\t\n\r\f ]+$/g, "").split(/[\t\n\r\f ]+/)
  const specificity = [0, 0, 0]
  for (const part of parts) {
    if (part === ":root") { specificity[1]++; continue }
    if (!/^(?:\*|[a-zA-Z_][\w-]*)?(?:[.#][a-zA-Z_][\w-]*)*$/.test(part) || !part) return undefined
    specificity[0] += (part.match(/#/g) ?? []).length
    specificity[1] += (part.match(/\./g) ?? []).length
    if (/^[a-zA-Z_]/.test(part)) specificity[2]++
  }
  return { selector: parts.join(" "), specificity }
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
      // CSS ends a bad string at a raw newline. Continuing to the next quote
      // could hide a later resource token; escaped continuations remain valid.
      if (/[\n\r\f]/.test(value[position])) throw new Error("Unescaped newline in CSS string")
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
    let bracketDepth = 0
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
      if (char === "[") bracketDepth++
      if (char === "]") bracketDepth = Math.max(0, bracketDepth - 1)
      // Curly delimiters inside component values cannot close a rule block.
      const boundary = !nested && bracketDepth === 0
      if (stylesheet && boundary && char === "{") blockDepth++
      if (stylesheet && boundary && char === "}") blockDepth = Math.max(0, blockDepth - 1)
      declarationStart = boundary && (char === ";" || char === "{" || (char === "}" && blockDepth > 0))
      if (char === ";" || char === "{" || char === "}") importPending = false
      if (char === "(") walk("", true)
    }
  }
  walk(context)
  return references
}

/** PostCSS accepts bad strings in selectors and at-rule headers too. Check the
 * original token stream so browser newline recovery cannot hide a later rule.
 * This checks only newlines; existing parsing owns other malformed syntax. */
function checkCssStringNewlines(css: string): void {
  let quote = ""
  for (let position = 0; position < css.length; position++) {
    const char = css[position]
    if (!quote && css.slice(position, position + 2) === "/*") {
      const end = css.indexOf("*/", position + 2)
      if (end < 0) return
      position = end + 1
    } else if (char === "\\") {
      // A hex escape may consume one whitespace character (CRLF is one).
      const hex = /^[0-9a-f]{1,6}(?:\r\n|[\t\n\r\f ])?/i.exec(css.slice(position + 1))?.[0]
      position += hex?.length ?? (css[position + 1] === "\r" && css[position + 2] === "\n" ? 2 : 1)
    } else if (quote) {
      if (/[\n\r\f]/.test(char)) throw new Error("Unescaped newline in CSS string")
      if (char === quote) quote = ""
    } else if (char === '"' || char === "'") quote = char
  }
}

export function parseCssSource(css: string, inline: boolean | "stylesheet" = false) {
  checkCssStringNewlines(css)
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
  const scopeFor = (node: postcss.Node) => {
    const rules: postcss.Rule[] = []
    let conditional = false, nested = false, animation = false
    for (let parent = node.parent; parent; parent = parent.parent) {
      if (parent.type === "atrule") conditional = true
      if (parent.type === "atrule" && /^(?:-\w+-)?keyframes$/i.test((parent as postcss.AtRule).name)) animation = true
      if (parent.type === "rule") {
        const rule = parent as postcss.Rule
        rules.unshift(rule)
        nested ||= rule.nodes.some(child => child.type === "rule" || child.type === "atrule")
      }
    }
    nested ||= rules.length > 1
    // Implicit descendant nesting has the sum of its single selectors'
    // specificity. Complex nesting remains unknown, never nearest-rule-only.
    const selectors = rules.map(rule => rule.selector)
    const selector = animation ? undefined : selectors.length < 2 ? selectors[0]
      : selectors.every(value => simpleSelector(value)) ? selectors.join(" ") : undefined
    return { selector, nested, conditional: conditional || selectors.some(value => possibleSelector(value) !== value),
      proof: selector === undefined ? undefined : simpleSelector(selector) }
  }
  const declarations: Array<{ property: string; value: string; variables: boolean; important: boolean } & ReturnType<typeof scopeFor>> = []
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
    declarations.push({ property: declaration.prop, value: declaration.value, variables,
      important: !!declaration.important, ...scopeFor(declaration) })
  })
  root.walkAtRules(rule => {
    // Reuse CSS escape decoding for at-rule identifiers as well as values.
    const name = valueReferences(`url(${rule.name})`)[0]?.url.toLowerCase()
    if (name === "import") imports.push(...valueReferences(rule.params, true).map(reference => reference.url))
  })
  const custom = root.clone()
  custom.walkDecls(declaration => { if (!declaration.prop.startsWith("--")) declaration.remove() })
  custom.walkAtRules("import", rule => { rule.remove() })
  // Registration can change a custom property's validity/inheritance. It must
  // not make unrelated length/colour animations disable every resource proof.
  const registeredVariables: Array<{ name: string; initialValue?: string; inherits: boolean; acceptsQuoted: boolean }> = []
  root.walkAtRules(rule => {
    if (rule.name.toLowerCase() !== "property") return
    const descriptors = new Map<string, string>()
    rule.each(node => { if (node.type === "decl") descriptors.set(node.prop.toLowerCase(), node.value) })
    const syntax = descriptors.get("syntax") ?? ""
    const decodedSyntax = quotedValue(syntax) ? valueReferences(`url(${syntax})`)[0]?.url : undefined
    registeredVariables.push({ name: valueReferences(`url(${rule.params})`)[0]?.url ?? rule.params,
      initialValue: descriptors.get("initial-value"), inherits: descriptors.get("inherits")?.toLowerCase() === "true",
      acceptsQuoted: decodedSyntax === "*" || decodedSyntax === "<string>" })
  })
  return { declarations, imports, customCss: custom.toString(), directReferences, variableUrls, recoveredReferences, registeredVariables }
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
  // Use the existing DOM/CSS implementation for ordinary element scope.
  // Scripts/resources are never enabled. Only
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
    const definitions = sources.flatMap((source, sourceIndex) => source.inlineStyle === undefined
      ? source.parsed.declarations.filter(declaration => declaration.property.startsWith("--"))
        .map((declaration, order) => ({ ...declaration, sourceIndex, order, inline: false })) : [])
    const nestedVariables = definitions.some(declaration => declaration.nested)
    const registrations = sources.flatMap(source => source.parsed.registeredVariables)
    const registeredVariables = new Set(registrations.map(registration => registration.name))
    const inlineDefinitions = new Map<string, typeof definitions>()
    const getInlineDefinitions = (element: Element) => {
      const value = element.getAttribute("style") ?? ""
      let result = inlineDefinitions.get(value)
      if (!result) {
        result = parseCssSource(value, true).declarations.filter(declaration => declaration.property.startsWith("--"))
          .map((declaration, order) => ({ ...declaration, sourceIndex: -1, order, inline: true }))
        inlineDefinitions.set(value, result)
      }
      return result
    }
    const forElement = (element: Element): VariableLookup => {
      let lookup = lookups.get(element)
      if (!lookup) {
        if (nestedVariables) {
          // Nested rules are not reliably represented by CSSOM. Keep all local
          // definitions (including flat/inline peers), removing one only with
          // an independent nonmatching-scope or unconditional override proof.
          const candidates = [...definitions, ...getInlineDefinitions(element)].map(declaration => {
            let matches: boolean | undefined
            if (declaration.inline) matches = true
            else if (declaration.selector) {
              try { matches = element.matches(possibleSelector(declaration.selector)) } catch { /* Unknown scope stays possible. */ }
            }
            return { ...declaration, matches }
          }).filter(declaration => declaration.matches !== false)
          lookup = name => {
            const registered = registrations.filter(registration => registration.name === name)
            const canInherit = !registered.length || registered.some(registration => registration.inherits)
            const local = candidates.filter(declaration => declaration.property === name)
            const selected = local.filter(candidate => !local.some(winner => {
              if (winner === candidate || registeredVariables.has(name) || winner.conditional || candidate.conditional
                || winner.matches !== true || candidate.matches !== true) return false
              // A complete quoted value is valid for an unregistered custom
              // property. Do not infer dominance from var()/rollback values.
              if (!quotedValue(winner.value)) return false
              if ((!winner.inline && !winner.proof) || (!candidate.inline && !candidate.proof)) return false
              if (winner.important !== candidate.important) return winner.important
              if (winner.inline !== candidate.inline) return winner.inline
              const priority = winner.inline ? 0 : winner.proof!.specificity.reduce((comparison, count, index) =>
                comparison || count - candidate.proof!.specificity[index], 0)
              if (priority) return priority > 0
              // Source order is only proven within the same stylesheet (or
              // one inline declaration list), not an inferred import order.
              return winner.sourceIndex === candidate.sourceIndex && winner.order > candidate.order
            }))
            const inherited = () => element.parentElement ? forElement(element.parentElement)(name) : []
            const values = selected.flatMap(declaration => {
              if (declaration.value === "initial") return []
              if (declaration.value === "unset" && !canInherit) return []
              if (/^(?:inherit|unset|revert|revert-layer)$/.test(declaration.value)) return inherited()
              return [{ value: declaration.value, lookup: lookup! }]
            })
            // A conditional/unknown rule may not apply at all. In that case
            // inheritance resolves aliases at the element that defined them.
            const certain = selected.some(declaration => declaration.matches === true && !declaration.conditional)
            if (!certain && canInherit) values.push(...inherited())
            // Registration supplies a value even when no selector defines it.
            // Exclude defaults only when every possible local value is a known
            // valid string (or explicit inheritance), with a certain assignment
            // or inherited fallback. Other registration syntax stays conservative.
            const knownValues = selected.every(declaration => declaration.value === "inherit"
              || (declaration.value === "unset" && registered.every(registration => registration.inherits))
              || (quotedValue(declaration.value) && registered.every(registration => registration.acceptsQuoted)))
            if (!knownValues || (!certain && (!element.parentElement || registered.some(registration => !registration.inherits)))) {
              for (const registration of registered) if (registration.initialValue !== undefined) {
                values.push({ value: registration.initialValue, lookup: lookup! })
              }
            }
            return values
          }
          lookups.set(element, lookup)
          return lookup
        }
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
