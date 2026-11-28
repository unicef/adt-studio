import { useState, type ReactNode } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check, Download, Puzzle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { repairRequestPointer } from "@/components/import/ImportProject/repair-prompt"
import { saveTextFile } from "@/lib/save-text-file"
import { cn } from "@/lib/utils"
import { CopyTextButton } from "./CopyTextButton"

/**
 * The repair request as people see it before copying: a header, the text in a
 * scrolling box, and Copy as the main action. The review's repair panel and
 * the "can't be read" canvas both use it, so the same request looks the same
 * wherever it appears. With a file name it can also be saved as a file, for
 * assistants that reject a paste this long (#1246): the button's tooltip says
 * when to use it, and once saved, the line to give the assistant instead
 * stays under the buttons.
 */
export function RepairRequest({
  text,
  copyValue = text,
  fileName,
  actions,
  headerAction,
  note,
  className,
  textClassName,
  inert,
}: {
  /** What the box shows. */
  text: string
  /** What Copy puts on the clipboard, when it carries more than the box shows. */
  copyValue?: string
  /** Offers Download, saving the copy text under this name. */
  fileName?: string
  /** The view's own controls, at the end of the button row. */
  actions?: ReactNode
  /** A control beside the title, for what people consult rather than do. */
  headerAction?: ReactNode
  /** A short remark about the request, shown under the buttons. */
  note?: ReactNode
  className?: string
  textClassName?: string
  /** Set while something covers the request, so it leaves the tab order. */
  inert?: boolean
}) {
  const { t } = useLingui()
  // The file the request was last saved as; the line only makes sense after.
  const [savedAs, setSavedAs] = useState<string | null>(null)
  const download = async (name: string) => {
    if (await saveTextFile(name, copyValue)) setSavedAs(name)
  }
  const saved = fileName && savedAs === fileName ? fileName : null
  return (
    <div inert={inert} className={cn("flex min-h-0 flex-col gap-3 text-left", className)}>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-600 dark:text-brand-400">
          <Puzzle aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground"><Trans>Repair request</Trans></h3>
          <p className="text-xs text-muted-foreground">
            <Trans>Give it to your AI assistant together with the unzipped archive.</Trans>
          </p>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </div>
      {/* A focusable, scrolling box: a named region. Its text is English, for
          the assistant, whatever language Studio is in. */}
      <pre
        role="region"
        aria-label={t`Repair request`}
        lang="en"
        tabIndex={0}
        className={cn(
          "min-h-[120px] flex-1 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/50 px-3.5 py-3 font-sans text-[12.5px] leading-relaxed text-foreground",
          textClassName,
        )}
      >
        {text}
      </pre>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <CopyTextButton value={copyValue} primary>
          <Trans>Copy repair request</Trans>
        </CopyTextButton>
        {fileName ? (
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" size="sm" onClick={() => void download(fileName)} className="h-9 text-sm">
                  <Download aria-hidden="true" className="size-3.5" />
                  <Trans>Download repair request</Trans>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[300px] text-xs leading-relaxed">
                <Trans>Saves the full request as {fileName}. Use it when the request is too long to paste into your AI assistant.</Trans>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : null}
        {actions ? <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {note || fileName ? (
        <div className={cn(
          "flex shrink-0 flex-col gap-2 text-xs leading-relaxed text-muted-foreground",
          (note || saved) && "border-t border-border pt-3",
        )}>
          {note ? <p>{note}</p> : null}
          {/* Mounted empty before any download, so screen readers announce the
              row when it fills in; a region added with its text often isn't. */}
          {fileName ? (
            <div role="status" aria-label={t`Download status`}>
              {saved ? (
                <div className="flex flex-col gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2.5 text-foreground">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Check aria-hidden="true" className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    <Trans>Saved {saved}</Trans>
                  </span>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span><Trans>Now give your assistant this line instead of the whole request:</Trans></span>
                    <span className="flex items-center gap-1.5">
                      <code lang="en" className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11.5px]">{repairRequestPointer(saved)}</code>
                      <CopyTextButton value={repairRequestPointer(saved)} className="h-7 px-2 text-xs"><Trans>Copy line</Trans></CopyTextButton>
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
