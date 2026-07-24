import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  compareReleaseVersions,
  listGitTags,
  parseReleaseTag,
} from "./release-version.mjs";
import { formatReleaseSourceSection } from "./release-source-notes.mjs";

const RELEASE_CONTROL_PATTERN =
  /^RELEASE:\s*(major|minor|patch|beta|beta-minor|beta-major)\s*$/;
const RELEASE_METADATA_PATTERN = /^chore\(release\):\s+v[^ ]+\s+\[skip ci\]$/;
const MAX_PULL_REQUESTS = 10;

export function resolvePreviousTag(tags, targetTag, sourceSha, isAncestor) {
  const candidates = tags.flatMap((tag) => {
    if (tag === targetTag) return [];
    const version = parseReleaseTag(tag);
    if (!version) return [];
    const isNumberedBeta =
      version.prerelease?.length === 2 &&
      version.prerelease[0] === "beta" &&
      typeof version.prerelease[1] === "number";
    const isStable = version.prerelease === null;
    return isNumberedBeta || isStable ? [{ tag, version, isStable }] : [];
  });

  const newestAncestor = (stable) =>
    candidates
      .filter((candidate) => candidate.isStable === stable)
      .sort(
        (left, right) =>
          compareReleaseVersions(right.version, left.version) ||
          right.tag.localeCompare(left.tag),
      )
      .find((candidate) => {
        try {
          return isAncestor(candidate.tag, sourceSha);
        } catch {
          return false;
        }
      })?.tag;

  return newestAncestor(false) ?? newestAncestor(true);
}

