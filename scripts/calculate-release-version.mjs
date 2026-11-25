import { pathToFileURL } from "node:url";
import {
  betaNumberOf,
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

export function calculateReleaseVersion(tags, releaseType, stagingSlug, stagingBuild) {
  const versions = tags.map(parseReleaseTag).filter(Boolean);
  const stable = versions
    .filter((version) => version.prerelease == null)
    .sort(compareReleaseVersions)
    .at(-1) ?? { major: 0, minor: 0, patch: 0, prerelease: null };

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
    .filter((version) => betaNumberOf(version) != null)
    .sort(compareReleaseVersions)
    .at(-1);
  const continueBetaLine =
    latestBeta &&
    compareCore(latestBeta, stable) > 0 &&
    compareCore(latestBeta, candidate) >= 0;
  const core = continueBetaLine ? latestBeta : candidate;

  if (releaseType === "staging") {
    if (!stagingSlug || !/^[0-9A-Za-z-]+$/.test(stagingSlug)) {
      throw new Error(
        "Staging versions require a branch slug (letters, numbers, and hyphens)",
      );
    }
    return `${formatCore(core)}-beta-${stagingSlug}${stagingBuildSuffix(versions, core, stagingSlug, stagingBuild)}`;
  }

  const betaNumber = continueBetaLine ? betaNumberOf(latestBeta) + 1 : 1;
  return `${formatCore(core)}-beta.${betaNumber}`;
}

/**
 * Re-staging a PR must not reuse its version: the in-app updater refuses to
 * install a version equal to the running one, so a rebuild with the same tag
 * could never reach anyone already on the previous build. The first build keeps
 * the bare `-beta-<slug>` tag; each rebuild on the same core appends `.2`, `.3`…,
 * which semver orders after the bare tag and after each other.
 *
 * Counting tags alone can go backwards: staging cleanup (or deleting a preview by
 * hand) removes the tags, and the next build would restart at the bare tag, below
 * what people already have installed. So the staging workflow also passes a
 * number that only goes up (its run number), and the suffix is never below it.
 */
function stagingBuildSuffix(versions, core, stagingSlug, stagingBuild) {
  const identifier = `beta-${stagingSlug}`;
  const builds = versions
    .filter(
      (version) =>
        version.prerelease?.[0] === identifier && compareCore(version, core) === 0,
    )
    .map((version) =>
      typeof version.prerelease[1] === "number" ? version.prerelease[1] : 1,
    );
  const floor = Number.isSafeInteger(stagingBuild) && stagingBuild > 0 ? stagingBuild : 0;
  const next = builds.length === 0 ? 0 : Math.max(...builds) + 1;
  const build = Math.max(next, floor);
  return build === 0 ? "" : `.${build}`;
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
  const [, , releaseType, stagingSlug, stagingBuild] = process.argv;
  if (!releaseType) {
    console.error(
      "Usage: node scripts/calculate-release-version.mjs <major|minor|patch|beta|beta-minor|beta-major|staging> [staging-slug] [staging-build]",
    );
    process.exitCode = 1;
    return;
  }
  try {
    console.log(
      calculateReleaseVersion(
        listGitTags(),
        releaseType,
        stagingSlug,
        stagingBuild ? Number(stagingBuild) : undefined,
      ),
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
