import { describe, expect, it, vi } from "vitest";
import { formatReleaseSourceSection } from "@root/scripts/release-source-notes.mjs";
import {
  betaReleaseDownloadUrl,
  compareReleaseVersions,
  createBetaReleaseCatalog,
  fetchGitHubReleaseByVersion,
  isBetaReleaseVersion,
  parseGitHubRelease,
  type GitHubReleaseAsset,
  type GitHubRelease,
} from "./release-catalog";

const releaseSource = {
  branch: "develop",
  title: "Reliable glossary edits",
  description:
    "This beta keeps manually edited glossary terms across re-runs.",
  coverUrl:
    "https://github.com/user-attachments/assets/7565356c-97ea-4969-9ad1-3cf47d134be5",
  buildCommit: {
    sha: "1a2b3c4",
    url: "https://github.com/unicef/adt-studio/commit/1a2b3c4",
    subject: "RELEASE: beta",
  },
  prs: [
    {
      number: 123,
      url: "https://github.com/unicef/adt-studio/pull/123",
      headRef: "feat/source",
      baseRef: "develop",
      author: "alice",
      title: "Show release source",
    },
  ],
};

function release(
  tagName: string,
  assets: GitHubReleaseAsset[] = [
    { name: "latest.yml", size: 100 },
    { name: `adt-studio-beta-${tagName}.exe`, size: 200 },
  ],
): GitHubRelease {
  return {
    tagName,
    draft: false,
    releaseDate: "2026-07-14T12:00:00Z",
    releaseNotes: `Changes in ${tagName}`,
    assets,
  };
}