export function extractPullRequestNumbers(subjects, cap = MAX_PULL_REQUESTS) {
  const values = Array.isArray(subjects)
    ? subjects
    : String(subjects ?? "").split(/\r?\n/);
  const numbers = [];
  const seen = new Set();

  for (const subject of values) {
    const merge = subject.match(
      /^Merge pull request #([1-9]\d+)(?: from .+)?$/,
    );
    const squash = subject.match(/\(#([1-9]\d+)\)$/);
    const value = merge?.[1] ?? squash?.[1];
    if (!value) continue;
    const number = Number(value);
    if (!Number.isSafeInteger(number) || seen.has(number)) continue;
    seen.add(number);
    numbers.push(number);
    if (numbers.length >= cap) break;
  }
  return numbers;
}

export function resolveLastChangeCommit(subject, getParentCommit) {
  if (
    !RELEASE_CONTROL_PATTERN.test(subject) &&
    !RELEASE_METADATA_PATTERN.test(subject)
  ) {
    return undefined;
  }
  return getParentCommit();
}

function command(file, args) {
  return execFileSync(file, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function git(args) {
  return command("git", args);
}

function gh(args) {
  return command("gh", ["api", ...args]);
}

function commitInfo(repo, sha) {
  git(["cat-file", "-e", `${sha}^{commit}`]);
  const fullSha = git(["rev-parse", "--verify", `${sha}^{commit}`]);
  return {
    sha: fullSha,
    url: `https://github.com/${repo}/commit/${fullSha}`,
    subject: git(["show", "-s", "--format=%s", fullSha]),
  };
}

function warn(message, error) {
  const detail = error instanceof Error ? error.message : String(error);
  process.stderr.write(`warning: ${message}: ${detail}\n`);
}

function pullRequestFromPayload(value, { requireMerged = true } = {}) {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  if (requireMerged && value.merged_at == null) {
    return undefined;
  }
  const number = value.number;
  const url = value.html_url;
  if (
    !Number.isSafeInteger(number) ||
    typeof url !== "string" ||
    !url.startsWith("https://github.com/")
  ) {
    return undefined;
  }
  const head = value.head && typeof value.head === "object" ? value.head : {};
  const base = value.base && typeof value.base === "object" ? value.base : {};
  const headRepo =
    head.repo && typeof head.repo === "object"
      ? head.repo.full_name
      : undefined;
  const baseRepo =
    base.repo && typeof base.repo === "object"
      ? base.repo.full_name
      : undefined;
  return {
    number,
    url,
    headRef:
      headRepo && baseRepo && headRepo !== baseRepo
        ? typeof head.label === "string"
          ? head.label
          : undefined
        : typeof head.ref === "string"
          ? head.ref
          : undefined,
    baseRef: typeof base.ref === "string" ? base.ref : undefined,
    author:
      value.user &&
      typeof value.user === "object" &&
      typeof value.user.login === "string"
        ? value.user.login
        : undefined,
    title: typeof value.title === "string" ? value.title : undefined,
  };
}

function parseJson(value) {
  return JSON.parse(value);
}

export function composeReleaseNotes(
  { repo, tag, branch, triggerSha, prNumber },
  dependencies = {},
) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo ?? "")) {
    throw new Error("REPO must be an owner/repository name");
  }
  for (const [name, value] of Object.entries({
    TAG: tag,
    BRANCH: branch,
    TRIGGER_SHA: triggerSha,
  })) {
    if (!value) throw new Error(`${name} is required`);
  }

  if (!/^[0-9a-fA-F]{7,40}$/.test(triggerSha)) {
    throw new Error("TRIGGER_SHA must be a git commit SHA");
  }
  if (!parseReleaseTag(tag)) {
    throw new Error("TAG must be a valid release version");
  }

  const pr =
    prNumber != null && String(prNumber).trim() !== ""
      ? String(prNumber).trim()
      : undefined;
  if (pr && !/^[0-9]+$/.test(pr)) {
    throw new Error("PR_NUMBER must be a positive integer");
  }

  const runGit = dependencies.git ?? git;
  const runGh = dependencies.gh ?? gh;
  const tags = dependencies.listGitTags ?? listGitTags;
  const getCommit = dependencies.commitInfo ?? ((sha) => commitInfo(repo, sha));
  const reportWarning = dependencies.warn ?? warn;
  const source = { branch, prs: [] };

  try {
    source.buildCommit = getCommit(triggerSha);
    source.changeCommit = resolveLastChangeCommit(
      source.buildCommit.subject ?? "",
      () => {
        const parent = runGit(["rev-parse", `${triggerSha}^`]);
        return getCommit(parent);
      },
    );
  } catch (error) {
    reportWarning("could not resolve build provenance", error);
  }

  let previousTag;
  try {
    previousTag = resolvePreviousTag(
      tags(),
      tag,
      triggerSha,
      (candidate, source) => {
        try {
          runGit(["merge-base", "--is-ancestor", candidate, source]);
          return true;
        } catch {
          return false;
        }
      },
    );
    if (previousTag) {
      source.compare = {
        label: `${previousTag}...${tag}`,
        url: `https://github.com/${repo}/compare/${previousTag}...${tag}`,
      };
    }
  } catch (error) {
    reportWarning("could not resolve previous release tag", error);
  }

  let pullRequestNumbers = [];
  try {
    if (pr) {
      const pullRequest = pullRequestFromPayload(
        parseJson(runGh([`repos/${repo}/pulls/${pr}`])),
        { requireMerged: false },
      );
      if (pullRequest) source.prs.push(pullRequest);
    } else {
      if (previousTag) {
        pullRequestNumbers = extractPullRequestNumbers(
          runGit(["log", "--format=%s", `${previousTag}..${triggerSha}`]),
        );
      }
      if (!pullRequestNumbers.length) {
        const payload = parseJson(
          runGh([`repos/${repo}/commits/${triggerSha}/pulls`]),
        );
        if (Array.isArray(payload)) {
          pullRequestNumbers = payload
            .map((item) => item?.number)
            .filter((number) => Number.isSafeInteger(number) && number > 0)
            .slice(0, MAX_PULL_REQUESTS);
        }
      }
    }
  } catch (error) {
    reportWarning("could not discover pull requests", error);
  }

  for (const number of pullRequestNumbers) {
    try {
      const pullRequest = pullRequestFromPayload(
        parseJson(runGh([`repos/${repo}/pulls/${number}`])),
      );
      if (pullRequest) source.prs.push(pullRequest);
    } catch (error) {
      reportWarning(`could not load pull request #${number}`, error);
    }
  }

  const noteArgs = [
    "-X",
    "POST",
    `repos/${repo}/releases/generate-notes`,
    "-f",
    `tag_name=${tag}`,
    "-f",
    `target_commitish=${triggerSha}`,
  ];
  if (previousTag) noteArgs.push("-f", `previous_tag_name=${previousTag}`);
  noteArgs.push("--jq", ".body");
  const generatedNotes = runGh(noteArgs);
  const section = formatReleaseSourceSection(source);
  return `${generatedNotes.trimEnd()}${section ? `\n\n${section}` : ""}`.trim();
}

function main() {
  try {
    const output = composeReleaseNotes({
      repo: process.env.REPO,
      tag: process.env.TAG,
      branch: process.env.BRANCH,
      triggerSha: process.env.TRIGGER_SHA,
      prNumber: process.env.PR_NUMBER,
    });
    process.stdout.write(output);
  } catch (error) {
    warn("could not compose release notes", error);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
