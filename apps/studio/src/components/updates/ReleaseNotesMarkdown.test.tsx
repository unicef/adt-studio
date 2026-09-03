// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ReleaseNotesMarkdown } from "./ReleaseNotesMarkdown"

afterEach(cleanup)

describe("ReleaseNotesMarkdown", () => {
  it("uses compact labels for raw GitHub pull request and comparison URLs", () => {
    render(
      <ReleaseNotesMarkdown>{`
- Fixed glossary persistence in https://github.com/unicef/adt-studio/pull/546

Full Changelog: https://github.com/unicef/adt-studio/compare/v0.7.4-beta.3...v0.7.4-beta.4
      `}</ReleaseNotesMarkdown>,
    )

    expect(
      screen.getByRole("link", { name: "#546" }).getAttribute("href"),
    ).toBe(
      "https://github.com/unicef/adt-studio/pull/546",
    )
    expect(
      screen.getByRole("link", {
        name: "v0.7.4-beta.3…v0.7.4-beta.4",
      }),
    ).toBeTruthy()
    expect(screen.queryByText(/https:\/\/github\.com/)).toBeNull()
  })

  it("renders GitHub HTML release notes as structured content, not raw tags", () => {
    render(
      <ReleaseNotesMarkdown>{`<h2>What's Changed</h2>
<ul>
<li>feat(i18n): add Albanian (Kosovo) locale to Studio by <a class="user-mention" href="https://github.com/Eliezir">@Eliezir</a> in <a href="https://github.com/unicef/adt-studio/pull/593">#593</a></li>
</ul>`}</ReleaseNotesMarkdown>,
    )

    expect(screen.getByRole("heading", { name: "What's Changed" })).toBeTruthy()
    expect(screen.getByRole("listitem").textContent).toContain(
      "feat(i18n): add Albanian (Kosovo) locale to Studio",
    )
    expect(
      screen.getByRole("link", { name: "@Eliezir" }).getAttribute("href"),
    ).toBe("https://github.com/Eliezir")
    expect(
      screen.getByRole("link", { name: "#593" }).getAttribute("href"),
    ).toBe("https://github.com/unicef/adt-studio/pull/593")
    expect(screen.queryByText(/<li>|<ul>|<h2>/)).toBeNull()
  })

  it("keeps parsing Markdown when the notes merely mention an HTML tag", () => {
    render(
      <ReleaseNotesMarkdown>{`## Fixes

- Fixed \`<div>\` overflow in the reader
      `}</ReleaseNotesMarkdown>,
    )

    expect(screen.getByRole("heading", { name: "Fixes" })).toBeTruthy()
    expect(screen.getByRole("listitem").textContent).toContain(
      "Fixed <div> overflow in the reader",
    )
  })

  it("renders images from trusted hosts and drops untrusted ones", () => {
    render(
      <ReleaseNotesMarkdown>{`
![shipped](https://github.com/user-attachments/assets/cover.png)

![tracker](https://evil.example/pixel.png)
      `}</ReleaseNotesMarkdown>,
    )

    const images = screen.queryAllByRole("img")
    expect(images).toHaveLength(1)
    expect(images[0].getAttribute("src")).toBe(
      "https://github.com/user-attachments/assets/cover.png",
    )
  })

  it("does not display release automation markers", () => {
    render(
      <ReleaseNotesMarkdown>{`
<!-- adt-ai-notes:start -->
Visible release note.
<!-- adt-ai-notes:end -->
      `}</ReleaseNotesMarkdown>,
    )

    expect(screen.getByText("Visible release note.")).toBeTruthy()
    expect(screen.queryByText(/adt-ai-notes/)).toBeNull()
  })

  it("keeps light and dark release covers tied to the app theme", () => {
    const { container } = render(
      <ReleaseNotesMarkdown>{`
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/unicef/adt-studio/releases/download/v0.8.0/dark.png">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/unicef/adt-studio/releases/download/v0.8.0/light.png">
  <img alt="English accessible cover" src="https://github.com/unicef/adt-studio/releases/download/v0.8.0/light.png">
</picture>
      `}</ReleaseNotesMarkdown>,
    )

    const images = container.querySelectorAll("img")
    expect(images).toHaveLength(2)
    expect(images[0].getAttribute("src")).toContain("light.png")
    expect(images[0].className).toContain("dark:hidden")
    expect(images[1].getAttribute("src")).toContain("dark.png")
    expect(images[1].className).toContain("dark:block")
    expect(images[0].getAttribute("alt")).toBe("English accessible cover")
  })
})
