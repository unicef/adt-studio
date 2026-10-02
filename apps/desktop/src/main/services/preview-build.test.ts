import { describe, expect, it } from "vitest";
import {
  createBetaReleaseCatalog,
  type GitHubRelease,
} from "./release-catalog";
import {
  parsePullRequest,
  previewPullRequestNumber,
  resolvePreviewBuildStatus,
  type PullRequest,
} from "./preview-build";

const PREVIEW = "0.7.6-beta-pr-771";
const MERGED: PullRequest = {
  state: "merged",
  mergedAt: "2026-08-11T07:15:23Z",
  title: "Onboarding redesign",
  author: "Eliezir",
};

function release(tagName: string, releaseDate: string, prs?: number[]): GitHubRelease {
  return {
    tagName,
    draft: false,
    releaseDate,
    assets: [{ name: "latest.yml" }],
    source: prs && {
      prs: prs.map((number) => ({
        number,
        url: `https://github.com/unicef/adt-studio/pull/${number}`,
      })),
    },
  };
}

function status(pullRequest: PullRequest, releases: GitHubRelease[]) {
  return resolvePreviewBuildStatus(
    PREVIEW,
    pullRequest,
    createBetaReleaseCatalog(releases, PREVIEW, "win32"),
  );
}

describe("previewPullRequestNumber", () => {
  it("reads the PR number from a staging version only", () => {
    expect(previewPullRequestNumber("0.8.1-beta-pr-867")).toBe(867);
    expect(previewPullRequestNumber("v0.8.1-beta-pr-867")).toBe(867);
    expect(previewPullRequestNumber("0.8.0-beta.1")).toBeUndefined();
    expect(previewPullRequestNumber("0.8.0")).toBeUndefined();
  });
});

describe("resolvePreviewBuildStatus", () => {
  it("is null for anything but a staging build", () => {
    expect(resolvePreviewBuildStatus("0.8.0-beta.1", MERGED, [])).toBeNull();
  });

  it("reports an open PR and the newest numbered beta", () => {
    expect(
      status({ state: "open" }, [
        release("v0.7.5-beta.2", "2026-08-11T08:00:00Z"),
        release("v0.7.6-beta.1", "2026-08-19T00:00:00Z"),
      ]),
    ).toMatchObject({
      state: "open",
      pullRequest: { number: 771, url: "https://github.com/unicef/adt-studio/pull/771" },
      latestBeta: "0.7.6-beta.1",
      shippedIn: undefined,
    });
  });

  it("names the first beta whose PR list includes the merge", () => {
    expect(
      status(MERGED, [
        release("v0.7.5-beta.2", "2026-08-11T08:00:00Z", [760]),
        release("v0.7.6-beta.1", "2026-08-19T00:00:00Z", [771]),
      ])?.shippedIn,
    ).toBe("0.7.6-beta.1");
  });

  it("falls back to dates only when a PR list is missing or may be truncated", () => {
    const full = Array.from({ length: 10 }, (_, index) => 700 + index);
    expect(status(MERGED, [release("v0.7.5-beta.2", "2026-08-11T08:00:00Z")])?.shippedIn).toBe(
      "0.7.5-beta.2",
    );
    expect(
      status(MERGED, [release("v0.7.5-beta.2", "2026-08-11T08:00:00Z", full)])?.shippedIn,
    ).toBe("0.7.5-beta.2");
    expect(
      status(MERGED, [release("v0.7.5-beta.2", "2026-08-11T08:00:00Z", [760])])?.shippedIn,
    ).toBeUndefined();
  });
});

describe("parsePullRequest", () => {
  it("reads open, merged and closed pull requests", () => {
    expect(
      parsePullRequest({
        state: "closed",
        merged_at: "2026-08-11T07:15:23Z",
        base: { ref: "develop" },
        title: "Onboarding redesign",
        user: { login: "Eliezir" },
      }),
    ).toEqual(MERGED);
    expect(parsePullRequest({ state: "closed", merged_at: null }).state).toBe("closed");
    expect(parsePullRequest({ state: "open" }).state).toBe("open");
  });

  it("keeps a PR merged into another branch open, since it has not reached a beta", () => {
    expect(
      parsePullRequest({
        state: "closed",
        merged_at: "2026-08-11T07:15:23Z",
        base: { ref: "eliezir/parent-feature" },
      }),
    ).toEqual({ state: "open", mergedAt: undefined, title: undefined, author: undefined });
  });
});
