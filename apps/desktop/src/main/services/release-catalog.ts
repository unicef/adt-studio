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
  author?: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  coverDarkUrl?: string;
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
  rawReleaseNotes?: string;
}

export interface GitHubReleaseAsset {
  name: string;
  size?: number;
}

export interface GitHubRelease {
  tagName: string;
  draft: boolean;
  author?: string;
  releaseDate?: string;
  releaseNotes?: string;
  rawReleaseNotes?: string;
  title?: string;
  description?: string;
  coverUrl?: string;
  coverDarkUrl?: string;
  coverAlt?: string;
  source?: ReleaseSource;
  assets: GitHubReleaseAsset[];
}

const RELEASES_URL =
  "https://api.github.com/repos/unicef/adt-studio/releases?per_page=100";
const RELEASE_BY_TAG_URL =
  "https://api.github.com/repos/unicef/adt-studio/releases/tags";
const RELEASE_DOWNLOAD_URL =
  "https://github.com/unicef/adt-studio/releases/download";
const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "ADT-Studio-Updater",
  "X-GitHub-Api-Version": "2022-11-28",
};
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
          author: release.author,
          title: release.title,
          description: release.description,
          coverUrl: release.coverUrl,
          coverDarkUrl: release.coverDarkUrl,
          coverAlt: release.coverAlt,
          releaseDate: release.releaseDate,
          releaseNotes: release.releaseNotes,
          rawReleaseNotes: release.rawReleaseNotes,
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

export async function fetchGitHubReleaseByVersion(
  version: string,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<GitHubRelease | undefined> {
  const value = version.trim();
  if (!value) return undefined;
  const candidates = value.startsWith("v") ? [value] : [`v${value}`, value];

  for (const tag of candidates) {
    const response = await fetchImpl(
      `${RELEASE_BY_TAG_URL}/${encodeURIComponent(tag)}`,
      { headers: GITHUB_HEADERS, signal },
    );
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new Error(`GitHub release request failed (${response.status})`);
    }

    const release = parseGitHubRelease(await response.json())[0];
    if (!release) throw new Error("GitHub release response was invalid");
    return release;
  }

  return undefined;
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
    headers: GITHUB_HEADERS,
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

  const body = typeof value.body === "string" ? value.body : "";
  const extractedSource = extractReleaseSourceBlock(body);
  const parsedSource = parseReleaseSourceSection(extractedSource.source);
  const generatedCover = extractGeneratedReleaseCover(extractedSource.notes);
  const presentation = parseReleasePresentation(generatedCover.notes);

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
      author:
        isRecord(value.author) && typeof value.author.login === "string"
          ? value.author.login
          : undefined,
      releaseDate:
        typeof value.published_at === "string" ? value.published_at : undefined,
      releaseNotes: presentation?.notes,
      rawReleaseNotes: extractedSource.notes || undefined,
      title: parsedSource?.source?.title ?? presentation?.title,
      description: parsedSource?.source?.description,
      coverUrl:
        generatedCover.coverUrl ??
        parsedSource?.source?.coverUrl ??
        presentation?.coverUrl,
      coverDarkUrl: generatedCover.coverDarkUrl,
      coverAlt: generatedCover.coverAlt ?? presentation?.coverAlt,
      source: parsedSource?.source,
      assets,
    },
  ];
}

const GENERATED_COVER_PATTERN =
  /<!--\s*adt-ai-cover:start\s*-->[\s\S]*?<!--\s*adt-ai-cover:end\s*-->/i;
const PICTURE_PATTERN = /<picture\b[\s\S]*?<\/picture>/i;
const RELEASE_COVER_URL_PREFIX = `${RELEASE_DOWNLOAD_URL}/`;

function extractReleaseSourceBlock(body: string): {
  notes: string;
  source: string;
} {
  const pattern =
    /^### Release source[ \t]*\r?\n(?:[ \t]*\r?\n)*(?:- [^\r\n]*(?:\r?\n|$))+(?:[ \t]*\r?\n)*/m;
  const match = body.match(pattern);
  if (!match || match.index == null) return { notes: body, source: "" };
  return {
    notes:
      `${body.slice(0, match.index)}${body.slice(match.index + match[0].length)}`.trim(),
    source: match[0].trim(),
  };
}

function extractGeneratedReleaseCover(body: string): {
  notes: string;
  coverUrl?: string;
  coverDarkUrl?: string;
  coverAlt?: string;
} {
  const picture = body.match(PICTURE_PATTERN)?.[0];
  if (!picture) return { notes: body };

  const image = picture.match(/<img\b[^>]*>/i)?.[0];
  const sources = picture.match(/<source\b[^>]*>/gi) ?? [];
  const lightSource = sources.find((source) =>
    attribute(source, "media")?.includes("prefers-color-scheme: light"),
  );
  const darkSource = sources.find((source) =>
    attribute(source, "media")?.includes("prefers-color-scheme: dark"),
  );
  const coverUrl = trustedReleaseCoverUrl(
    attribute(lightSource ?? "", "srcset") ?? attribute(image ?? "", "src"),
  );
  const coverDarkUrl = trustedReleaseCoverUrl(
    attribute(darkSource ?? "", "srcset"),
  );
  if (!coverUrl) return { notes: body };

  const markedCover = body.match(GENERATED_COVER_PATTERN)?.[0];
  const notes = body
    .replace(markedCover ?? picture, "")
    .replace(/^\s+/, "")
    .trimEnd();
  return {
    notes,
    coverUrl,
    coverDarkUrl,
    coverAlt: decodeHtmlAttribute(attribute(image ?? "", "alt")),
  };
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\s${name}=(['"])(.*?)\\1`, "i"));
  return match?.[2]?.trim() || undefined;
}

function trustedReleaseCoverUrl(value?: string): string | undefined {
  return value?.startsWith(RELEASE_COVER_URL_PREFIX) ? value : undefined;
}

function decodeHtmlAttribute(value?: string): string | undefined {
  return value
    ?.replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
