import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  composeReleaseNotes,
  extractPullRequestNumbers,
  resolveLastChangeCommit,
  resolvePreviousTag,
} from "./compose-release-notes.mjs";

describe("release note composition helpers", () => {
  it("selects the newest ancestral numbered beta before a stable tag", () => {
    const ancestral = new Set(["v0.8.0-beta.1", "v0.7.9"]);
    expect(
      resolvePreviousTag(
        ["v0.8.0-beta.3", "v0.8.0-beta.2", "v0.8.0-beta.1", "v0.7.9"],
        "v0.8.0-beta.3",
        "source",
        (tag) => ancestral.has(tag),
      ),
    ).toBe("v0.8.0-beta.1");
  });

  it("falls back to the newest ancestral stable tag", () => {
    expect(
      resolvePreviousTag(
        ["v0.9.0", "v0.8.0", "v0.8.1-beta.1"],
        "v0.8.1-beta.2",
        "source",
        (tag) => tag === "v0.8.0",
      ),
    ).toBe("v0.8.0");
  });

  it("excludes the target, staging, RC, malformed, and non-ancestral tags", () => {
    expect(
      resolvePreviousTag(
        [
          "v1.0.0-beta.2",
          "v1.0.0-beta-123",
          "v1.0.0-rc.1",
          "not-a-tag",
          "v1.0.0-beta.1",
        ],
        "v1.0.0-beta.2",
        "source",
        () => false,
      ),
    ).toBeUndefined();
  });

  it("extracts merge and squash PR numbers, deduplicated and capped", () => {
    expect(
      extractPullRequestNumbers(
        [
          "Merge pull request #12 from org/branch",
          "feat: change (#13)",
          "feat: duplicate (#13)",
          "not exact (#14) extra",
          "Merge pull request #15",
        ],
        3,
      ),
    ).toEqual([12, 13, 15]);
  });

  it("uses the parent only for exact release-control subjects", () => {
    const parent = vi.fn(() => ({ sha: "parent" }));
    expect(resolveLastChangeCommit("RELEASE: beta", parent)).toEqual({
      sha: "parent",
    });
    expect(
      resolveLastChangeCommit(
        "chore(release): v0.8.0-beta.2 [skip ci]",
        parent,
      ),
    ).toEqual({ sha: "parent" });
    expect(resolveLastChangeCommit("release: beta", parent)).toBeUndefined();
    expect(resolveLastChangeCommit("RELEASE: nightly", parent)).toBeUndefined();
    expect(
      resolveLastChangeCommit("fix: RELEASE: beta", parent),
    ).toBeUndefined();
    expect(parent).toHaveBeenCalledTimes(2);
  });

  it("fetches the named PR directly and skips commit discovery", () => {
    const ghCalls = [];
    const result = composeReleaseNotes(
      {
        repo: "o/r",
        tag: "0.7.5-beta-pr-42",
        branch: "feature/x",
        triggerSha: "1a2b3c4",
        prNumber: "42",
      },
      {
        git: () => {
          throw new Error("git should not run for PR-based discovery");
        },
        listGitTags: () => [],
        commitInfo: (sha) => ({
          sha,
          url: `https://github.com/o/r/commit/${sha}`,
          subject: "feat: x",
        }),
        warn: () => {},
        gh: (args) => {
          ghCalls.push(args[0]);
          if (args[0] === "repos/o/r/pulls/42") {
            return JSON.stringify({
              number: 42,
              html_url: "https://github.com/o/r/pull/42",
              merged_at: null,
              head: { ref: "feature/x", repo: { full_name: "o/r" } },
              base: { ref: "develop", repo: { full_name: "o/r" } },
              user: { login: "dev" },
              title: "Add x",
            });
          }
          return "Generated body";
        },
      },
    );
    expect(ghCalls).toContain("repos/o/r/pulls/42");
    expect(ghCalls.some((path) => path.includes("/commits/"))).toBe(false);
    expect(result).toContain("PR [#42](https://github.com/o/r/pull/42)");
    expect(result).toContain("Generated body");
  });

  it("rejects a non-numeric PR number", () => {
    expect(() =>
      composeReleaseNotes({
        repo: "o/r",
        tag: "0.7.5-beta-pr-x",
        branch: "feature/x",
        triggerSha: "1a2b3c4",
        prNumber: "not-a-number",
      }),
    ).toThrow(/PR_NUMBER/);
  });

  it("writes no partial stdout when composition fails", () => {
    const script = fileURLToPath(
      new URL("./compose-release-notes.mjs", import.meta.url),
    );
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: { ...process.env, REPO: "", TAG: "", BRANCH: "", TRIGGER_SHA: "" },
    });
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });
});
