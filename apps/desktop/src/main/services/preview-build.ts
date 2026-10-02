import { MAX_PULL_REQUESTS } from "@root/scripts/release-source-notes.mjs";
import { parseReleaseTag } from "@root/scripts/release-version.mjs";
import {
  compareReleaseVersions,
  fetchBetaReleaseCatalog,
  GITHUB_HEADERS,
  isNumberedBeta,
  type BetaRelease,
} from "./release-catalog";

const PULLS_URL = "https://api.github.com/repos/unicef/adt-studio/pulls";
const PR_LINK_URL = "https://github.com/unicef/adt-studio/pull";
const BETA_BRANCH = "develop";

export interface PullRequest {
  state: "open" | "merged" | "closed";
  mergedAt?: string;
  title?: string;
  author?: string;
}

export interface PreviewBuildStatus {
  version: string;
  pullRequest: { number: number; url: string; title?: string; author?: string };
  state: PullRequest["state"];
  shippedIn?: string;
  latestBeta?: string;
}

export function previewPullRequestNumber(version: string): number | undefined {
  const tag = parseReleaseTag(version)?.prerelease?.[0];
  const match = typeof tag === "string" ? /^beta-pr-(\d+)$/.exec(tag) : null;
  return match ? Number(match[1]) : undefined;
}

export function parsePullRequest(value: unknown): PullRequest {
  const pr = (typeof value === "object" && value ? value : {}) as Record<
    string,
    unknown
  >;
  const user = pr.user as { login?: unknown } | undefined;
  const base = pr.base as { ref?: unknown } | undefined;
  const mergedAt = typeof pr.merged_at === "string" ? pr.merged_at : undefined;
  const reachedBeta = mergedAt != null && base?.ref === BETA_BRANCH;
  return {
    state: reachedBeta
      ? "merged"
      : !mergedAt && pr.state === "closed"
        ? "closed"
        : "open",
    mergedAt: reachedBeta ? mergedAt : undefined,
    title: typeof pr.title === "string" ? pr.title : undefined,
    author: typeof user?.login === "string" ? user.login : undefined,
  };
}

function shipsPullRequest(
  release: BetaRelease,
  number: number,
  mergedAt: number,
): boolean {
  const prs = release.source?.prs ?? [];
  if (prs.some((pr) => pr.number === number)) return true;
  const listMayBeIncomplete =
    prs.length === 0 || prs.length >= MAX_PULL_REQUESTS;
  return (
    listMayBeIncomplete &&
    release.releaseDate != null &&
    Date.parse(release.releaseDate) > mergedAt
  );
}

export function resolvePreviewBuildStatus(
  version: string,
  pullRequest: PullRequest,
  catalog: readonly BetaRelease[],
): PreviewBuildStatus | null {
  const number = previewPullRequestNumber(version);
  if (number == null) return null;

  const numbered = catalog
    .filter((release) => isNumberedBeta(release.version))
    .sort((left, right) => compareReleaseVersions(left.version, right.version));
  const mergedAt = Date.parse(pullRequest.mergedAt ?? "");

  return {
    version,
    pullRequest: {
      number,
      url: `${PR_LINK_URL}/${number}`,
      title: pullRequest.title,
      author: pullRequest.author,
    },
    state: pullRequest.state,
    shippedIn:
      pullRequest.state === "merged"
        ? numbered.find((release) => shipsPullRequest(release, number, mergedAt))
            ?.version
        : undefined,
    latestBeta: numbered.at(-1)?.version,
  };
}

async function fetchPullRequest(number: number): Promise<PullRequest> {
  const response = await fetch(`${PULLS_URL}/${number}`, {
    headers: GITHUB_HEADERS,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(`GitHub pull request request failed (${response.status})`);
  }
  return parsePullRequest(await response.json());
}

export async function getPreviewBuildStatus(
  version: string,
): Promise<PreviewBuildStatus | null> {
  const number = previewPullRequestNumber(version);
  if (number == null) return null;
  const [catalog, pullRequest] = await Promise.all([
    fetchBetaReleaseCatalog(version),
    fetchPullRequest(number),
  ]);
  return resolvePreviewBuildStatus(version, pullRequest, catalog);
}