describe("release catalog version handling", () => {
  it("parses release provenance and removes its markdown section", () => {
    const body = `### What's Changed\n\n- Added provenance\n\n${formatReleaseSourceSection(releaseSource)}`;
    const [parsed] = parseGitHubRelease({
      tag_name: "v0.8.0-beta.1",
      draft: false,
      author: { login: "release-author" },
      body,
      assets: [],
    });

    expect(parsed.author).toBe("release-author");
    expect(parsed.title).toBe(releaseSource.title);
    expect(parsed.description).toBe(releaseSource.description);
    expect(parsed.coverUrl).toBe(releaseSource.coverUrl);
    expect(parsed.coverAlt).toBeUndefined();
    expect(parsed.releaseNotes).toBe("### What's Changed\n\n- Added provenance");
    expect(parsed.releaseNotes).not.toContain("Release source");
    expect(parsed.source).toEqual(releaseSource);
  });

  it("keeps English AI notes after the provenance section", () => {
    const body = [
      "## What's Changed",
      "",
      "- Existing factual note",
      "",
      formatReleaseSourceSection(releaseSource),
      "",
      "<!-- adt-ai-notes:start -->",
      "## Reliable beta",
      "",
      "English generated notes",
      "<!-- adt-ai-notes:end -->",
    ].join("\n");
    const [parsed] = parseGitHubRelease({
      tag_name: "v0.8.0-beta.1",
      draft: false,
      body,
      assets: [],
    });

    expect(parsed.releaseNotes).toContain("English generated notes");
    expect(parsed.releaseNotes).not.toContain("### Release source");
    expect(parsed.source).toEqual(releaseSource);
  });

  it("extracts generated covers and keeps trailing English notes", () => {
    const sourceWithoutCover = { ...releaseSource, coverUrl: undefined };
    const light =
      "https://github.com/unicef/adt-studio/releases/download/v0.8.0-beta.1/release-cover-light.png";
    const dark =
      "https://github.com/unicef/adt-studio/releases/download/v0.8.0-beta.1/release-cover-dark.png";
    const body = [
      "<!-- adt-ai-cover:start -->",
      "<picture>",
      `  <source media="(prefers-color-scheme: dark)" srcset="${dark}">`,
      `  <source media="(prefers-color-scheme: light)" srcset="${light}">`,
      `  <img alt="Kids &amp; buddies" src="${light}">`,
      "</picture>",
      "<!-- adt-ai-cover:end -->",
      "",
      "## What's Changed",
      "",
      "- Existing factual note",
      "",
      formatReleaseSourceSection(sourceWithoutCover),
      "",
      "<!-- adt-ai-notes:start -->",
      "## Safer editing",
      "",
      "English generated notes",
      "<!-- adt-ai-notes:end -->",
    ].join("\n");

    const [parsed] = parseGitHubRelease({
      tag_name: "v0.8.0-beta.1",
      draft: false,
      body,
      assets: [],
    });

    expect(parsed.coverUrl).toBe(light);
    expect(parsed.coverDarkUrl).toBe(dark);
    expect(parsed.coverAlt).toBe("Kids & buddies");
    expect(parsed.releaseNotes).toContain("English generated notes");
    expect(parsed.releaseNotes).not.toContain("adt-ai-cover");
    expect(parsed.releaseNotes).not.toContain("<picture>");
    expect(parsed.releaseNotes).not.toContain("### Release source");
    expect(parsed.rawReleaseNotes).toContain("adt-ai-cover:start");
    expect(parsed.rawReleaseNotes).toContain("<picture>");
    expect(parsed.rawReleaseNotes).toContain("English generated notes");
    expect(parsed.rawReleaseNotes).not.toContain("### Release source");
  });

  it("fetches the exact release body used by a stable updater version", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: "v0.8.0",
          draft: false,
          body:
            '<picture><img alt="Release cover" src="https://github.com/unicef/adt-studio/releases/download/v0.8.0/release-cover-light.png"></picture>\n\nStable notes',
          assets: [],
        }),
        { status: 200 },
      ),
    );

    const result = await fetchGitHubReleaseByVersion("0.8.0", fetchImpl);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(
      String(fetchImpl.mock.calls[0][0]).endsWith("/releases/tags/v0.8.0"),
    ).toBe(true);
    expect(result?.rawReleaseNotes).toContain("<picture>");
  });

  it("supports staging tags that do not use the stable v prefix", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tag_name: "0.8.0-beta-pr-803",
            draft: false,
            body: "Staging notes",
            assets: [],
          }),
          { status: 200 },
        ),
      );

    const result = await fetchGitHubReleaseByVersion(
      "0.8.0-beta-pr-803",
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(
      String(fetchImpl.mock.calls[1][0]).endsWith(
        "/releases/tags/0.8.0-beta-pr-803",
      ),
    ).toBe(true);
    expect(result?.tagName).toBe("0.8.0-beta-pr-803");
  });

  it("leaves release bodies without provenance untouched", () => {
    const body = "# Changes\n\nOrdinary release notes";
    const [parsed] = parseGitHubRelease({
      tag_name: "v0.8.0-beta.1",
      body,
    });
    expect(parsed.releaseNotes).toBe(body);
    expect(parsed.source).toBeUndefined();
  });

  it("preserves generic release headings as notes", () => {
    const body = "## What's Changed\n\n- Fixed the updater";
    const [parsed] = parseGitHubRelease({
      tag_name: "v0.8.0-beta.1",
      body,
    });
    expect(parsed.title).toBeUndefined();
    expect(parsed.releaseNotes).toBe(body);
  });

  it("orders beta increments independently of a stable release", () => {
    expect(
      compareReleaseVersions("0.7.4-beta.5", "0.7.4-beta.1"),
    ).toBeGreaterThan(0);
    expect(compareReleaseVersions("0.7.4", "0.7.4-beta.5")).toBeGreaterThan(0);
    expect(
      compareReleaseVersions("0.7.5-beta.1", "0.7.5-beta-123"),
    ).toBeGreaterThan(0);
  });

  it("distinguishes staging versions from different pull requests", () => {
    expect(
      compareReleaseVersions("0.7.5-beta-123", "0.7.5-beta-45"),
    ).not.toBe(0);
    expect(compareReleaseVersions("0.7.5-beta-123", "0.7.5-beta-123")).toBe(0);
    expect(
      compareReleaseVersions("0.7.5-beta-123", "0.7.5-beta"),
    ).not.toBe(0);
  });

  it("recognizes only beta versions", () => {
    expect(isBetaReleaseVersion("0.7.4-beta.5")).toBe(true);
    expect(isBetaReleaseVersion("v0.7.4-beta")).toBe(true);
    expect(isBetaReleaseVersion("0.7.4-beta.0")).toBe(true);
    expect(isBetaReleaseVersion("0.7.5-beta-123")).toBe(true);
    expect(isBetaReleaseVersion("0.7.4")).toBe(false);
    expect(isBetaReleaseVersion("0.7.4-rc.1")).toBe(false);
    expect(isBetaReleaseVersion("0.4.0-electron")).toBe(false);
    expect(isBetaReleaseVersion("0.7.4-betafix.1")).toBe(false);
  });

  it("rejects numeric identifiers with leading zeros (semver)", () => {
    expect(isBetaReleaseVersion("01.7.4-beta.1")).toBe(false);
    expect(isBetaReleaseVersion("0.07.4-beta.1")).toBe(false);
    expect(isBetaReleaseVersion("0.7.04-beta.1")).toBe(false);
    expect(isBetaReleaseVersion("0.7.4-beta.01")).toBe(false);
  });

  it("lists beta upgrades, current release, and downgrades while ignoring stable", () => {
    const catalog = createBetaReleaseCatalog(
      [
        release("v0.7.4"),
        release("v0.7.4-beta.1"),
        release("v0.7.4-beta.5"),
        release("v0.7.4-beta.3"),
      ],
      "0.7.4-beta.3",
      "win32",
    );

    expect(
      catalog.map(({ version, direction }) => ({ version, direction })),
    ).toEqual([
      { version: "0.7.4-beta.5", direction: "upgrade" },
      { version: "0.7.4-beta.3", direction: "current" },
      { version: "0.7.4-beta.1", direction: "downgrade" },
    ]);
    expect(catalog[0].updaterChannel).toBe("latest");
    expect(betaReleaseDownloadUrl(catalog[0])).toBe(
      "https://github.com/unicef/adt-studio/releases/download/v0.7.4-beta.5/",
    );
  });

  it("also supports beta-named updater metadata", () => {
    const [entry] = createBetaReleaseCatalog(
      [release("v0.7.4-beta.5", [{ name: "beta.yml" }])],
      "0.7.4-beta.1",
      "win32",
    );

    expect(entry.updaterChannel).toBe("beta");
  });

  it("propagates provenance into beta catalog entries", () => {
    const candidate = release("v0.7.4-beta.5");
    candidate.source = releaseSource;
    candidate.author = "release-author";
    candidate.title = "Clearer beta updates";
    candidate.description = "A concise beta summary.";
    candidate.coverUrl =
      "https://github.com/user-attachments/assets/cover-id";
    candidate.coverDarkUrl =
      "https://github.com/user-attachments/assets/cover-dark-id";
    candidate.coverAlt = "Update cover";
    candidate.rawReleaseNotes = "Complete English update body";
    const [entry] = createBetaReleaseCatalog(
      [candidate],
      "v0.7.4-beta.1",
      "win32",
    );
    expect(entry.source).toEqual(releaseSource);
    expect(entry.author).toBe("release-author");
    expect(entry.title).toBe("Clearer beta updates");
    expect(entry.description).toBe("A concise beta summary.");
    expect(entry.coverUrl).toBe(candidate.coverUrl);
    expect(entry.coverDarkUrl).toBe(candidate.coverDarkUrl);
    expect(entry.coverAlt).toBe("Update cover");
    expect(entry.rawReleaseNotes).toBe(candidate.rawReleaseNotes);
  });

  it("excludes releases without updater metadata for the current platform", () => {
    expect(
      createBetaReleaseCatalog(
        [release("v0.7.4-beta.5", [{ name: "latest-mac.yml" }])],
        "0.7.4-beta.1",
        "win32",
      ),
    ).toEqual([]);
  });
});
