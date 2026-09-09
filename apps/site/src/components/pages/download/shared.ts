import { Apple, Laptop, MonitorPlay, type LucideIcon } from "lucide-react";
import type { GithubAsset, GithubRelease } from "@/lib/useGithubReleases";

export type PlatformKey = "windows" | "macos" | "linux";

export type DetectedPlatform = PlatformKey | "mobile";

export type PlatformMeta = {
  key: PlatformKey;
  label: string;
  subtitle: string;
  icon: LucideIcon;
  fallbackHint: string;
  installNote: string;
};

export const PLATFORMS: PlatformMeta[] = [
  {
    key: "macos",
    label: "macOS",
    subtitle: "12 Monterey or newer",
    icon: Apple,
    fallbackHint: ".dmg · Universal",
    installNote: "Open the .dmg and drag ADT Studio to Applications.",
  },
  {
    key: "windows",
    label: "Windows",
    subtitle: "10 or newer",
    icon: MonitorPlay,
    fallbackHint: ".exe · .msi",
    installNote: "Run the installer; Windows may prompt for SmartScreen.",
  },
  {
    key: "linux",
    label: "Linux",
    subtitle: "x86_64 · AppImage / .deb",
    icon: Laptop,
    fallbackHint: ".AppImage · .deb",
    installNote: "Make the AppImage executable, then launch it.",
  },
];

export function matchPlatform(name: string): PlatformKey | null {
  const n = name.toLowerCase();
  if (/\.(exe|msi)$/.test(n)) return "windows";
  if (/\.(dmg|pkg)$/.test(n)) return "macos";
  if (/\.(appimage|deb|rpm|snap)$/.test(n)) return "linux";
  if (/linux/.test(n) && /\.tar\.gz$/.test(n)) return "linux";
  return null;
}

export function detectUserPlatform(): DetectedPlatform | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent.toLowerCase();
  const platform = (navigator.platform || "").toLowerCase();
  const maxTouch =
    typeof navigator.maxTouchPoints === "number" ? navigator.maxTouchPoints : 0;

  if (/iphone|ipod|android|mobile/.test(ua)) return "mobile";
  if (/ipad/.test(ua)) return "mobile";
  if (platform === "iphone" || platform === "ipad" || platform === "ipod") {
    return "mobile";
  }
  if (/macintosh/.test(ua) && maxTouch > 1) return "mobile";

  if (ua.includes("mac") || platform.includes("mac")) return "macos";
  if (ua.includes("win") || platform.includes("win")) return "windows";
  if (ua.includes("linux") || platform.includes("linux")) return "linux";
  return null;
}

export function formatSize(bytes: number): string {
  if (!bytes) return "";
  const mb = bytes / (1024 * 1024);
  if (mb >= 100) return `${Math.round(mb)} MB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  const kb = bytes / 1024;
  return `${Math.round(kb)} KB`;
}

export function groupAssets(
  assets: GithubAsset[],
): Record<PlatformKey, GithubAsset[]> {
  const out: Record<PlatformKey, GithubAsset[]> = {
    windows: [],
    macos: [],
    linux: [],
  };
  for (const a of assets ?? []) {
    const key = matchPlatform(a.name);
    if (key) out[key].push(a);
  }
  return out;
}

export function pickPreferred(assets: GithubAsset[]): GithubAsset | null {
  if (!assets || assets.length === 0) return null;
  const priority = [/\.exe$/i, /\.dmg$/i, /\.AppImage$/i, /\.msi$/i, /\.deb$/i];
  for (const re of priority) {
    const hit = assets.find((a) => re.test(a.name));
    if (hit) return hit;
  }
  return assets[0];
}

export type PlatformResolution = {
  /** First release (newest first) that ships an asset matching this platform. */
  release: GithubRelease;
  /** Preferred asset for the platform from that release. */
  asset: GithubAsset;
  /**
   * True when the platform's latest release isn't the same as the overall
   * newest release — i.e. the platform is shipping behind.
   */
  outdated: boolean;
};

/**
 * Walks releases newest-first and returns the first release that ships an
 * asset for `platform`. If the matching release isn't the newest release in
 * the list, `outdated` is true so the caller can surface a "behind" warning.
 *
 * Returns null if no release in the cache has a matching asset.
 */
export function findLatestForPlatform(
  releases: GithubRelease[] | null | undefined,
  platform: PlatformKey,
): PlatformResolution | null {
  if (!releases || releases.length === 0) return null;
  const newest = releases[0];
  for (const release of releases) {
    const grouped = groupAssets(release.assets);
    const asset = pickPreferred(grouped[platform]);
    if (asset) {
      return {
        release,
        asset,
        outdated: release.tag_name !== newest.tag_name,
      };
    }
  }
  return null;
}

export function detectArch(name: string): string | null {
  const n = name.toLowerCase();
  if (/(arm64|aarch64|apple[-_ ]?silicon)/.test(n)) return "arm64";
  if (/(x64|x86[_-]64|amd64|intel)/.test(n)) return "x64";
  if (/universal/.test(n)) return "Universal";
  return null;
}

export function summarizeBody(body: string | null | undefined): string[] {
  if (!body) return [];
  const cleaned = body
    .replace(/\r\n?/g, "\n")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "");
  const items: string[] = [];
  for (const raw of cleaned.split("\n")) {
    const m = /^\s*[-*]\s+(.*)$/.exec(raw);
    if (m) {
      items.push(
        m[1]
          .replace(/`([^`]+)`/g, "$1")
          .replace(/\*\*([^*]+)\*\*/g, "$1")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .trim(),
      );
    }
    if (items.length >= 3) break;
  }
  return items;
}
