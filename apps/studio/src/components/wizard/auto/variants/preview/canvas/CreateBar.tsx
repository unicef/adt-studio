import { Plural, Trans } from "@lingui/react/macro"
import { SlidersHorizontal, Wand2 } from "lucide-react"
import { usePageThumb } from "@/components/wizard/core/pdf/usePageThumb"
import { NameField } from "../../../review/parts"
import { PrimaryButton } from "../../../../core/ui"

function Cover({ file }: { file: File | null }) {
  const src = usePageThumb(file, 1, 64)
  return (
    <span aria-hidden className="hidden h-[60px] w-[44px] shrink-0 place-items-center overflow-hidden rounded-[4px_8px_8px_4px] bg-muted shadow-[0_6px_16px_-8px_rgba(15,23,42,0.5)] ring-1 ring-border sm:grid">
      {src && <img src={src} alt="" className="size-full object-cover" />}
    </span>
  )
}

/**
 * The sticky bar under the canvas: the book's name (the wizard's Project Name field), the way out
 * to the step-by-step setup, and Create. On a phone it also opens the settings sheet.
 */
export function CreateBar({ file, ready, pending, onCreate, onManual, onSettings }: { file: File | null; ready: boolean; pending: number; onCreate: () => void; onManual: () => void; onSettings: () => void }) {
  return (
    <div className="relative z-10 shrink-0 border-t bg-background/85 px-4 pb-3 pt-3 backdrop-blur-md sm:px-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-start gap-3 lg:w-[420px]">
          <Cover file={file} />
          <div className="min-w-0 flex-1 [&_p]:text-[11.5px] max-sm:[&_p:not([role=alert])]:hidden">
            <NameField />
          </div>
        </div>
        <div className="flex items-center gap-2 lg:ml-auto">
          <button type="button" onClick={onSettings} className="inline-flex h-11 items-center gap-1.5 rounded-full bg-muted px-4 text-[14px] font-medium transition-[background-color,transform] duration-150 hover:bg-muted/70 active:scale-[0.97] lg:hidden">
            <SlidersHorizontal className="size-4" />
            <Trans>Settings</Trans>
          </button>
          <button type="button" onClick={onManual} className="hidden h-11 items-center gap-1.5 rounded-full px-4 text-[14px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:inline-flex">
            <Trans>Set it up myself</Trans>
          </button>
          {ready && pending > 0 && (
            <p className="hidden max-w-[220px] text-right text-[12px] leading-snug text-muted-foreground xl:block">
              <Plural value={pending} one="One question is still open; we'll use our guess." other="# questions are still open; we'll use our guesses." />
            </p>
          )}
          <PrimaryButton onClick={onCreate} disabled={!ready} pulse={ready} icon={<Wand2 className="size-4" />} className="ml-auto px-5 sm:px-6 lg:ml-0">
            <Trans>Create book</Trans>
          </PrimaryButton>
        </div>
      </div>
    </div>
  )
}
