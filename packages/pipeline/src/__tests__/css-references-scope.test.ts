import { beforeEach, expect, it, vi } from "vitest"

const dom = vi.hoisted(() => ({ created: 0 }))
vi.mock("jsdom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jsdom")>()
  class CountingJSDOM extends actual.JSDOM {
    constructor(...args: ConstructorParameters<typeof actual.JSDOM>) {
      dom.created++
      super(...args)
    }
  }
  return { ...actual, JSDOM: CountingJSDOM }
})

const { cssReferences, parseCssSource } = await import("../packaging/css-references.js")

beforeEach(() => { dom.created = 0 })

const urls = (css: string, html: string) =>
  cssReferences([{ parsed: parseCssSource(css), from: "content/styles.css" }], html).map((reference) => reference.url).sort()

it("skips element scoping when no variable can carry a URL (generated Tailwind/Font Awesome CSS)", () => {
  // Tailwind and Font Awesome use var() heavily, but only for lengths, colours,
  // transforms and font names. Their only assets are direct url() references.
  const css = `
    .translate-x-2 { --tw-translate-x: 0.5rem; transform: translate(var(--tw-translate-x), var(--tw-translate-y)) }
    .ring { box-shadow: var(--tw-ring-offset-shadow), var(--tw-ring-shadow, 0 0 #0000) }
    .fa-solid { --fa-style-family: "Font Awesome 6 Free"; font-family: var(--fa-style-family) }
    .fa-user:before { --fa: "\\f007"; content: var(--fa) }
    @font-face { font-family: "Font Awesome 6 Free"; src: url(../webfonts/fa-solid-900.woff2) format("woff2") }`
  const html = '<div class="translate-x-2 ring"><i class="fa-solid fa-user"></i></div>'
  expect(urls(css, html)).toEqual(["../webfonts/fa-solid-900.woff2"])
  expect(dom.created).toBe(0)
})

it("still scopes variables to their consumers when a variable can resolve to a URL", () => {
  const imageSet = '.label{--hero:"Not a file";content:var(--hero)}.hero{--hero:"hero.png";background-image:image-set(var(--hero) 1x)}'
  expect(urls(imageSet, '<p class="label"></p><div class="hero"></div>')).toEqual(["hero.png"])
  expect(dom.created).toBe(1)

  const definedUrl = ":root{--backdrop:url(backdrop.png)} .panel{background:var(--backdrop)}"
  expect(urls(definedUrl, '<div class="panel"></div>')).toEqual(["backdrop.png"])
  expect(dom.created).toBe(2)
})

it.each([false, true, "stylesheet"] as const)("retains image-set resources after anonymous nested groups, mode=%s", mode => {
  const gradient = "linear-gradient(calc((1 + 1) * 45deg), red, blue)"
  for (const [declaration, expected] of [
    [`background-image:image-set(${gradient} 1x, "second.png" 2x)`, ["second.png"]],
    ['background-image:image-set("first.png" calc((1 + 1) * 1x), "second.png" 3x)', ["first.png", "second.png"]],
    [`--hero:"variable.png";background-image:image-set(${gradient} 1x, var(--hero) 2x)`, ["variable.png"]],
    ['width:calc((100% - 2rem) / 2);background:url(after.png)', ["after.png"]],
  ] as const) {
    const css = mode === true ? declaration : `.hero{${declaration}}`
    const source = { parsed: parseCssSource(css, mode), from: "content/styles.css", inlineStyle: mode === true ? declaration : undefined }
    const html = mode === true ? `<div style='${declaration}'></div>` : '<div class="hero"></div>'
    expect(cssReferences([source], html).map(reference => reference.url).sort(), css).toEqual(expected)
  }
})

it.each([".child { color: blue }", "@media screen { color: blue }"])("keeps nested-block variable scopes fail-closed during stylesheet recovery: %s", block => {
  for (const name of ["--hero", String.raw`\2d \2d hero/*comment*/`]) {
    expect(() => parseCssSource(`.typo { color red } .hero { ${block} ${name}:"missing.png" }`, "stylesheet")).toThrow()
  }
})

it.each(["width:calc(1px } );", "grid-area:[a } b];", "grid-area:[a [b } c] d];", "width:calc((1px { }) + 1px);"])("ignores protected block delimiters during recovery: %s", prefix => {
  for (const block of [".child{color:blue}", "@media screen{color:blue}"]) {
    expect(() => parseCssSource(`.typo{color red}.hero{${prefix}${block} --hero:"missing.png"}`, "stylesheet")).toThrow()
  }
})

it.each([".child { color: blue }", "@media screen { color: blue }"])("retains nested-block variable candidates only for matching consumers: %s", block => {
  const css = `.hero { ${block} --hero:"required.png" }
    .other { ${block} --hero:"unrelated.png" }
    .hero { background-image:image-set(var(--hero) 1x) }`
  expect([...new Set(urls(css, '<div class="hero"></div><div class="other"></div>'))]).toEqual(["required.png"])
})

it.each([false, true, "stylesheet"] as const)("refuses raw newlines in CSS strings but preserves escaped continuations, mode=%s", mode => {
  const wrap = (value: string) => mode === true ? value : `.hero { ${value} }`
  for (const newline of ["\n", "\r", "\f", "\r\n"]) {
    for (const quote of ['"', "'"]) {
      expect(() => parseCssSource(wrap(`content:${quote}prose${newline}; background:url(missing.png);${quote}`), mode)).toThrow()
      expect(() => parseCssSource(wrap(`background-image:image-set(${quote}missing${newline}.png${quote} 1x)`), mode)).toThrow()
      const continued = wrap(`content:${quote}url(prose${"\\"}${newline}.png)${quote};background-image:image-set(${quote}required${"\\"}${newline}.png${quote} 1x)`)
      expect(cssReferences([{ parsed: parseCssSource(continued, mode), from: "content/style.css" }]).map(reference => reference.url)).toEqual(["required.png"])
    }
  }
})

