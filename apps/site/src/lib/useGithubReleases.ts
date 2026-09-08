import { useEffect, useState } from "react";

export type GithubAsset = {
  name: string;
  browser_download_url: string;
  size: number;
  download_count: number;
};

export type GithubRelease = {
  tag_name: string;
  name: string | null;
  body: string | null;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: GithubAsset[];
};

const OWNER = "unicef";
const REPO = "adt-studio";
const CACHE_KEY = "adt:gh:releases:v3";
const FETCH_LIMIT = 20;
const TTL_MS = 60 * 60 * 1000;

type CachedEntry = { at: number; data: GithubRelease[] };

function readCache(): GithubRelease[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedEntry;
    if (Date.now() - parsed.at > TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(data: GithubRelease[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // storage can be disabled; safe to ignore
  }
}

export function useGithubReleases(): {
  releases: GithubRelease[] | null;
  loading: boolean;
  error: boolean;
} {
  const [releases, setReleases] = useState<GithubRelease[] | null>(() =>
    readCache(),
  );
  const [loading, setLoading] = useState<boolean>(() => readCache() === null);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    const hadCache = readCache() !== null;
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=${FETCH_LIMIT}`,
          {
            headers: { Accept: "application/vnd.github+json" },
            cache: "no-store",
            signal: ctrl.signal,
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as GithubRelease[];
        const filtered = data.filter((r) => !r.draft);
        writeCache(filtered);
        setReleases(filtered);
        setError(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (!hadCache) setError(true);
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  return { releases, loading, error };
}

export function useStableReleases(): {
  releases: GithubRelease[] | null;
  loading: boolean;
  error: boolean;
} {
  const { releases, loading, error } = useGithubReleases();
  const stable = releases ? releases.filter((r) => !r.prerelease) : null;
  return { releases: stable, loading, error };
}

export function useGithubRelease(tag: string | null): {
  release: GithubRelease | null;
  loading: boolean;
  error: boolean;
} {
  const { releases, loading: listLoading, error: listError } =
    useGithubReleases();
  const fromList = tag
    ? (releases ?? []).find((r) => r.tag_name === tag) ?? null
    : null;

  const [release, setRelease] = useState<GithubRelease | null>(fromList);
  const [loading, setLoading] = useState<boolean>(!fromList && !!tag);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    if (!tag) {
      setRelease(null);
      setLoading(false);
      return;
    }
    if (fromList) {
      setRelease(fromList);
      setLoading(false);
      setError(false);
      return;
    }
    if (listLoading) {
      setLoading(true);
      return;
    }
    if (listError) {
      setError(true);
      setLoading(false);
      return;
    }
    // Not in list — fetch directly by tag.
    const ctrl = new AbortController();
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${encodeURIComponent(tag)}`,
          {
            headers: { Accept: "application/vnd.github+json" },
            signal: ctrl.signal,
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as GithubRelease;
        setRelease(data);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError(true);
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [tag, fromList, listLoading, listError]);

  return { release, loading, error };
}

export function formatRelativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const month = Math.floor(day / 30);
  const year = Math.floor(day / 365);
  if (year >= 1) return `${year}y ago`;
  if (month >= 1) return `${month}mo ago`;
  if (day >= 1) return `${day === 1 ? "1 day" : `${day} days`} ago`;
  if (hr >= 1) return `${hr}h ago`;
  if (min >= 1) return `${min}m ago`;
  return "just now";
}

export function formatDownloads(n: number): string {
  if (n < 1000) return n.toLocaleString();
  if (n < 10000) {
    const v = (n / 1000).toFixed(1).replace(/\.0$/, "");
    return `${v}k`;
  }
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  const v = (n / 1_000_000).toFixed(1).replace(/\.0$/, "");
  return `${v}M`;
}

export function sumReleaseDownloads(release: GithubRelease): number {
  return (release.assets ?? []).reduce(
    (acc, a) => acc + (a.download_count ?? 0),
    0,
  );
}

export function sumAllDownloads(releases: GithubRelease[] | null): number {
  if (!releases) return 0;
  return releases.reduce((acc, r) => acc + sumReleaseDownloads(r), 0);
}

export function formatAbsoluteDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function stripMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  return md
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[#>*\-\d.]+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_{1,2}([^_]+)_{1,2}/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * The release's own headline: the first markdown heading in the notes body
 * (e.g. "A More Flexible Studio"), falling back to the release name.
 */
export function releaseHeadline(release: GithubRelease): string {
  const body = (release.body ?? "").replace(/<!--[\s\S]*?-->/g, "").replace(/\r\n?/g, "\n");
  const match = /^#{1,3}\s+(.+?)\s*$/m.exec(body);
  const heading = match?.[1]?.replace(/[*_`]/g, "").trim();
  return heading || release.name?.trim() || release.tag_name;
}
