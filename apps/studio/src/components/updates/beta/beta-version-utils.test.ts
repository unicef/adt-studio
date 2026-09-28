import { describe, expect, it } from "vitest"
import type { AvailableRelease } from "@/hooks/use-update-status"
import {
  filterVersionsByQuery,
  githubAvatarUrl,
  releaseContributors,
  releaseDisplayTitle,
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
    expect(releaseDisplayTitle(release({ releaseNotes: "## What's Changed\n* a" }))).toBe("v0.8.0-beta.1")
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
