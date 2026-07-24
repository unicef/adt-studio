import { execFileSync } from "node:child_process";

export const RELEASE_VERSION_PATTERN =
  /^[vV]?(?<major>0|[1-9]\d*)\.(?<minor>0|[1-9]\d*)\.(?<patch>0|[1-9]\d*)(?:-(?<prerelease>(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+(?<buildmetadata>[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function parseReleaseTag(value) {
  const match = value.trim().match(RELEASE_VERSION_PATTERN);
  if (!match) return null;
  const major = Number(match.groups.major);
  const minor = Number(match.groups.minor);
  const patch = Number(match.groups.patch);
  const prerelease =
    match.groups.prerelease == null
      ? null
      : match.groups.prerelease
          .split(".")
          .map((id) => (/^\d+$/.test(id) ? Number(id) : id));
  const numbers = [major, minor, patch, ...(prerelease ?? [])].filter(
    (part) => typeof part === "number",
  );
  if (!numbers.every(Number.isSafeInteger)) return null;
  return { major, minor, patch, prerelease };
}

export function isBetaVersion(version) {
  const first = version.prerelease?.[0];
  return (
    first === "beta" || (typeof first === "string" && first.startsWith("beta-"))
  );
}

export function betaNumberOf(version) {
  const pre = version.prerelease;
  if (pre && pre[0] === "beta" && typeof pre[1] === "number") return pre[1];
  return null;
}

export function compareReleaseVersions(left, right) {
  const core = compareCore(left, right);
  if (core !== 0) return core;
  const betaKind = compareBetaKind(left, right);
  if (betaKind !== 0) return betaKind;
  return comparePrerelease(left.prerelease, right.prerelease);
}

function isStagingBeta(version) {
  const first = version.prerelease?.[0];
  return (
    typeof first === "string" && first !== "beta" && first.startsWith("beta-")
  );
}

function compareBetaKind(left, right) {
  const leftStaging = isStagingBeta(left);
  const rightStaging = isStagingBeta(right);
  if (leftStaging === rightStaging) return 0;
  return leftStaging ? -1 : 1;
}

function comparePrerelease(left, right) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  const shared = Math.min(left.length, right.length);
  for (let i = 0; i < shared; i++) {
    const identifier = compareIdentifier(left[i], right[i]);
    if (identifier !== 0) return identifier;
  }
  return left.length - right.length;
}

function compareIdentifier(left, right) {
  const leftNumeric = typeof left === "number";
  const rightNumeric = typeof right === "number";
  if (leftNumeric && rightNumeric) return left - right;
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
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
