// Rewrites the `options:` list of every `type: dropdown` block with
// `id: version` found under .github/ISSUE_TEMPLATE/*.yml so that it lists:
//   - the 3 most recent beta / pre-release versions
//   - the 3 most recent official (stable) versions
//   - any non-version entries from the existing dropdown (e.g. "Older / unsure"),
//     in their original order
// The candidate set comes from `git tag --list`. An optional <tag> argument is
// folded into the candidates so the script can include a not-yet-pushed tag
// (e.g. during a release run where the tag is created later in the pipeline).
// Formatting, indentation, and line endings are preserved.
//
// Pass --require-full-history in release automation to fail closed instead of
// replacing the dropdown from an incomplete shallow-clone tag set.
//
// Usage: node scripts/update-issue-template-versions.mjs [<tag>] [--require-full-history]

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  compareReleaseVersions,
  isBetaVersion,
  listGitTags,
  parseReleaseTag,
} from "./release-version.mjs";

const args = process.argv.slice(2);
const requireFullHistory = args.includes("--require-full-history");
const positionalArgs = args.filter((arg) => arg !== "--require-full-history");

if (positionalArgs.length > 1) {
  console.error(
    "Usage: node scripts/update-issue-template-versions.mjs " +
      "[<tag>] [--require-full-history]",
  );
  process.exit(1);
}

const extraTag = positionalArgs[0] ?? null;

const KEEP_OFFICIAL = 3;
const KEEP_BETA = 3;

function topVersions(candidates) {
  const seen = new Set();
  const versions = [];
  for (const raw of candidates) {
    if (seen.has(raw)) continue;
    seen.add(raw);
    const parsed = parseReleaseTag(raw);
    if (parsed) versions.push({ ...parsed, raw });
  }
  const desc = (a, b) => compareReleaseVersions(b, a);
  const official = versions
    .filter((v) => v.prerelease === null)
    .sort(desc)
    .slice(0, KEEP_OFFICIAL);
  const beta = versions.filter(isBetaVersion).sort(desc).slice(0, KEEP_BETA);
  return {
    topBeta: beta.map((v) => v.raw),
    topOfficial: official.map((v) => v.raw),
    parsedCount: versions.length,
  };
}

let gitTags;
try {
  gitTags = listGitTags();
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
const candidates = extraTag ? [...gitTags, extraTag] : gitTags;
const { topBeta, topOfficial, parsedCount } = topVersions(candidates);
const topList = [...topBeta, ...topOfficial];

console.log(`extraTag (CLI arg): ${extraTag ?? "(none)"}`);
console.log(
  `git tag --list returned ${gitTags.length} tag(s)` +
    (gitTags.length ? `: ${gitTags.join(", ")}` : ""),
);
console.log(`Parsed as version tags: ${parsedCount}`);
console.log(
  `Top ${topBeta.length} beta(s): ${topBeta.length ? topBeta.join(", ") : "(none)"}`,
);
console.log(
  `Top ${topOfficial.length} official(s): ${
    topOfficial.length ? topOfficial.join(", ") : "(none)"
  }`,
);
if (
  requireFullHistory &&
  (topBeta.length < KEEP_BETA || topOfficial.length < KEEP_OFFICIAL)
) {
  console.error(
    "Refusing to update issue templates from an incomplete tag set: " +
      `found ${topBeta.length}/${KEEP_BETA} beta and ` +
      `${topOfficial.length}/${KEEP_OFFICIAL} official versions. ` +
      "Fetch all tags before retrying.",
  );
  process.exit(1);
}
if (gitTags.length <= 1) {
  console.warn(
    "::warning::Only " +
      gitTags.length +
      " git tag(s) visible — the runner likely has a shallow clone. " +
      "Use `actions/checkout@v4` with `fetch-depth: 0` to fetch full tag history.",
  );
}

const dir = ".github/ISSUE_TEMPLATE";
const files = readdirSync(dir).filter(
  (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
);

let changedCount = 0;

for (const file of files) {
  const path = join(dir, file);
  const original = readFileSync(path, "utf8");

  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const lines = original.split(/\r?\n/);

  let state = "idle";
  let foundVersion = false;
  const out = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*-\s+type:\s*\S/.test(line)) {
      state = /^\s*-\s+type:\s*dropdown\s*$/.test(line) ? "dropdown" : "idle";
      out.push(line);
      continue;
    }

    if (state === "dropdown" && /^\s*id:\s*version\s*$/.test(line)) {
      state = "versionDropdown";
      out.push(line);
      continue;
    }

    if (state === "versionDropdown" && /^\s*attributes:\s*$/.test(line)) {
      state = "versionAttributes";
      out.push(line);
      continue;
    }

    if (state === "versionAttributes" && /^\s*options:\s*$/.test(line)) {
      out.push(line);
      const optionIndent = line.match(/^(\s*)/)[1] + "  ";

      // Read the existing options so we can preserve any non-version entries
      // (e.g. "Older / unsure"). Their original order is kept.
      const existing = [];
      while (
        i + 1 < lines.length &&
        lines[i + 1].startsWith(optionIndent) &&
        lines[i + 1].slice(optionIndent.length).startsWith("- ")
      ) {
        i += 1;
        existing.push(lines[i].slice(optionIndent.length + 2).trim());
      }
      const others = existing.filter((o) => parseReleaseTag(o) === null);

      for (const opt of [...topList, ...others]) {
        out.push(`${optionIndent}- ${opt}`);
      }

      foundVersion = true;
      state = "idle";
      continue;
    }

    out.push(line);
  }

  const updated = out.join(eol);

  if (!foundVersion) {
    console.log(`${file}: no version dropdown found`);
  } else if (updated === original) {
    console.log(`${file}: already up to date, skipping`);
  } else {
    writeFileSync(path, updated);
    console.log(`${file}: updated version options`);
    changedCount += 1;
  }
}

if (changedCount === 0) {
  console.log("No files changed.");
}
