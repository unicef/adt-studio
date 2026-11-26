import { useStore } from "@tanstack/react-form"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, FileText } from "lucide-react"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { cn } from "@/lib/utils"
import { useWizardForm } from "../../../core/wizardForm"
import type { ScreenId } from "./screens"
import { SCREEN_TITLE } from "./words"

/**
 * The summary layout's side panel: the book (its first page and file name) and the setup as it
 * fills in: what's settled, ticked with its value (a tap opens it again), the screen on view, and
 * what's still to come.
 */
export function BookSoFar({ screens, at, done, values, onGo }: { screens: ScreenId[]; at: ScreenId; done: ScreenId[]; values: Record<ScreenId, string>; onGo: (screen: ScreenId) => void }) {
  const { t, i18n } = useLingui()
  const form = useWizardForm()
  const file = useStore(form.store, (s) => s.values.file)
  const cover = usePageThumb(file, 1, 160)
  return (
    <aside aria-label={t`Your book`} className="hidden self-start lg:sticky lg:top-6 lg:flex lg:flex-col lg:gap-4">
      <div className="flex items-center gap-3">
        <span className="grid h-[72px] w-[54px] shrink-0 place-items-center overflow-hidden rounded-[5px] bg-white shadow-[0_6px_16px_-8px_rgba(15,23,42,0.45)] ring-1 ring-border">
          {cover ? <img src={cover} alt="" className="h-full w-full object-cover" /> : <FileText className="size-4 text-muted-foreground/60" />}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-[13px] text-muted-foreground">
            <Trans>Your book</Trans>
          </span>
          <span className="truncate text-[15px] font-semibold">{file?.name}</span>
        </span>
      </div>
      <ol className="flex flex-col border-t border-border">
        {screens
          .filter((s) => s !== "name")
          .map((s) => {
            const current = s === at
            const settled = done.includes(s) && !current
            return (
              <li key={s} className="border-b border-border/70">
                <button type="button" onClick={() => onGo(s)} disabled={!settled} aria-current={current ? "step" : undefined} className="flex w-full items-start gap-2.5 py-3 text-left disabled:cursor-default">
                  <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full", settled ? "bg-[var(--gd-step)] text-white" : current ? "ring-2 ring-[var(--gd-step)]" : "ring-1 ring-border")}>{settled && <Check className="size-2.5 stroke-[3.5]" />}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={cn("text-[13px]", current ? "font-semibold text-foreground" : "text-muted-foreground")}>{i18n._(SCREEN_TITLE[s])}</span>
                    <span className={cn("text-[14.5px]", settled ? "font-medium" : "text-muted-foreground/70")}>{settled ? values[s] : current ? <Trans>Now</Trans> : null}</span>
                  </span>
                </button>
              </li>
            )
          })}
      </ol>
    </aside>
  )
}
