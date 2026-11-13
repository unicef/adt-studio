import { describe, expect, it } from "vitest"
import type { AvailableRelease } from "@/hooks/use-update-status"
import {
  filterVersionsByQuery,
  githubAvatarUrl,
  previewBranch,
  releaseContributors,
  releaseDisplayTitle,
  showsDirection,
} from "./beta-version-utils"

function release(overrides: Partial<AvailableRelease> = {}): AvailableRelease {
  return { version: "0.8.0-beta.1", direction: "current", ...overrides }
}

function pr(number: number, author?: string, title?: string) {
  return { number, url: `https://github.com/unicef/adt-studio/pull/${number}`, author, title }
}

describe("releaseContributors", () => {
  it("lists PR authors once, without bots, instead of the release bot", () => {
    const source = { prs: [pr(1, "Eliezir"), pr(2, "elasticsounds"), pr(3, "Eliezir"), pr(4, "dependabot[bot]")] }
    expect(releaseContributors(release({ author: "github-actions[bot]", source }))).toEqual([
      "Eliezir",
      "elasticsounds",
    ])
    expect(releaseContributors(release({ author: "github-actions[bot]" }))).toEqual([])
  })
})

describe("releaseDisplayTitle", () => {
  it("prefers the title, then the staging PR title, then the notes headline", () => {
    expect(releaseDisplayTitle(release({ title: "Kids Mode" }))).toBe("Kids Mode")
    expect(
      releaseDisplayTitle(
        release({
          version: "0.8.1-beta-pr-867",
          source: { prs: [pr(867, "Eliezir", "chore(staging): validate Cloudflare stack [draft]")] },
        }),
      ),
    ).toBe("Validate Cloudflare stack")
    expect(releaseDisplayTitle(release({ releaseNotes: "## Redesigned Studio\n\nBody" }))).toBe(
      "Redesigned Studio",
    )
  })

  it("falls back to the version for generated notes", () => {
    for (const heading of ["What's Changed", "What's New", "Changelog", "Release notes"]) {
      expect(releaseDisplayTitle(release({ releaseNotes: `## ${heading}\n* a` }))).toBe("v0.8.0-beta.1")
    }
  })
})

describe("githubAvatarUrl", () => {
  it("only builds URLs for valid logins", () => {
    expect(githubAvatarUrl("Eliezir")).toBe("https://github.com/Eliezir.png?size=64")
    expect(githubAvatarUrl("../evil")).toBeUndefined()
  })
})

describe("filterVersionsByQuery", () => {
  it("matches contributors and pull requests", () => {
    const releases = [
      release({ version: "0.8.1-beta-pr-867", source: { prs: [pr(867, "Eliezir", "Cloudflare stack")] } }),
      release({ version: "0.8.0-beta.1", source: { prs: [pr(839, "elasticsounds", "Storyboard status")] } }),
    ]
    const versions = (query: string) => filterVersionsByQuery(releases, query).map((r) => r.version)
    expect(versions("@elastic")).toEqual(["0.8.0-beta.1"])
    expect(versions("cloudflare")).toEqual(["0.8.1-beta-pr-867"])
    expect(versions("#839")).toEqual(["0.8.0-beta.1"])
  })
})

describe("previewBranch", () => {
  it("names the staged PR's head branch, then the source branch, only for preview builds", () => {
    const head = { ...pr(803), headRef: "issue-705" }
    expect(previewBranch(release({ version: "0.9.1-beta-pr-803", source: { prs: [head], branch: "x" } }))).toBe(
      "issue-705",
    )
    expect(previewBranch(release({ version: "0.9.1-beta-pr-803", source: { prs: [], branch: "issue-705" } }))).toBe(
      "issue-705",
    )
    expect(previewBranch(release({ version: "0.9.1-beta-pr-803" }))).toBeUndefined()
    expect(previewBranch(release({ version: "0.9.0-beta.3", source: { prs: [head], branch: "develop" } }))).toBeUndefined()
  })

  it("is searchable", () => {
    const releases = [
      release({ version: "0.9.1-beta-pr-803", source: { prs: [{ ...pr(803), headRef: "issue-705" }] } }),
      release({ version: "0.9.0-beta.3" }),
    ]
    expect(filterVersionsByQuery(releases, "issue-705").map((r) => r.version)).toEqual(["0.9.1-beta-pr-803"])
  })
})

describe("showsDirection", () => {
  it("hides New/Earlier on preview builds but keeps Current", () => {
    expect(showsDirection(release({ version: "0.9.0-beta.3", direction: "upgrade" }))).toBe(true)
    expect(showsDirection(release({ version: "0.9.1-beta-pr-803", direction: "upgrade" }))).toBe(false)
    expect(showsDirection(release({ version: "0.9.1-beta-pr-803", direction: "current" }))).toBe(true)
    expect(
      showsDirection(release({ version: "0.9.1-beta-pr-803.2", direction: "upgrade" }), "0.9.1-beta-pr-803"),
    ).toBe(true)
    expect(
      showsDirection(release({ version: "0.9.1-beta-pr-804", direction: "upgrade" }), "0.9.1-beta-pr-803"),
    ).toBe(false)
  })
})
