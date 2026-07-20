import { pathToFileURL } from "node:url";
import {
  compareCore,
  compareReleaseVersions,
  formatCore,
  listGitTags,
  parseReleaseTag,
} from "./release-version.mjs";

export { parseReleaseTag };

const BETA_BUMPS = {
  beta: "patch",
  "beta-minor": "minor",
  "beta-major": "major",
  staging: "patch",
};

export function calculateReleaseVersion(tags, releaseType, pullRequestNumber) {
  const versions = tags.map(parseReleaseTag).filter(Boolean);
  const stable = versions
    .filter((version) => version.beta == null)
    .sort(compareReleaseVersions)
    .at(-1) ?? { major: 0, minor: 0, patch: 0, beta: null, staging: null };

  if (
    releaseType === "major" ||
    releaseType === "minor" ||
    releaseType === "patch"
  ) {
    return formatCore(bumpCore(stable, releaseType));
  }

  const betaBump = BETA_BUMPS[releaseType];
  if (!betaBump) {
    throw new Error(`Unsupported release type: ${releaseType}`);
  }

  const candidate = bumpCore(stable, betaBump);
  const latestBeta = versions
    .filter((version) => version.beta != null)
    .sort(compareReleaseVersions)
    .at(-1);
  const continueBetaLine =
    latestBeta &&
    compareCore(latestBeta, stable) > 0 &&
    compareCore(latestBeta, candidate) >= 0;
  const core = continueBetaLine ? latestBeta : candidate;

  if (releaseType === "staging") {
    if (!pullRequestNumber || !/^[1-9]\d*$/.test(pullRequestNumber)) {
      throw new Error(
        "Staging versions require a positive pull request number",
      );
    }
    return `${formatCore(core)}-beta-${pullRequestNumber}`;
  }

  const betaNumber = continueBetaLine ? (latestBeta.beta ?? 0) + 1 : 1;
  return `${formatCore(core)}-beta.${betaNumber}`;
}

function bumpCore(version, bump) {
  if (bump === "major") return { major: version.major + 1, minor: 0, patch: 0 };
  if (bump === "minor") {
    return { major: version.major, minor: version.minor + 1, patch: 0 };
  }
  return {
    major: version.major,
    minor: version.minor,
    patch: version.patch + 1,
  };
}

function main() {
  const [, , releaseType, pullRequestNumber] = process.argv;
  if (!releaseType) {
    console.error(
      "Usage: node scripts/calculate-release-version.mjs <major|minor|patch|beta|beta-minor|beta-major|staging> [pull-request-number]",
    );
    process.exitCode = 1;
    return;
  }
  try {
    console.log(
      calculateReleaseVersion(listGitTags(), releaseType, pullRequestNumber),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
