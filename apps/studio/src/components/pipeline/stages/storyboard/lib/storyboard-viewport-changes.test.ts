// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { detectChangedStoryboardViewports } from "./storyboard-viewport-changes"

const changed = (current: string, selected: string) =>
  Array.from(detectChangedStoryboardViewports(current, selected))

describe("detectChangedStoryboardViewports", () => {
  it("returns no viewports for equivalent markup", () => {
    expect(
      changed(
        '<section class="grid gap-2"><p>Hello</p></section>',
        '<section class="gap-2 grid"><p>Hello</p></section>'
      )
    ).toEqual([])
  })

  it("attributes base content changes only to desktop", () => {
    expect(changed("<p>Before</p>", "<p>After</p>")).toEqual(["desktop"])
  })

  it("attributes unprefixed class changes only to desktop", () => {
    expect(
      changed(
        '<section class="grid gap-2"></section>',
        '<section class="grid gap-6"></section>'
      )
    ).toEqual(["desktop"])
  })

  it("marks only mobile for max-sm changes", () => {
    expect(
      changed(
        '<section class="grid max-sm:grid-cols-1"></section>',
        '<section class="grid max-sm:grid-cols-2"></section>'
      )
    ).toEqual(["mobile"])
  })

  it("attributes max-lg changes only to tablet", () => {
    expect(
      changed(
        '<section class="grid max-lg:gap-2"></section>',
        '<section class="grid max-lg:gap-6"></section>'
      )
    ).toEqual(["tablet"])
  })

  it("attributes generated md breakpoint classes only to tablet", () => {
    expect(
      changed(
        '<section class="grid md:grid-cols-2"></section>',
        '<section class="grid md:grid-cols-3"></section>'
      )
    ).toEqual(["tablet"])
  })

  it("attributes generated sm breakpoint classes only to tablet", () => {
    expect(
      changed(
        '<section class="grid sm:grid-cols-2"></section>',
        '<section class="grid sm:grid-cols-3"></section>'
      )
    ).toEqual(["tablet"])
  })

  it("reports each authored breakpoint without cascading", () => {
    expect(
      changed(
        '<section class="gap-2 max-lg:p-2 max-sm:text-sm"></section>',
        '<section class="gap-4 max-lg:p-4 max-sm:text-base"></section>'
      )
    ).toEqual(["desktop", "tablet", "mobile"])
  })

  it("ignores data-id and inline-style declaration ordering", () => {
    expect(
      changed(
        '<p data-id="old" style="color: red; font-size: 16px">Text</p>',
        '<p data-id="new" style="font-size: 16px; color: red">Text</p>'
      )
    ).toEqual([])
  })

  it("does not mark responsive layers when a base-only sibling is inserted", () => {
    expect(
      changed(
        '<section><p class="max-sm:text-sm">Text</p></section>',
        '<section><span>New</span><p class="max-sm:text-sm">Text</p></section>'
      )
    ).toEqual(["desktop"])
  })

  it("detects a responsive class moved between identified elements", () => {
    expect(
      changed(
        '<section><p data-id="first" class="max-sm:text-sm">One</p><p data-id="second">Two</p></section>',
        '<section><p data-id="first">One</p><p data-id="second" class="max-sm:text-sm">Two</p></section>'
      )
    ).toEqual(["mobile"])
  })
})
