import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { STAGES } from "@/data/stages";

/**
 * Featured "Get Started" cover card for the docs Overview — a gradient panel
 * with a subtle glow, the app icon centered above the pipeline stages (each in
 * its own brand color), and the heading/description bottom-left on a shadow
 * scrim. Links to the Quick Start.
 */
export function GetStartedBanner() {
  const { i18n } = useLingui();

  return (
    <Link
      to="/docs/$"
      params={{ _splat: "get-started" }}
      className="not-prose group relative mt-8 flex w-full flex-col overflow-hidden rounded-2xl border border-fd-border shadow-sm transition-shadow hover:shadow-lg sm:aspect-[3/2] sm:items-center sm:justify-center"
    >
      {/* Gradient base */}
      <div className="absolute inset-0 bg-gradient-to-br from-[oklch(0.63_0.19_260)] via-[oklch(0.5_0.18_262)] to-[oklch(0.37_0.15_266)]" />
      {/* Grid pattern */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.13] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:34px_34px]"
      />
      {/* Glow */}
      <div
        aria-hidden
        className="absolute -top-20 left-1/3 size-80 -translate-x-1/2 rounded-full bg-white/25 blur-3xl"
      />

      {/* Centered icon + pipeline stages (each in its own color). On mobile the
          card has no fixed aspect ratio, so this and the heading below flow
          normally (no overlap); on sm+ this block is vertically centered and
          the heading is pinned to the bottom. */}
      <div className="relative z-10 flex flex-col items-center gap-5 px-6 pb-4 pt-9 sm:px-0 sm:pb-0 sm:pt-0 sm:-translate-y-6">
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt=""
          width={84}
          height={84}
          className="size-16 rounded-2xl shadow-xl sm:size-[84px]"
        />
        <div className="flex max-w-xl flex-wrap justify-center gap-2">
          {STAGES.map(({ slug, label, icon: Icon, hex }) => (
            <span
              key={slug}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 py-1 pl-1 pr-2.5 text-xs font-medium text-white backdrop-blur-sm"
            >
              <span
                className="grid size-5 shrink-0 place-items-center rounded-full text-white"
                style={{ backgroundColor: hex }}
              >
                <Icon className="size-3" />
              </span>
              {i18n._(label)}
            </span>
          ))}
        </div>
      </div>

      {/* Heading + description on a shadow scrim — flows below the stages on
          mobile, pinned to the bottom-left on sm+. */}
      <div className="relative z-10 w-full bg-gradient-to-t from-black/65 via-black/30 to-transparent p-6 pt-10 text-left sm:absolute sm:inset-x-0 sm:bottom-0 sm:pt-20">
        <span className="flex items-center gap-1.5 text-xl font-semibold text-white">
          <Trans>Get started with ADT Studio</Trans>
          <ArrowRight className="size-5 transition-transform group-hover:translate-x-0.5" />
        </span>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-white/85">
          <Trans>
            Install the app, create a project, and produce your first accessible
            book — start to finish, in a few guided steps.
          </Trans>
        </p>
      </div>
    </Link>
  );
}
