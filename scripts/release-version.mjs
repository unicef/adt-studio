import { execFileSync } from "node:child_process";

export const RELEASE_VERSION_PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta(?:\.(0|[1-9]\d*)|-([1-9]\d*))?)?$/i;

export function parseReleaseTag(value) {
  const match = value.trim().match(RELEASE_VERSION_PATTERN);
  if (!match) return null;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const beta =
    match[4] == null ? (/-beta/i.test(value) ? 0 : null) : Number(match[4]);
  const staging = match[5] == null ? null : Number(match[5]);
  if (
    ![major, minor, patch, beta ?? 0, staging ?? 0].every(Number.isSafeInteger)
  ) {
    return null;
  }
  return { major, minor, patch, beta, staging };
}

export function compareReleaseVersions(left, right) {
  const core = compareCore(left, right);
  if (core !== 0) return core;
  if (left.beta == null && right.beta == null) return 0;
  if (left.beta == null) return 1;
  if (right.beta == null) return -1;
  if (left.beta !== right.beta) return left.beta - right.beta;
  return (left.staging ?? 0) - (right.staging ?? 0);
}

export function compareCore(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

export function formatCore(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

export function listGitTags() {
  try {
    return execFileSync("git", ["tag", "--list"], { encoding: "utf8" })
      .split(/\r?\n/)
      .map((tag) => tag.trim())
      .filter(Boolean);
  } catch (error) {
    throw new Error(
      "Failed to list git tags. Run this script inside a git repository " +
        "with access to its tags (e.g. checkout with fetch-depth: 0).\n" +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}