it.each([
  ["inline override", '.hero{.child{color:blue}--hero:"unused.png"}', '<main class="hero" style=\'--hero:"required.png";background-image:image-set(var(--hero) 1x)\'></main>'],
  ["later rule", '.hero{.child{color:blue}--hero:"unused.png"}.hero{--hero:"required.png";background-image:image-set(var(--hero) 1x)}', '<main class="hero"></main>'],
  ["specificity", '.hero{--hero:"unused.png";.child{color:blue}}#winner{--hero:"required.png"}.hero{background-image:image-set(var(--hero) 1x)}', '<main id="winner" class="hero"></main>'],
  ["unmatched ancestor", '.other{.hero{--hero:"unused.png"}}.hero{--hero:"required.png";background-image:image-set(var(--hero) 1x)}', '<main class="hero"></main><aside class="other"></aside>'],
] as const)("proves nested variable scope and override: %s", (_label, css, html) => {
  const sources = [{ parsed: parseCssSource(css), from: "style.css", inlineStyle: undefined as string | undefined }]
  if (html.includes("style=")) sources.push({ parsed: parseCssSource('--hero:"required.png";background-image:image-set(var(--hero) 1x)', true), from: "index.html", inlineStyle: '--hero:"required.png";background-image:image-set(var(--hero) 1x)' })
  expect([...new Set(cssReferences(sources, html).map(reference => reference.url))]).toEqual(["required.png"])
})

it.each([
  '.hero{&:is(.hero,.other){--hero:"possible.png"}}',
  '@media (min-width:1px){.hero{--hero:"possible.png"}}',
  '@supports (display:grid){.hero{--hero:"possible.png"}}',
  '@layer theme{.hero{--hero:"possible.png"!important}}',
  '.hero:hover{--hero:"possible.png"}',
  '@keyframes change{from{--hero:"possible.png"}}',
])("retains uncertain nested/conditional values independently of CSSOM: %s", conditional => {
  const css = `.hero{.child{color:blue}--hero:"base.png"}${conditional}.hero{background-image:image-set(var(--hero,"fallback.png") 1x)}`
  expect(new Set(urls(css, '<main class="hero"></main>'))).toEqual(new Set(["base.png", "possible.png", "fallback.png"]))
})

it("does not infer priority from non-CSS whitespace or registered property validity", () => {
  const css = '.hero\u00a0tag{--hero:"possible.png";.child{color:blue}}.other{--hero:"required.png";background-image:image-set(var(--hero) 1x)}'
  expect(urls(css, '<main class="hero\u00a0tag other"></main>')).toContain("required.png")
  const registered = '@PROPERTY --hero{syntax:"*";inherits:true}.hero{--hero:"possible.png";.child{color:blue}}.hero{--hero:"required.png";background-image:image-set(var(--hero) 1x)}'
  expect(new Set(urls(registered, '<main class="hero"></main>'))).toEqual(new Set(["possible.png", "required.png"]))
})

it.each([
  ['.other{.hero{--hero:"required.png"}}.hero{--hero:"unused.png";background-image:image-set(var(--hero) 1x)}', '<aside class="other"><main class="hero"></main></aside>'],
  ['#winner{--hero:"required.png";.child{color:blue}}.hero{--hero:"unused.png";background-image:image-set(var(--hero) 1x)}', '<main id="winner" class="hero"></main>'],
  ['.hero{--hero:"required.png"!important;.child{color:blue}}', '<main class="hero" style=\'--hero:"unused.png";background-image:image-set(var(--hero) 1x)\'></main>'],
  ['.parent{--base:"required.png";--alias:var(--base);.child{color:blue}}.hero{--base:"unused.png";background-image:image-set(var(--alias) 1x)}', '<aside class="parent"><main class="hero"></main></aside>'],
] as const)("retains the selected nested resource despite misleading CSSOM order: %s", (css, html) => {
  const inlineStyle = '--hero:"unused.png";background-image:image-set(var(--hero) 1x)'
  const sources = [{ parsed: parseCssSource(css), from: "style.css", inlineStyle: undefined as string | undefined }]
  if (html.includes("style=")) sources.push({ parsed: parseCssSource(inlineStyle, true), from: "index.html", inlineStyle })
  expect([...new Set(cssReferences(sources, html).map(reference => reference.url))]).toEqual(["required.png"])
})

it.each([false, "stylesheet"] as const)("checks bad strings outside declaration values, mode=%s", mode => {
  for (const newline of ["\n", "\r", "\r\n", "\f"]) {
    for (const css of [
      `a[title="x${newline}] {} .yy{background:url(missing.png)} b[title="]{color:red}`,
      `@media "x${newline}{} .yy{background:url(missing.png)} @media "{.q{color:red}}`,
      `@foo "x${newline}; .yy{background:url(missing.png)} @foo ";`,
    ]) expect(() => parseCssSource(css, mode)).toThrow()
    for (const css of [
      `/* quotes " ' ${newline} aren't strings in a comment */ .yy{background:url(required.png)}`,
      `a[title="a\\A${newline}b"]{background:url(required.png)}`,
      `a[title="a\\${newline}b"]{background:url(required.png)}`,
      String.raw`a[title="a\"b"]{background:url(required.png)}`,
    ]) expect(cssReferences([{ parsed: parseCssSource(css, mode), from: "style.css" }]).map(reference => reference.url)).toEqual(["required.png"])
  }
})
