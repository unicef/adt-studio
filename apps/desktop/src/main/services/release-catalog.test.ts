import { describe, expect, it } from "vitest";
import {
  betaReleaseDownloadUrl,
  compareReleaseVersions,
  createBetaReleaseCatalog,
  isBetaReleaseVersion,
  type GitHubReleaseAsset,
  type GitHubRelease,
} from "./release-catalog";

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

  it("recognizes only supported beta versions", () => {
    expect(isBetaReleaseVersion("0.7.4-beta.5")).toBe(true);
    expect(isBetaReleaseVersion("v0.7.4-beta")).toBe(true);
    expect(isBetaReleaseVersion("0.7.4-beta.0")).toBe(true);
    expect(isBetaReleaseVersion("0.7.5-beta-123")).toBe(true);
    expect(isBetaReleaseVersion("0.7.5-beta-0")).toBe(false);
    expect(isBetaReleaseVersion("0.7.4")).toBe(false);
    expect(isBetaReleaseVersion("0.7.4-rc.1")).toBe(false);
  });

  it("rejects numeric identifiers with leading zeros (semver)", () => {
    expect(isBetaReleaseVersion("01.7.4-beta.1")).toBe(false);
    expect(isBetaReleaseVersion("0.07.4-beta.1")).toBe(false);
    expect(isBetaReleaseVersion("0.7.04-beta.1")).toBe(false);
    expect(isBetaReleaseVersion("0.7.4-beta.01")).toBe(false);
    expect(isBetaReleaseVersion("0.7.4-beta-01")).toBe(false);
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
