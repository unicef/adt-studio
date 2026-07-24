import { describe, expect, it } from "vitest";
import {
  calculateReleaseVersion,
  parseReleaseTag,
} from "./calculate-release-version.mjs";
import { isBetaVersion } from "./release-version.mjs";

const tags = [
  "v0.6.9",
  "v0.7.4-beta.3",
  "v0.7.4-beta.4",
  "v0.7.4",
  "not-a-release",
];

describe("calculateReleaseVersion", () => {
  it("calculates stable bumps from the latest stable tag", () => {
    expect(calculateReleaseVersion(tags, "major")).toBe("1.0.0");
    expect(calculateReleaseVersion(tags, "minor")).toBe("0.8.0");
    expect(calculateReleaseVersion(tags, "patch")).toBe("0.7.5");
  });

  it("starts a new beta line after the latest stable tag", () => {
    expect(calculateReleaseVersion(tags, "beta")).toBe("0.7.5-beta.1");
  });

  it("increments a beta line that is ahead of stable", () => {
    expect(
      calculateReleaseVersion(
        [...tags, "v0.7.5-beta.1", "v0.7.5-beta.2"],
        "beta",
      ),
    ).toBe("0.7.5-beta.3");
  });

  it("starts minor and major beta lines from the latest stable tag", () => {
    expect(calculateReleaseVersion(tags, "beta-minor")).toBe("0.8.0-beta.1");
    expect(calculateReleaseVersion(tags, "beta-major")).toBe("1.0.0-beta.1");
  });

  it("continues a minor beta line with plain beta increments", () => {
    const withMinorLine = [...tags, "v0.8.0-beta.1"];
    expect(calculateReleaseVersion(withMinorLine, "beta")).toBe("0.8.0-beta.2");
    expect(calculateReleaseVersion(withMinorLine, "beta-minor")).toBe(
      "0.8.0-beta.2",
    );
    expect(calculateReleaseVersion(withMinorLine, "beta-major")).toBe(
      "1.0.0-beta.1",
    );
  });

  it("ignores non-beta pre-release tags when picking the beta line", () => {
    expect(
      calculateReleaseVersion(
        [...tags, "v0.8.0-rc.1", "v0.8.0-electron", "v0.7.5-beta-123"],
        "beta",
      ),
    ).toBe("0.7.5-beta.1");
  });

  it("creates a staging version from the next beta core and branch slug", () => {
    expect(calculateReleaseVersion(tags, "staging", "123")).toBe(
      "0.7.5-beta-123",
    );
    expect(
      calculateReleaseVersion(tags, "staging", "feature-new-beta-workflow"),
    ).toBe("0.7.5-beta-feature-new-beta-workflow");
  });

  it("rejects invalid types and staging slugs", () => {
    expect(() => calculateReleaseVersion(tags, "rc")).toThrow(
      "Unsupported release type",
    );
    expect(() =>
      calculateReleaseVersion(tags, "staging", "unsafe/slug"),
    ).toThrow("branch slug");
    expect(() => calculateReleaseVersion(tags, "staging", "")).toThrow(
      "branch slug",
    );
  });
});

describe("parseReleaseTag", () => {
  it("parses core and any semver pre-release into dot-separated identifiers", () => {
    expect(parseReleaseTag("v1.2.3")).toMatchObject({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: null,
    });
    expect(parseReleaseTag("1.2.3-beta.4")).toMatchObject({
      prerelease: ["beta", 4],
    });
    expect(parseReleaseTag("1.2.3-beta.0")).toMatchObject({
      prerelease: ["beta", 0],
    });
    expect(parseReleaseTag("1.2.3-rc.10")).toMatchObject({
      prerelease: ["rc", 10],
    });
    expect(parseReleaseTag("1.2.3-alpha.1.2")).toMatchObject({
      prerelease: ["alpha", 1, 2],
    });
  });

  it("treats a hyphenated suffix as one alphanumeric identifier", () => {
    expect(parseReleaseTag("1.2.3-beta-45")).toMatchObject({
      prerelease: ["beta-45"],
    });
    expect(parseReleaseTag("1.2.3-beta-0")).toMatchObject({
      prerelease: ["beta-0"],
    });
  });

  it("rejects tags that are not semver", () => {
    expect(parseReleaseTag("not-a-release")).toBeNull();
    expect(parseReleaseTag("1.2")).toBeNull();
  });

  it("rejects numeric identifiers with leading zeros (semver)", () => {
    expect(parseReleaseTag("01.2.3")).toBeNull();
    expect(parseReleaseTag("1.02.3")).toBeNull();
    expect(parseReleaseTag("1.2.03")).toBeNull();
    expect(parseReleaseTag("1.2.3-beta.01")).toBeNull();
  });

  it("allows leading zeros inside alphanumeric identifiers (semver)", () => {
    expect(parseReleaseTag("1.2.3-beta-01")).toMatchObject({
      prerelease: ["beta-01"],
    });
  });
});

describe("isBetaVersion", () => {
  it("accepts only beta pre-releases, including staging builds", () => {
    expect(isBetaVersion(parseReleaseTag("1.2.3-beta.4"))).toBe(true);
    expect(isBetaVersion(parseReleaseTag("1.2.3-beta"))).toBe(true);
    expect(isBetaVersion(parseReleaseTag("1.2.3-beta-45"))).toBe(true);
    expect(isBetaVersion(parseReleaseTag("1.2.3"))).toBe(false);
    expect(isBetaVersion(parseReleaseTag("1.2.3-rc.1"))).toBe(false);
    expect(isBetaVersion(parseReleaseTag("1.2.3-electron"))).toBe(false);
    expect(isBetaVersion(parseReleaseTag("1.2.3-betafix.1"))).toBe(false);
  });
});
