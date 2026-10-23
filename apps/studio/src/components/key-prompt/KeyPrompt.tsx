import type { ReactNode } from "react"
import { KeyRound } from "lucide-react"
import { Trans } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"

/** Welcome screen: connecting a provider comes first, then the book. `ctas` are the add/import buttons. */
export function WelcomeKeyPrompt({ onConnect, ctas }: { onConnect: () => void; ctas: ReactNode }) {
  return (
    <>
      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted-foreground">
        <KeyRound className="size-4 text-brand-600" aria-hidden />
        <span>
          <Trans>Connect your AI provider to process books.</Trans>
        </span>
        <button
          type="button"
          onClick={onConnect}
          className="font-semibold text-brand-700 underline-offset-4 hover:underline dark:text-brand-300"
        >
          <Trans>Connect provider</Trans>
        </button>
      </p>
      <div className="flex flex-wrap gap-3">{ctas}</div>
    </>
  )
}

/** Book overview and Extract pages: why AI steps cannot run, with the fix. */
export function MissingKeyBanner({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-xl border bg-card px-4 py-3">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-300"
      >
        <KeyRound className="size-4" />
      </span>
      <div className="min-w-[14rem] flex-1">
        <div className="text-[13.5px] font-semibold">
          <Trans>One step before you can run this</Trans>
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
          <Trans>Extraction and the other AI steps run on your own AI provider.</Trans>
        </p>
      </div>
      <Button size="sm" className="ml-auto shrink-0" onClick={onConnect}>
        <Trans>Connect provider</Trans>
      </Button>
    </div>
  )
}
