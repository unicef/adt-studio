import type { PreviewViewport } from "@/components/pipeline/components/preview-viewport"

function classViewport(token: string): PreviewViewport {
  const variants = token.split(":").slice(0, -1)

  // These are the exact prefixes emitted by the storyboard style editor.
  if (variants.includes("max-sm") || variants.includes("max-md")) return "mobile"
  if (
    variants.includes("max-lg") ||
    variants.includes("sm") ||
    variants.includes("md")
  ) {
    return "tablet"
  }
  return "desktop"
}

function normalizeStyle(value: string): string {
  return value
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .sort()
    .join(";")
}

function desktopNodeSignature(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.replace(/\s+/g, " ").trim() ?? ""
    return text ? `#${text}` : ""
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return ""

  const element = node as Element
  const attributes = Array.from(element.attributes)
    .filter((attribute) => attribute.name !== "data-id")
    .map((attribute) => {
      if (attribute.name === "class") {
        const classes = attribute.value
          .split(/\s+/)
          .filter(Boolean)
          .filter((token) => classViewport(token) === "desktop")
          .sort()
          .join(" ")
        return classes ? [attribute.name, classes] as const : null
      }
      if (attribute.name === "style") {
        return [attribute.name, normalizeStyle(attribute.value)] as const
      }
      return [attribute.name, attribute.value] as const
    })
    .filter((attribute): attribute is readonly [string, string] => attribute != null)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join(";")

  const children = Array.from(element.childNodes)
    .map(desktopNodeSignature)
    .join("")

  return `<${element.tagName.toLowerCase()}[${attributes}]>${children}</${element.tagName.toLowerCase()}>`
}

function desktopSignature(document: Document): string {
  return Array.from(document.body.childNodes)
    .map(desktopNodeSignature)
    .join("")
}

function responsiveSignature(
  document: Document,
  viewport: Exclude<PreviewViewport, "desktop">
): string {
  return Array.from(document.body.querySelectorAll("*"))
    .map((element) => {
      const classes = Array.from(element.classList)
        .filter((token) => classViewport(token) === viewport)
        .sort()
      if (classes.length === 0) return ""
      // data-id preserves element association for editable storyboard nodes.
      // Anonymous nodes use a position-independent key so a base-only sibling
      // insertion cannot create a false responsive-breakpoint indicator.
      const dataId = element.getAttribute("data-id")
      const key = dataId
        ? `#${dataId}`
        : element.tagName.toLowerCase()
      return `${key}=${classes.join(" ")}`
    })
    .filter(Boolean)
    .sort()
    .join(";")
}

/**
 * Identifies the breakpoint layer where each storyboard change was authored.
 * Base markup, content, and unprefixed classes belong to Desktop; `max-lg:`
 * overrides belong to Tablet; and `max-sm:` overrides belong to Mobile.
 * Narrower breakpoints are not marked merely because CSS cascades into them.
 */
export function detectChangedStoryboardViewports(
  currentHtml: string,
  selectedHtml: string
): ReadonlySet<PreviewViewport> {
  if (currentHtml === selectedHtml) return new Set()
  if (typeof DOMParser === "undefined") return new Set(["desktop"])

  const parser = new DOMParser()
  const current = parser.parseFromString(currentHtml, "text/html")
  const selected = parser.parseFromString(selectedHtml, "text/html")
  const changed = new Set<PreviewViewport>()

  if (desktopSignature(current) !== desktopSignature(selected)) {
    changed.add("desktop")
  }
  if (
    responsiveSignature(current, "tablet") !==
    responsiveSignature(selected, "tablet")
  ) {
    changed.add("tablet")
  }
  if (
    responsiveSignature(current, "mobile") !==
    responsiveSignature(selected, "mobile")
  ) {
    changed.add("mobile")
  }

  return changed
}
