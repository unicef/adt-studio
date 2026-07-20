import { describe, expect, it } from "vitest";
import {
  calculateReleaseVersion,
  parseReleaseTag,
} from "./calculate-release-version.mjs";

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

  it("creates a staging version from the next beta core and PR number", () => {
    expect(calculateReleaseVersion(tags, "staging", "123")).toBe(
      "0.7.5-beta-123",
    );
  });

  it("rejects invalid types and staging PR numbers", () => {
    expect(() => calculateReleaseVersion(tags, "rc")).toThrow(
      "Unsupported release type",
    );
    expect(() =>
      calculateReleaseVersion(tags, "staging", "unsafe/number"),
    ).toThrow("pull request number");
    expect(() => calculateReleaseVersion(tags, "staging", "0")).toThrow(
      "pull request number",
    );
  });
});

describe("parseReleaseTag", () => {
  it("accepts stable, beta, and staging tags only", () => {
    expect(parseReleaseTag("v1.2.3")).toMatchObject({
      beta: null,
      staging: null,
    });
    expect(parseReleaseTag("1.2.3-beta.4")).toMatchObject({
      beta: 4,
      staging: null,
    });
    expect(parseReleaseTag("1.2.3-beta-45")).toMatchObject({
      beta: 0,
      staging: 45,
    });
    expect(parseReleaseTag("1.2.3-beta.0")).toMatchObject({
      beta: 0,
      staging: null,
    });
    expect(parseReleaseTag("1.2.3-beta-0")).toBeNull();
    expect(parseReleaseTag("1.2.3-rc.1")).toBeNull();
  });

  it("rejects numeric identifiers with leading zeros (semver)", () => {
    expect(parseReleaseTag("01.2.3")).toBeNull();
    expect(parseReleaseTag("1.02.3")).toBeNull();
    expect(parseReleaseTag("1.2.03")).toBeNull();
    expect(parseReleaseTag("1.2.3-beta.01")).toBeNull();
    expect(parseReleaseTag("1.2.3-beta-01")).toBeNull();
  });
});
