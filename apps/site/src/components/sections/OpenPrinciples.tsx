import { useMemo } from "react";
import { Eye, GitBranch, HardDrive, Scale } from "lucide-react";
import { Trans } from "@lingui/react/macro";
import { GithubIcon } from "@/components/icons/GithubIcon";
import { Reveal } from "@/components/motion/Reveal";
import { GITHUB_URL } from "@/components/nav/SiteNav";
import { SectionHeading } from "@/components/SectionHeading";
import { withBase } from "@/lib/href";
import { formatDownloads, formatRelativeDate, sumAllDownloads, useStableReleases } from "@/lib/useGithubReleases";

export function OpenPrinciples() {
  const { releases } = useStableReleases();
  const downloads = useMemo(() => sumAllDownloads(releases), [releases]);

  const principles = [
    {
      icon: HardDrive,
      title: <Trans>Runs on your computer</Trans>,
      body: (
        <Trans>
          Books, prompts and API keys stay on your machine. A book is one
          folder you can zip and hand to a colleague.
        </Trans>
      ),
    },
    {
      icon: Eye,
      title: <Trans>No black boxes</Trans>,
      body: (
        <Trans>
          Every AI call is logged with its prompt, answer and cost, and you
          can open any of them from the stage that produced it.
        </Trans>
      ),
    },
    {
      icon: GitBranch,
      title: <Trans>Nothing is overwritten</Trans>,
      body: (
        <Trans>
          Each edit creates a new version. Roll back any stage, any page, any
          time, and re-run with unchanged inputs served from cache.
        </Trans>
      ),
    },
    {
      icon: Scale,
      title: <Trans>Free and open source</Trans>,
      body: (
        <Trans>
          Licensed AGPL-3.0 and developed in the open with UNICEF. Read the
          code, file an issue, ship a fix.
        </Trans>
      ),
    },
  ];

  const latest = releases?.[0];

  return (
    <section id="open" className="snap-section noise relative scroll-mt-[72px] md:scroll-mt-0 flex flex-col justify-center overflow-hidden bg-ink py-14 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(55%_45%_at_15%_0%,color-mix(in_oklch,var(--color-brand)_38%,transparent),transparent_70%),radial-gradient(45%_40%_at_90%_100%,color-mix(in_oklch,var(--color-brand)_28%,transparent),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:72px_72px] [mask-image:radial-gradient(70%_60%_at_50%_45%,black,transparent)]"
      />
      <div className="relative mx-auto w-full max-w-[1200px] px-5 sm:px-8">
        <Reveal>
          <SectionHeading
            tone="dark"
            eyebrow={<Trans>Open, local, transparent</Trans>}
            title={<Trans>Built to be trusted with children's books.</Trans>}
            body={
              <Trans>
                Accessibility work is careful work. ADT Studio is designed so
                you can always see what changed, why, and undo it.
              </Trans>
            }
          />
        </Reveal>

        <ul className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {principles.map((principle, index) => {
            const Icon = principle.icon;
            return (
              <Reveal
                as="li"
                key={index}
                delay={index * 0.06}
                className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition-colors duration-300 hover:bg-white/[0.07]"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-brand text-white">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-display text-xl font-extrabold tracking-tight">{principle.title}</h3>
                <p className="text-sm leading-relaxed text-white/70">{principle.body}</p>
              </Reveal>
            );
          })}
        </ul>

        <Reveal className="mt-8 flex flex-col gap-8 rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <dl className="grid flex-1 grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-white/60">
                <Trans>Downloads so far</Trans>
              </dt>
              <dd className="mt-1 font-display text-4xl font-extrabold tracking-tight tabular-nums">
                {downloads > 0 ? formatDownloads(downloads) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-white/60">
                <Trans>Latest release</Trans>
              </dt>
              <dd className="mt-1 flex flex-wrap items-baseline gap-x-3 font-display text-4xl font-extrabold tracking-tight">
                {latest ? (
                  <>
                    <span className="tabular-nums">{latest.tag_name}</span>
                    <span className="font-sans text-sm font-medium text-white/60">
                      {formatRelativeDate(latest.published_at)}
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-5 text-[15px] font-bold text-ink transition-colors hover:bg-brand-tint"
            >
              <GithubIcon className="size-4" />
              <Trans>View the source</Trans>
            </a>
            <a
              href={withBase("/releases")}
              className="inline-flex h-12 items-center rounded-full border border-white/20 px-5 text-[15px] font-bold text-white transition-colors hover:bg-white/10"
            >
              <Trans>Release notes</Trans>
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
