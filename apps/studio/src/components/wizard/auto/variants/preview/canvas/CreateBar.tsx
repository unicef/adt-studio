import { Trans, useLingui } from "@lingui/react/macro"
import { SlidersHorizontal, Wand2 } from "lucide-react"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { cn } from "@/lib/utils"
import { NameField } from "../../../review/parts"
import { PrimaryButton } from "../../../../core/ui"
import type { SetupSettingId } from "@adt/types"
import { SETTING_IDS } from "../../../engine/answers"
import { choiceOf } from "../labels"
import type { CanvasSetup } from "../useSetup"

function Cover({ file }: { file: File | null }) {
  const src = usePageThumb(file, 1, 64)
  return (
    <span aria-hidden className="hidden h-[44px] w-[32px] shrink-0 place-items-center overflow-hidden rounded-[3px_6px_6px_3px] bg-muted shadow-[0_6px_16px_-8px_rgba(15,23,42,0.5)] ring-1 ring-border sm:grid">
      {src && <img src={src} alt="" className="size-full object-cover" />}
    </span>
  )
}

/** The settings the one-line summary names (the ones that shape the book most). */
const SUMMARY = SETTING_IDS.slice(0, 3)

/** The setup in one line, with the wizard's names: "Storybook · Fixed Layout · Spread". */
function useSummary(setup: CanvasSetup) {
  const { i18n } = useLingui()
  const name = (id: SetupSettingId) => {
    const c = choiceOf(id, setup.look[id])
    return c ? i18n._(c.title) : String(setup.look[id])
  }
  return SUMMARY.map(name).join(" · ")
}

/**
 * Under the preview once it's ready: the setup in one line (it opens Settings), the book's name
 * (the wizard's Project Name field, label kept for screen readers) and Create. Nothing else.
 */
export function CreateBar({ setup, file, settingsOpen, onCreate, onSettings }: { setup: CanvasSetup; file: File | null; settingsOpen: boolean; onCreate: () => void; onSettings: () => void }) {
  const { t } = useLingui()
  const summary = useSummary(setup)
  return (
    <div className="relative z-20 shrink-0 border-t bg-background/85 px-4 py-3 backdrop-blur-md animate-[am-fade-up_0.45s_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none sm:px-6">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:gap-4">
        <button
          type="button"
          onClick={onSettings}
          aria-expanded={settingsOpen}
          aria-label={t`Settings: ${summary}`}
          className="group inline-flex h-11 min-w-0 items-center gap-2.5 rounded-full bg-card px-4 text-left shadow-sm ring-1 ring-border transition-[box-shadow] duration-150 hover:ring-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 lg:max-w-[52%]"
        >
          <SlidersHorizontal className="size-4 shrink-0 text-brand-600" />
          <span className="truncate text-[14px] font-semibold">{summary}</span>
          <span className="ml-auto shrink-0 pl-1 text-[13px] font-semibold text-brand-700 group-hover:underline">
            <Trans>Change</Trans>
          </span>
        </button>
        <div className="flex min-w-0 items-center gap-3 lg:ml-auto">
          <Cover file={file} />
          <div className={cn("min-w-0 flex-1 lg:w-[260px] lg:flex-none", "[&_label]:sr-only [&>div]:gap-0 [&_p:not([role=alert])]:hidden [&_p]:text-[11.5px]")}>
            <NameField />
          </div>
          <PrimaryButton onClick={onCreate} pulse icon={<Wand2 className="size-4" />} className="shrink-0 px-5 sm:px-6">
            <Trans>Create book</Trans>
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
