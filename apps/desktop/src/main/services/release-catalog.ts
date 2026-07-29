import {
  compareReleaseVersions as compareParsedReleaseVersions,
  isBetaVersion,
  parseReleaseTag,
} from "@root/scripts/release-version.mjs";
import {
  parseReleasePresentation,
  parseReleaseSourceSection,
  type ReleaseSource,
} from "@root/scripts/release-source-notes.mjs";

export type ReleaseDirection = "upgrade" | "current" | "downgrade";

export interface AvailableRelease {
  version: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  coverAlt?: string;
  releaseDate?: string;
  releaseNotes?: string;
  totalBytes?: number;
  source?: ReleaseSource;
  direction: ReleaseDirection;
}

export interface BetaRelease extends AvailableRelease {
  tagName: string;
  updaterChannel: "beta" | "latest";
}

export interface GitHubReleaseAsset {
  name: string;
  size?: number;
}

export interface GitHubRelease {
  tagName: string;
  draft: boolean;
  releaseDate?: string;
  releaseNotes?: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  coverAlt?: string;
  source?: ReleaseSource;
  assets: GitHubReleaseAsset[];
}

const RELEASES_URL =
  "https://api.github.com/repos/unicef/adt-studio/releases?per_page=100";
const RELEASE_DOWNLOAD_URL =
  "https://github.com/unicef/adt-studio/releases/download";
const CACHE_TTL_MS = 5 * 60 * 1000;

let releaseCache: { releases: GitHubRelease[]; expiresAt: number } | undefined;
let releaseRequest: Promise<GitHubRelease[]> | undefined;

export function isBetaReleaseVersion(value: string): boolean {
  const parsed = parseReleaseTag(value);
  return parsed !== null && isBetaVersion(parsed);
}

export function compareReleaseVersions(left: string, right: string): number {
  const a = parseReleaseTag(left);
  const b = parseReleaseTag(right);
  if (!a || !b) {
    throw new Error(
      `Cannot compare invalid release versions: ${left}, ${right}`,
    );
  }
  return compareParsedReleaseVersions(a, b);
}

export function createBetaReleaseCatalog(
  releases: readonly GitHubRelease[],
  currentVersion: string,
  platform: NodeJS.Platform,
): BetaRelease[] {
  if (!parseReleaseTag(currentVersion)) return [];

  return releases
    .flatMap((release): BetaRelease[] => {
      if (release.draft || !isBetaReleaseVersion(release.tagName)) return [];
      const updaterChannel = findUpdaterChannel(release.assets, platform);
      if (!updaterChannel) return [];
      const version = release.tagName.replace(/^v/, "");
      const comparison = compareReleaseVersions(version, currentVersion);
      return [
        {
          tagName: release.tagName,
          updaterChannel,
          version,
          title: release.title,
          description: release.description,
          coverUrl: release.coverUrl,
          coverAlt: release.coverAlt,
          releaseDate: release.releaseDate,
          releaseNotes: release.releaseNotes,
          source: release.source,
          totalBytes: installerSize(release.assets, platform),
          direction:
            comparison > 0
              ? ("upgrade" as const)
              : comparison < 0
                ? ("downgrade" as const)
                : ("current" as const),
        },
      ];
    })
    .sort((left, right) => compareReleaseVersions(right.version, left.version));
}

export async function fetchBetaReleaseCatalog(
  currentVersion: string,
  options: { force?: boolean; platform?: NodeJS.Platform } = {},
): Promise<BetaRelease[]> {
  const releases = await fetchGitHubReleases(options.force ?? false);
  return createBetaReleaseCatalog(
    releases,
    currentVersion,
    options.platform ?? process.platform,
  );
}

export function betaReleaseDownloadUrl(release: BetaRelease): string {
  return `${RELEASE_DOWNLOAD_URL}/${encodeURIComponent(release.tagName)}/`;
}

function findUpdaterChannel(
  assets: readonly GitHubReleaseAsset[],
  platform: NodeJS.Platform,
): "beta" | "latest" | undefined {
  for (const channel of ["beta", "latest"] as const) {
    const suffix =
      platform === "darwin"
        ? "-mac.yml"
        : platform === "linux"
          ? "-linux.yml"
          : ".yml";
    const metadataName = `${channel}${suffix}`;
    if (assets.some((asset) => asset.name.toLowerCase() === metadataName)) {
      return channel;
    }
  }
  return undefined;
}

function installerSize(
  assets: readonly GitHubReleaseAsset[],
  platform: NodeJS.Platform,
): number | undefined {
  const extension =
    platform === "darwin"
      ? ".zip"
      : platform === "linux"
        ? ".appimage"
        : ".exe";
  return assets.find((asset) => asset.name.toLowerCase().endsWith(extension))
    ?.size;
}

async function fetchGitHubReleases(force: boolean): Promise<GitHubRelease[]> {
  const now = Date.now();
  if (!force && releaseCache && releaseCache.expiresAt > now) {
    return releaseCache.releases;
  }
  if (!force && releaseRequest) return releaseRequest;

  const request = requestGitHubReleases(now);
  releaseRequest = request;
  try {
    return await request;
  } finally {
    if (releaseRequest === request) releaseRequest = undefined;
  }
}

async function requestGitHubReleases(now: number): Promise<GitHubRelease[]> {
  const response = await fetch(RELEASES_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "ADT-Studio-Updater",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub releases request failed (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("GitHub releases response was invalid");
  }

  const releases = payload.flatMap(parseGitHubRelease);
  releaseCache = { releases, expiresAt: now + CACHE_TTL_MS };
  return releases;
}

export function parseGitHubRelease(value: unknown): GitHubRelease[] {
  if (!isRecord(value) || typeof value.tag_name !== "string") return [];

  const parsedSource =
    typeof value.body === "string"
      ? parseReleaseSourceSection(value.body)
      : undefined;
  const presentation = parsedSource
    ? parseReleasePresentation(parsedSource.notes)
    : undefined;

  const assets = Array.isArray(value.assets)
    ? value.assets.flatMap((asset): GitHubReleaseAsset[] => {
        if (!isRecord(asset) || typeof asset.name !== "string") return [];
        return [
          {
            name: asset.name,
            size: typeof asset.size === "number" ? asset.size : undefined,
          },
        ];
      })
    : [];

  return [
    {
      tagName: value.tag_name,
      draft: value.draft === true,
      releaseDate:
        typeof value.published_at === "string" ? value.published_at : undefined,
      releaseNotes: presentation?.notes,
      title: parsedSource?.source?.title ?? presentation?.title,
      description: parsedSource?.source?.description,
      coverUrl: parsedSource?.source?.coverUrl ?? presentation?.coverUrl,
      coverAlt: presentation?.coverAlt,
      source: parsedSource?.source,
      assets,
    },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
