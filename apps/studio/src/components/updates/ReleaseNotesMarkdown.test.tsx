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
})
