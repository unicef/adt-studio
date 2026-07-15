import { Link } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import type { MessageDescriptor } from "@lingui/core";
import { Kbd, KbdGroup } from "@/components/docs/Kbd";
import { useModKey } from "@/lib/useModKey";

const POPULAR: { label: MessageDescriptor; splat: string }[] = [
  { label: msg`Installation`, splat: "get-started/install" },
  { label: msg`Convert a PDF into an ADT`, splat: "convert-pdf" },
  { label: msg`Enhance your ADT`, splat: "enhance" },
];

/** Hero for the docs Overview: eyebrow, headline, value prop, search, popular links. */
export function DocsHero() {
  const { setOpenSearch } = useSearchContext();
  const { t, i18n } = useLingui();
  const mod = useModKey();

  return (
    <div className="not-prose relative flex flex-col items-center pb-2 pt-6 text-center sm:pt-10">
      {/* Layered glows for depth */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-28 left-1/2 -z-10 h-[24rem] w-[46rem] max-w-[140%] -translate-x-1/2 rounded-full bg-fd-primary/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-64 w-72 -translate-x-1/2 rounded-full bg-[oklch(0.7_0.16_220)]/20 blur-3xl"
      />

      <h1 className="max-w-2xl text-pretty text-4xl font-bold tracking-tight text-fd-foreground sm:text-5xl lg:text-6xl">
        <Trans>
          Turn any PDF into an{" "}
          <span className="bg-gradient-to-r from-[oklch(0.58_0.2_262)] to-[oklch(0.7_0.16_222)] bg-clip-text text-transparent">
            accessible book
          </span>
        </Trans>
      </h1>

      <p className="mt-5 max-w-xl text-pretty text-lg leading-relaxed text-fd-muted-foreground">
        <Trans>
          Extract, structure, translate, narrate, and package — all on your
          machine and fully inspectable. Go from install to your first finished
          book.
        </Trans>
      </p>

      <button
        type="button"
        onClick={() => setOpenSearch(true)}
        className="group mt-8 flex w-full max-w-md items-center gap-3 rounded-xl border border-fd-border bg-[var(--fd-content-surface)] px-4 py-3 text-left text-sm text-fd-muted-foreground shadow-sm transition-all hover:border-fd-primary/50 hover:text-fd-foreground hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fd-primary/50"
      >
        <Search className="size-4 transition-colors group-hover:text-fd-primary" />
        <span className="flex-1">{t`Search the documentation…`}</span>
        <KbdGroup className="hidden sm:inline-flex">
          <Kbd>{mod}</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </button>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 text-sm text-fd-muted-foreground">
        <span>
          <Trans>Popular:</Trans>
        </span>
        {POPULAR.map(({ label, splat }) => (
          <Link
            key={splat}
            to="/docs/$"
            params={{ _splat: splat }}
            className="rounded-md px-1.5 py-0.5 font-medium text-fd-foreground/80 underline-offset-4 transition-colors hover:text-fd-primary hover:underline"
          >
            {i18n._(label)}
          </Link>
        ))}
      </div>
    </div>
  );
}
