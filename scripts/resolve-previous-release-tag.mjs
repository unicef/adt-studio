import { pathToFileURL } from "node:url";
import {
  listGitTags,
  resolvePreviousReleaseTag,
} from "./release-version.mjs";

function main() {
  const targetTag = process.argv[2];
  if (!targetTag) {
    console.error("Usage: node scripts/resolve-previous-release-tag.mjs <tag>");
    process.exitCode = 1;
    return;
  }

  try {
    const previousTag = resolvePreviousReleaseTag(listGitTags(), targetTag);
    if (!previousTag) throw new Error(`No release tag precedes ${targetTag}`);
    console.log(previousTag);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
