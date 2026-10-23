import { useState } from "react"
import { ImagePlus } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { BASE_URL } from "@/api/client"
import { GlossaryImagePickerDialog } from "@/components/pipeline/stages/glossary/components/GlossaryImagePickerDialog"
import { cn } from "@/lib/utils"
import { MUTED_MEDIA } from "../shared/ui"

export function GlossaryItemPicture({
  label,
  imageId,
  word,
  muted = false,
  disabled = false,
  onChange,
}: {
  label: string
  imageId: string | undefined
  word: string
  muted?: boolean
  disabled?: boolean
  onChange: (imageId: string | undefined) => void
}) {
  const { t } = useLingui()
  const [pickerOpen, setPickerOpen] = useState(false)
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Trans>Picture</Trans>
      </span>
      {imageId ? (
        <>
          <div className="overflow-hidden rounded-md border bg-muted/30" style={{ aspectRatio: 4 / 3 }}>
            <img
              src={`${BASE_URL}/books/${label}/images/${imageId}`}
              alt={t`Picture for ${word}`}
              loading="lazy"
              className={cn("h-full w-full object-cover", muted && MUTED_MEDIA)}
            />
          </div>
          <div className="flex items-center gap-3 text-[12px] font-medium">
            <button type="button" disabled={disabled} onClick={() => setPickerOpen(true)} className="text-foreground underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline">
              <Trans>Change</Trans>
            </button>
            <button type="button" disabled={disabled} onClick={() => onChange(undefined)} className="text-destructive underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline">
              <Trans>Remove</Trans>
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setPickerOpen(true)}
          className="flex items-center justify-center gap-1.5 rounded-md border border-dashed py-4 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground disabled:pointer-events-none"
          style={{ aspectRatio: 4 / 3 }}
        >
          <ImagePlus className="size-3.5" />
          <Trans>Add picture</Trans>
        </button>
      )}
      {pickerOpen && (
        <GlossaryImagePickerDialog
          bookLabel={label}
          initialSelected={imageId}
          onConfirm={(next) => {
            onChange(next)
            setPickerOpen(false)
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
