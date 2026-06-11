import { AlertTriangle, ArrowUpRight, Construction, Monitor } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/Button";
import { cn } from "@/lib/cn";
import { trackDownload } from "@/lib/matomo";
import {
  formatDownloads,
  formatRelativeDate,
  sumAllDownloads,
  useStableReleases,
  type GithubRelease,
} from "@/lib/useGithubReleases";
import {
  detectUserPlatform,
  findLatestForPlatform,
  formatSize,
  PLATFORMS,
  type DetectedPlatform,
  type PlatformKey,
  type PlatformMeta,
  type PlatformResolution,
} from "./download/shared";

export function DownloadPage() {
  const { t } = useLingui();
  const { releases, loading, error } = useStableReleases();
  const latest: GithubRelease | undefined = releases?.[0];
  const [userPlatform, setUserPlatform] = useState<DetectedPlatform | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUserPlatform(detectUserPlatform());
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const totalDownloads = useMemo(
    () => sumAllDownloads(releases),
    [releases],
  );

  /** Per-platform "latest release that actually ships this OS". */
  const platformResolutions = useMemo(() => {
    const out: Partial<Record<PlatformKey, PlatformResolution>> = {};
    for (const p of PLATFORMS) {
      const r = findLatestForPlatform(releases, p.key);
      if (r) out[p.key] = r;
    }
    return out;
  }, [releases]);

  const isMobile = userPlatform === "mobile";
  const detected: PlatformMeta = isMobile
    ? PLATFORMS[0]
    : PLATFORMS.find((p) => p.key === userPlatform) ?? PLATFORMS[0];
  const chipPlatforms = isMobile
    ? PLATFORMS
    : PLATFORMS.filter((p) => p.key !== detected.key);

  const detectedResolution = !isMobile
    ? platformResolutions[detected.key] ?? null
    : null;
  const detectedAsset = detectedResolution?.asset ?? null;
  const detectedReleaseForCta = detectedResolution?.release ?? latest;
  const fallbackHref =
    detectedReleaseForCta?.html_url ??
    latest?.html_url ??
    "https://github.com/unicef/adt-studio/releases/latest";
  const PrimaryIcon = detected.icon;
  const hasDetectedBuild = !isMobile && !!detectedAsset;

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[color:var(--color-background)] pt-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 text-[color:var(--color-foreground)] opacity-[0.08] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:22px_22px] [mask-image:radial-gradient(ellipse_50%_55%_at_50%_45%,black_10%,transparent_75%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-1/3 h-[420px] -translate-y-1/2 [background:radial-gradient(ellipse_45%_55%_at_50%_50%,color-mix(in_oklch,var(--color-primary)_10%,transparent),transparent_70%)]"
      />

      <div className="relative mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <a
          href="#top"
          aria-label={t`ADT Studio home`}
          className={cn(
            "group relative inline-flex transition-all duration-700",
            mounted ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
          )}
        >
          <span
            aria-hidden
            className="absolute inset-0 -z-0 rounded-3xl bg-[color:var(--color-primary)]/25 opacity-70 blur-xl transition-opacity duration-500 group-hover:opacity-100"
          />
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt=""
            width={88}
            height={88}
            className="relative h-[72px] w-[72px] rounded-3xl shadow-[0_24px_48px_-24px_rgba(0,0,0,0.18)] transition-transform duration-500 group-hover:-rotate-3 md:h-20 md:w-20"
          />
        </a>

        <h1
          className={cn(
            "mt-10 max-w-xl text-balance text-4xl font-bold leading-[1.05] tracking-tight transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)] md:text-5xl lg:text-[56px]",
            mounted ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
          )}
          style={{ transitionDelay: "120ms" }}
        >
          <Trans>Start building accessible books.</Trans>
        </h1>

        <p
          className={cn(
            "mt-5 max-w-md text-base leading-relaxed text-[color:var(--color-muted-foreground)] transition-opacity duration-[600ms] md:text-[17px]",
            mounted ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: "240ms" }}
        >
          <Trans>
            Free, open-source, and runs on your machine. Available for macOS,
            Windows, and Linux.
          </Trans>
        </p>

        <div
          className={cn(
            "mt-10 w-full transition-all duration-[700ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            mounted ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
          style={{ transitionDelay: "360ms" }}
        >
          {isMobile ? (
            <MobileNotice fallbackHref={fallbackHref} />
          ) : hasDetectedBuild && detectedAsset ? (
            <Button
              href={detectedAsset.browser_download_url}
              variant="primary"
              size="lg"
              className="min-w-[260px] justify-center px-8 text-[15px]"
              onClick={() => trackDownload(detected.key, detectedAsset.name)}
            >
              <PrimaryIcon className="h-4 w-4" strokeWidth={1.8} />
              <Trans>Download for {detected.label}</Trans>
            </Button>
          ) : (
            <EmptyPlatformState
              meta={detected}
              fallbackHref={fallbackHref}
              loading={loading && !latest}
              failed={error && !latest}
            />
          )}
        </div>

        {hasDetectedBuild && detectedAsset && detectedResolution && (
          <div
            className={cn(
              "mt-4 font-mono text-[11px] text-[color:var(--color-muted-foreground)] transition-opacity duration-500",
              mounted ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: "440ms" }}
          >
            {loading
              ? t`Resolving latest release…`
              : `${detectedAsset.name} · ${formatSize(detectedAsset.size)} · ${detectedResolution.release.tag_name}`}
          </div>
        )}

        {detectedResolution?.outdated && latest && (
          <OutdatedNotice
            platform={detected}
            platformResolution={detectedResolution}
            overallLatest={latest}
            mounted={mounted}
          />
        )}

        <div
          className={cn(
            "mt-10 flex flex-col items-center gap-3 transition-opacity duration-500",
            mounted ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: "540ms" }}
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--color-muted-foreground)]">
            {hasDetectedBuild ? t`Also available on` : t`Available for`}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {chipPlatforms.map((p) => (
              <PlatformChip
                key={p.key}
                meta={p}
                resolution={platformResolutions[p.key] ?? null}
                fallbackRelease={latest}
              />
            ))}
          </div>
        </div>

        {totalDownloads > 0 && (
          <div
            className={cn(
              "mt-8 inline-flex items-center gap-1.5 font-mono text-[11px] text-[color:var(--color-muted-foreground)] transition-opacity duration-500",
              mounted ? "opacity-100" : "opacity-0",
            )}
            style={{ transitionDelay: "600ms" }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--color-primary)]" />
            <span className="font-semibold text-[color:var(--color-foreground)]">
              {formatDownloads(totalDownloads)}
            </span>
            <span>
              <Trans>downloads to date</Trans>
            </span>
          </div>
        )}

        <div
          className={cn(
            "mt-12 flex flex-col items-center gap-3 text-[12px] text-[color:var(--color-muted-foreground)] transition-opacity duration-500",
            mounted ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDelay: "640ms" }}
        >
          {latest?.prerelease && (
            <div className="inline-flex items-center gap-2">
              <span>
                <Trans>ADT Studio is currently in</Trans>
              </span>
              <span className="rounded-md border border-[color:var(--color-border)] px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-[color:var(--color-foreground)]">
                <Trans>Beta</Trans>
              </span>
            </div>
          )}
          <div className="max-w-md text-balance">
            <Trans>
              If your device has been wrongly detected,{" "}
              <a
                href="https://github.com/unicef/adt-studio/releases/latest"
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-[color:var(--color-primary)] underline-offset-2 hover:underline"
              >
                see all downloads
              </a>
              . Please report any issues you encounter on{" "}
              <a
                href="https://github.com/unicef/adt-studio/issues"
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-[color:var(--color-primary)] underline-offset-2 hover:underline"
              >
                GitHub
              </a>
              .
            </Trans>
          </div>
          {latest && (
            <div className="font-mono text-[10px] text-[color:var(--color-muted-foreground)]/70">
              <Trans>Released {formatRelativeDate(latest.published_at)}</Trans>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MobileNotice({ fallbackHref }: { fallbackHref: string }) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-card)]/60 p-6 text-left shadow-sm">
      <div className="flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
          <Monitor className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--color-muted-foreground)]">
            <Trans>Desktop only</Trans>
          </div>
          <div className="mt-0.5 text-base font-semibold tracking-tight text-[color:var(--color-foreground)]">
            <Trans>ADT Studio is a desktop app</Trans>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
            <Trans>
              We don&rsquo;t ship a mobile version. To install ADT Studio, open
              this page on macOS, Windows, or Linux — or send the link to your
              computer.
            </Trans>
          </p>
        </div>
      </div>

      <Button
        href={fallbackHref}
        target="_blank"
        rel="noreferrer noopener"
        variant="secondary"
        size="md"
        className="mt-4 w-full justify-center"
      >
        <Trans>View release on GitHub</Trans>
        <ArrowUpRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EmptyPlatformState({
  meta,
  fallbackHref,
  loading,
  failed,
}: {
  meta: PlatformMeta;
  fallbackHref: string;
  loading: boolean;
  failed: boolean;
}) {
  const { t } = useLingui();
  if (loading) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-card)]/40 p-6 text-center">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--color-muted-foreground)]">
          <Trans>Resolving latest release…</Trans>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-card)]/60 p-6 text-left shadow-sm">
      <div className="flex items-start gap-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--color-primary)]/10 text-[color:var(--color-primary)]">
          <Construction className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <div className="flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--color-muted-foreground)]">
            {failed ? t`Couldn't reach GitHub` : t`Coming soon`}
          </div>
          <div className="mt-0.5 text-base font-semibold tracking-tight text-[color:var(--color-foreground)]">
            <Trans>No {meta.label} build yet</Trans>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-muted-foreground)]">
            {failed
              ? t`We couldn't fetch the latest release. Try the release page directly, or pick another platform below.`
              : t`We don't ship a prebuilt installer for ${meta.label} in this release. Pick another platform below or follow progress on GitHub.`}
          </p>
        </div>
      </div>

      <Button
        href={fallbackHref}
        target="_blank"
        rel="noreferrer noopener"
        variant="secondary"
        size="md"
        className="mt-4 w-full justify-center"
      >
        <Trans>View release on GitHub</Trans>
        <ArrowUpRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function PlatformChip({
  meta,
  resolution,
  fallbackRelease,
}: {
  meta: PlatformMeta;
  resolution: PlatformResolution | null;
  fallbackRelease: GithubRelease | undefined;
}) {
  const { t } = useLingui();
  const Icon = meta.icon;
  const fallbackHref =
    fallbackRelease?.html_url ??
    "https://github.com/unicef/adt-studio/releases/latest";
  const hasBuild = !!resolution;
  const href = hasBuild ? resolution.asset.browser_download_url : fallbackHref;
  const isOutdated = hasBuild && resolution.outdated;

  const title = hasBuild
    ? isOutdated
      ? t`Download for ${meta.label} — ${resolution.release.tag_name} (a newer release exists for other platforms)`
      : t`Download for ${meta.label} ${resolution.release.tag_name}`
    : t`${meta.label} build is coming — track on GitHub`;

  return (
    <a
      href={href}
      target={hasBuild ? undefined : "_blank"}
      rel={hasBuild ? undefined : "noreferrer noopener"}
      title={title}
      onClick={hasBuild && resolution ? () => trackDownload(meta.key, resolution.asset.name) : undefined}
      className={cn(
        "group inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all hover:-translate-y-0.5",
        hasBuild
          ? "border-[color:var(--color-border)] bg-[color:var(--color-card)] text-[color:var(--color-foreground)] shadow-sm hover:border-[color:var(--color-primary)]/30 hover:shadow-md"
          : "border-dashed border-[color:var(--color-border)] bg-transparent text-[color:var(--color-muted-foreground)] hover:border-[color:var(--color-primary)]/30 hover:text-[color:var(--color-foreground)]",
      )}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
      {meta.label}
      {hasBuild && (
        <span
          className={cn(
            "ml-0.5 rounded-full px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider",
            isOutdated
              ? "bg-amber-50 text-amber-700"
              : "bg-[color:var(--color-muted)] text-[color:var(--color-muted-foreground)]",
          )}
        >
          {resolution.release.tag_name}
        </span>
      )}
      {!hasBuild && (
        <span className="ml-0.5 rounded-full bg-[color:var(--color-muted)] px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
          <Trans>Soon</Trans>
        </span>
      )}
    </a>
  );
}

function OutdatedNotice({
  platform,
  platformResolution,
  overallLatest,
  mounted,
}: {
  platform: PlatformMeta;
  platformResolution: PlatformResolution;
  overallLatest: GithubRelease;
  mounted: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto mt-4 inline-flex max-w-md items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-left text-[12px] text-amber-900 shadow-sm transition-all duration-500",
        mounted ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
      )}
      style={{ transitionDelay: "500ms" }}
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      <span>
        <Trans>
          {platform.label} latest is{" "}
          <span className="font-mono font-semibold">
            {platformResolution.release.tag_name}
          </span>{" "}
          — the project is on{" "}
          <a
            href={overallLatest.html_url}
            target="_blank"
            rel="noreferrer noopener"
            className="font-mono font-semibold underline-offset-2 hover:underline"
          >
            {overallLatest.tag_name}
          </a>
          . A {platform.label} build for the newer tag isn&rsquo;t available
          yet.
        </Trans>
      </span>
    </div>
  );
}
