import { useState } from "react"
import { RotateCcw, Trash2 } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

const REVEAL = cn(
  "opacity-0 transition-[opacity,background-color,color] duration-200 motion-reduce:transition-none",
  "group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100",
)

export function RemoveQuizButton({
  disabled,
  onRemove,
  position,
  look = "reveal",
}: {
  disabled: boolean
  onRemove: () => void
  position: number
  look?: "reveal" | "labelled"
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={t`Remove question ${position}`}
          title={t`Remove question ${position}`}
          className={cn(
            "rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive data-[state=open]:bg-destructive/10 data-[state=open]:text-destructive",
            "outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 disabled:pointer-events-none disabled:opacity-40",
            look === "reveal" ? cn("grid size-7 place-items-center", REVEAL) : "flex h-8 items-center gap-1.5 border px-2.5 text-[12px] font-medium transition-colors duration-150",
          )}
        >
          <Trash2 className="size-3.5" />
          {look === "labelled" && <Trans>Remove question</Trans>}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        role="alertdialog"
        aria-label={t`Remove question ${position}?`}
        className="flex w-[300px] flex-col gap-3 rounded-xl p-3.5 shadow-lg"
      >
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-semibold text-foreground">
            <Trans>Remove question {position}?</Trans>
          </p>
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            <Trans>It leaves the book when you save. Until then you can undo it, and after saving you can bring it back from version history.</Trans>
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-8 rounded-lg border bg-card px-3 text-[12.5px] font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Trans>Keep it</Trans>
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => {
              setOpen(false)
              onRemove()
            }}
            className="h-8 rounded-lg bg-destructive px-3 text-[12.5px] font-semibold text-destructive-foreground transition-[background-color,transform] duration-150 hover:bg-destructive/90 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-destructive/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
          >
            <Trans>Remove</Trans>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function UndoRemoveButton({ disabled, onUndo, position }: { disabled: boolean; onUndo: () => void; position: number }) {
  const { t } = useLingui()
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onUndo}
      aria-label={t`Undo removing question ${position}`}
      className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-foreground transition-colors duration-150 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:text-muted-foreground animate-in fade-in duration-200 motion-reduce:animate-none"
    >
      <RotateCcw className="size-3.5" />
      <Trans>Undo</Trans>
    </button>
  )
}
