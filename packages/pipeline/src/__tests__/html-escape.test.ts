import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { DomUtils, parseDocument } from "htmlparser2"
import { encodeLegacyEntities, serializeHtml } from "../html-escape.js"

describe("serializeHtml (#907)", () => {
  it("writes visible non-ASCII characters literally in text and attributes; $ stays encoded", () => {
    const doc = parseDocument('<p title="Año “x”">Niño á ¿Qué? ¡Brrr! — 😀 $5</p>')
    expect(serializeHtml(doc)).toBe('<p title="Año “x”">Niño á ¿Qué? ¡Brrr! — 😀 &#x24;5</p>')
  })

  it("does not throw on an out-of-range entity in raw text it cannot classify", () => {
    // Nested noscript: the serializer writes the outer element's text raw.
    const doc = parseDocument("<noscript><noscript></noscript>&amp;#x110000;</noscript>")
    expect(() => serializeHtml(doc)).not.toThrow()
  })

  it("decodes text after a self-closed SVG style or script element", () => {
    const doc = parseDocument("<svg><style></style><script></script></svg><p>é</p><style>a{}</style>")
    expect(serializeHtml(doc)).toContain("<p>é</p>")
  })

  it("decodes zero-width joiners and non-joiners, which belong to emoji sequences and words", () => {
    const doc = parseDocument("<p>👨‍👩 می‌خواهم</p>")
    expect(serializeHtml(doc)).toBe("<p>👨‍👩 می‌خواهم</p>")
  })

  it("decodes text in hyphenated custom elements, which are not raw-text elements", () => {
    const doc = parseDocument("<style-guide>ó</style-guide><p>é</p><style>x</style>")
    expect(serializeHtml(doc)).toBe("<style-guide>ó</style-guide><p>é</p><style>x</style>")
  })

  it("decodes existing numeric entities for visible characters", () => {
    const doc = parseDocument('<h1 title="A&#xf1;o">La explicaci&#xf3;n &#xa1;Brrr!</h1>')
    expect(serializeHtml(doc)).toBe('<h1 title="Año">La explicación ¡Brrr!</h1>')
  })

  it("escapes markup characters exactly as before, in text and in attributes", () => {
    const doc = parseDocument(`<p title="a &amp; &quot;b&quot; <c> 'd'">x &lt; y &amp;&amp; y &gt; z "q" 'a'</p>`)
    expect(serializeHtml(doc)).toBe(
      '<p title="a &amp; &quot;b&quot; &lt;c&gt; &apos;d&apos;">x &lt; y &amp;&amp; y &gt; z &quot;q&quot; &apos;a&apos;</p>',
    )
  })

  it("keeps < and > escaped in attributes, so a raw-text end tag cannot break out (mXSS)", () => {
    const doc = parseDocument('<noscript><p title="</noscript><img src=x onerror=alert(1)>">x</p></noscript>')
    const html = serializeHtml(doc)
    expect(html).toContain('title="&lt;/noscript&gt;&lt;img src=x onerror=alert(1)&gt;"')
    expect(html).not.toContain("<img")
  })

  it("keeps invisible and format characters as entities, so they stay visible in the HTML", () => {
    // no-break space, soft hyphen, zero-width space, right-to-left override, private use
    const doc = parseDocument("<p>a b­c​d‮ef</p>")
    expect(serializeHtml(doc)).toBe("<p>a&#xa0;b&#xad;c&#x200b;d&#x202e;e&#xe000;f</p>")
  })

  it("leaves script, style and comment content byte-for-byte as written", () => {
    const html = '<style>p::before{content:"&#xf3;"}</style><script>var s = "&#xf3; ó";</script><!-- &#xf3; --><p>ó</p>'
    expect(serializeHtml(parseDocument(html))).toBe(html)
  })
})

describe("encodeLegacyEntities (#907)", () => {
  const rich = [
    '<div id="content" title="Año “x” <b> &amp; \'q\'">',
    "<h1>La explicaci&#xf3;n &#xa1;Brrr! 😀 $5 a b c​d</h1>",
    '<img alt="Ni&#xf1;o &quot;feliz&quot;" src="images/x.png">',
    '<style>p::before{content:"ó &#xf3;"}</style><script>var s = "ó &#xf3; $";</script>',
    "<!-- ó &#xf3; --><noscript><p title=\"&lt;/noscript&gt;\">é</p></noscript>",
    '<p data-título="á">ü</p><style-guide>ó</style-guide><?xml-ish ó?>',
    "<svg><style></style></svg><p>é 👨‍👩</p>",
    "<iframe title=\"Vídeo\">ó &#xf3;</iframe><p>Don't &amp; &lt;tag&gt;</p></div>",
  ].join("")

  it("turns serializeHtml output back into the previous serialization byte for byte", () => {
    // Activity IDs and LLM cache keys hash this form, so existing books keep them.
    const doc = parseDocument(rich)
    expect(encodeLegacyEntities(serializeHtml(doc))).toBe(DomUtils.getOuterHTML(doc))
  })

  it("encodes every non-ASCII character, including literal invisible ones, as the old serializer did", () => {
    expect(encodeLegacyEntities('<p title="ó ">🫨‍ a b $</p>')).toBe(
      '<p title="&#xf3;&#xa0;">&#x1fae8;&#x200d; a&#xa0;b $</p>',
    )
  })

  it("is the inverse of the readable decoding", () => {
    const legacy = DomUtils.getOuterHTML(parseDocument(rich))
    expect(serializeHtml(parseDocument(legacy))).toBe(serializeHtml(parseDocument(rich)))
    expect(encodeLegacyEntities(encodeLegacyEntities(serializeHtml(parseDocument(rich))))).toBe(legacy)
  })
})

describe("HTML serialization call sites (#907)", () => {
  it("serializes HTML only through serializeHtml in pipeline, agents and API (htmlToXhtml keeps xmlMode)", () => {
    const repoRoot = path.resolve(import.meta.dirname, "../../../..")
    const offenders: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const file = path.join(dir, name)
        if (statSync(file).isDirectory()) {
          if (name !== "__tests__" && name !== "node_modules") walk(file)
          continue
        }
        if (!name.endsWith(".ts") || name.endsWith(".test.ts") || name === "html-escape.ts") continue
        const source = readFileSync(file, "utf8")
        const where = (index: number) => `${path.relative(repoRoot, file)}:${source.slice(0, index).split("\n").length}`
        for (const call of source.matchAll(/get(?:Outer|Inner)HTML\s*\(([^)]*)\)/g)) {
          if (!/xmlMode:\s*true/.test(call[1])) offenders.push(where(call.index))
        }
        for (const imp of source.matchAll(/from\s+["']dom-serializer["']/g)) offenders.push(where(imp.index))
      }
    }
    const dirs = ["apps/api/src", ...readdirSync(path.join(repoRoot, "packages")).map((pkg) => `packages/${pkg}/src`)]
    for (const dir of dirs) {
      const full = path.join(repoRoot, dir)
      try { if (statSync(full).isDirectory()) walk(full) } catch { /* package without src */ }
    }
    expect(offenders).toEqual([])
  })
})
