import { Trans, useLingui } from "@lingui/react/macro";
import { Search } from "lucide-react";
import { forwardRef } from "react";
import DotGrid from "@/components/aicanvas/dot-grid";
import { DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface BetaLibraryHeroProps {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}

export const BetaLibraryHero = forwardRef<
  HTMLInputElement,
  BetaLibraryHeroProps
>(function BetaLibraryHero({ value, onValueChange, className }, ref) {
  const { t } = useLingui();

  return (
    <section
      className={cn(
        "relative isolate shrink-0 overflow-hidden bg-muted/30 px-5 py-16",
        className,
      )}
    >
      <DotGrid className="-z-20" />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-background/15 via-background/35 to-background"
      />

      <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
        <DialogTitle className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          <Trans>Beta versions</Trans>
        </DialogTitle>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-6 text-muted-foreground md:text-base">
          <Trans>Choose a beta release to install.</Trans>
        </p>

        <div className="mt-6 w-full max-w-xl">
          <label htmlFor="beta-version-search" className="sr-only">
            <Trans>Search beta versions</Trans>
          </label>
          <Input
            ref={ref}
            id="beta-version-search"
            type="search"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            placeholder={t`Search by title, version, or description…`}
            autoComplete="off"
            spellCheck={false}
            prependIcon={<Search className="size-4 ml-2" aria-hidden="true" />}
            className="h-12 rounded-full border-border bg-background/95 pr-5 pl-11 shadow-none"
          />
        </div>
      </div>
    </section>
  );
});
