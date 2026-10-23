import { Trans, useLingui } from "@lingui/react/macro"
import { AlertTriangle, Check, Loader2, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useStoryboardTools } from "./StoryboardToolsContext"

const card =
  "pointer-events-auto flex items-center gap-2.5 rounded-full border py-1 pl-3 pr-1 text-[12px] shadow-[0_14px_36px_-16px_rgba(0,0,0,0.45)] backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200 motion-reduce:animate-none"

export function GenerateActivityStatus() {
  const { t } = useLingui()
  const tools = useStoryboardTools()
  if (!tools) return null
  const { generating, banner, error, dismissBanner, dismissError, view } = tools
  const target = banner?.targetSectionIndex

  return (
    <>
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 z-[8] bg-background/50 backdrop-blur-[1px] transition-opacity duration-300 motion-reduce:transition-none",
          generating ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-16 z-20 flex flex-col items-center gap-2 px-4">
        {generating && (
          <div className={cn(card, "bg-card/95 pr-3.5")}>
            <Loader2 className="size-3.5 animate-spin text-violet-600 motion-reduce:animate-none dark:text-violet-400" />
            <span className="font-medium">
              <Trans>Generating activity…</Trans>
            </span>
            <span className="text-muted-foreground">
              <Trans>An agent is adding it to this page</Trans>
            </span>
          </div>
        )}
        {error && (
          <div role="alert" className={cn(card, "border-destructive/30 bg-card/95")}>
            <AlertTriangle className="size-3.5 shrink-0 text-destructive" />
            <span className="max-w-[46ch] truncate font-medium text-destructive" title={error}>
              {error}
            </span>
            <button
              type="button"
              onClick={dismissError}
              aria-label={t`Dismiss`}
              className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {banner && (
          <div className={cn(card, "border-emerald-200 bg-emerald-50/95 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/80 dark:text-emerald-100")}>
            <span className="grid size-5 place-items-center rounded-full bg-emerald-600 text-white">
              <Check className="size-3" />
            </span>
            <span className="font-medium">
              <Trans>Activity created on this page</Trans>
            </span>
            {target !== undefined && (
              <button
                type="button"
                onClick={() => {
                  view(target)
                  dismissBanner()
                }}
                className="rounded-full bg-emerald-600 px-3 py-1.5 font-semibold text-white transition-transform duration-150 hover:scale-[1.02] active:scale-95 motion-reduce:transition-none"
              >
                <Trans>View</Trans>
              </button>
            )}
            <button
              type="button"
              onClick={dismissBanner}
              aria-label={t`Dismiss`}
              className="grid size-7 place-items-center rounded-full text-emerald-700 transition-colors hover:bg-emerald-600/10 dark:text-emerald-300"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </>
  )
}
