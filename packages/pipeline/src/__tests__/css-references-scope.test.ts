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
