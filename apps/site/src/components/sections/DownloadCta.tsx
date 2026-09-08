import { useEffect, useState } from "react";
import { ArrowRight, Download } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Reveal } from "@/components/motion/Reveal";
import {
  detectUserPlatform,
  findLatestForPlatform,
  formatSize,
  PLATFORMS,
  type DetectedPlatform,
} from "@/components/pages/download/shared";
import { ALL_FEATURES } from "@/data/features";
import { withBase } from "@/lib/href";
import { trackDownload, trackEvent } from "@/lib/matomo";
import { formatRelativeDate, useStableReleases } from "@/lib/useGithubReleases";

export function DownloadCta() {
  const { t } = useLingui();
  const { releases } = useStableReleases();
  const [platform, setPlatform] = useState<DetectedPlatform | null>(null);

  useEffect(() => {
    setPlatform(detectUserPlatform());
  }, []);

  const detected = PLATFORMS.find((item) => item.key === platform) ?? null;
  const resolved = detected ? findLatestForPlatform(releases, detected.key) : null;
  const others = PLATFORMS.filter((item) => item.key !== detected?.key);
  const Icon = detected?.icon ?? Download;
  const href = resolved?.asset.browser_download_url ?? withBase("/download");

  return (
    <section id="download" className="snap-start scroll-mt-[72px] md:scroll-mt-0 bg-white py-20 sm:py-24">
      <div className="mx-auto w-full max-w-[1320px] px-5 sm:px-8">
        <Reveal className="noise relative overflow-hidden rounded-[40px] bg-brand px-6 py-16 text-white sm:px-12 sm:py-20 lg:px-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 [background:radial-gradient(60%_70%_at_85%_10%,oklch(0.72_0.17_255/0.9),transparent_65%),radial-gradient(50%_60%_at_5%_100%,oklch(0.45_0.22_268/0.9),transparent_65%)]"
          />
          <ul aria-hidden className="pointer-events-none absolute right-16 top-1/2 hidden -translate-y-1/2 grid-cols-3 gap-4 lg:grid">
            {ALL_FEATURES.map((feature, index) => {
              const FeatureIcon = feature.icon;
              return (
                <li
                  key={feature.key}
                  className="grid size-16 place-items-center rounded-2xl text-white shadow-[0_16px_36px_-14px_rgb(0_0_0/0.5)]"
                  style={{
                    backgroundColor: feature.hex,
                    transform: `translateY(${(index % 3) * 10 - 10}px) rotate(${(index % 2 ? 1 : -1) * 4}deg)`,
                    opacity: 0.95,
                  }}
                >
                  <FeatureIcon className="size-7" strokeWidth={2} />
                </li>
              );
            })}
          </ul>

          <div className="relative flex max-w-[640px] flex-col items-start gap-6">
            <span className="inline-flex h-7 items-center rounded-full bg-white/15 px-3 text-xs font-bold uppercase tracking-[0.12em] text-white">
              <Trans>Download</Trans>
            </span>
            <h2 className="text-balance font-display text-[38px] font-extrabold leading-[1.02] tracking-[-0.025em] sm:text-[48px] lg:text-[58px]">
              <Trans>Start with the book on your desk.</Trans>
            </h2>
            <p className="max-w-[520px] text-pretty text-[17px] leading-relaxed text-white/80 sm:text-lg">
              <Trans>
                Install in a minute, connect the AI provider you already pay
                for, and convert your first PDF today. Free and open source.
              </Trans>
            </p>

            <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
              <a
                href={href}
                onClick={() => {
                  if (resolved && detected) trackDownload(detected.key, resolved.asset.name);
                  else trackEvent("cta", "download_click", "section");
                }}
                className="group inline-flex h-14 items-center gap-2.5 rounded-full bg-white px-7 text-base font-bold text-brand-deep shadow-[0_16px_40px_-16px_rgb(0_0_0/0.5)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_20px_44px_-16px_rgb(0_0_0/0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand"
              >
                <Icon className="size-5" strokeWidth={2} />
                {detected ? t`Download for ${detected.label}` : t`Download for free`}
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>
              {resolved ? (
                <span className="font-mono text-[13px] text-white/75">
                  {resolved.release.tag_name} · {formatSize(resolved.asset.size)} ·{" "}
                  {formatRelativeDate(resolved.release.published_at)}
                </span>
              ) : detected ? (
                <span className="text-[13px] text-white/75">{detected.subtitle}</span>
              ) : null}
            </div>

            <p className="text-sm text-white/70">
              {detected ? <Trans>Also available for</Trans> : <Trans>Available for</Trans>}{" "}
              {(detected ? others : PLATFORMS).map((item, index) => (
                <span key={item.key}>
                  {index > 0 ? " · " : ""}
                  <a
                    href={withBase("/download")}
                    className="font-bold text-white underline-offset-4 hover:underline"
                  >
                    {item.label}
                  </a>
                </span>
              ))}
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
