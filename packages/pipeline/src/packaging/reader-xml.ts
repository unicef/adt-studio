import { JSDOM } from "jsdom"

/** Existing strict XML parser, with no scripts or external resource loading.
 * Format-specific roots, declarations and links remain the caller's policy. */
export function inspectReaderXml<T>(source: string, inspect: (root: Element) => T): T {
  const dom = new JSDOM(source, { contentType: "application/xml" })
  try { return inspect(dom.window.document.documentElement) }
  finally { dom.window.close() }
}
