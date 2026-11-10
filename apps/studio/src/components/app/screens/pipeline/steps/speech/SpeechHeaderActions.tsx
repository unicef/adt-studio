import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Ellipsis, RotateCcw, Trash2, Type, WandSparkles } from "lucide-react"
import { ActionMenu } from "@/components/ui/action-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { HEADER_BUTTON, HEADER_BUTTON_ICON, HEADER_MENU_OPEN } from "../shared/headerButton"
import { StepActionButton } from "../shared/StepActionButton"

export interface SpeechRunAction {
  label: string
  missing: boolean
  onClick: () => void
  disabled: boolean
  reason: string | null
}

export interface SpeechBulkAction {
  onConfirm: () => void
  disabled: boolean
  reason: string | null
}

type Confirm = "transcribe" | "delete" | null

export function SpeechHeaderActions({
  search,
  run,
  transcribeAll,
  deleteAll,
  languageName,
  hex,
}: {
  search: React.ReactNode
  run: SpeechRunAction
  transcribeAll: SpeechBulkAction
  deleteAll: SpeechBulkAction
  languageName: string
  hex: string
}) {
  const { t } = useLingui()
  const [confirm, setConfirm] = useState<Confirm>(null)

  return (
    <div className="flex items-center gap-2">
      {search}
      <StepActionButton
        look="header"
        icon={run.missing ? WandSparkles : RotateCcw}
        onClick={run.onClick}
        disabled={run.disabled}
        disabledReason={run.reason}
      >
        {run.label}
      </StepActionButton>
      <ActionMenu
        trigger={<Ellipsis className="size-4" />}
        triggerAriaLabel={t`More audio actions`}
        triggerClassName={cn(HEADER_BUTTON, HEADER_BUTTON_ICON, HEADER_MENU_OPEN)}
        note={
          transcribeAll.disabled && transcribeAll.reason ? (
            <p className="max-w-[260px] px-2 py-1.5 text-[11.5px] leading-snug text-muted-foreground">{transcribeAll.reason}</p>
          ) : null
        }
        items={[
          {
            icon: Type,
            label: t`Add word timing to every clip in ${languageName}`,
            onClick: () => setConfirm("transcribe"),
            disabled: transcribeAll.disabled,
          },
          { separator: true },
          {
            icon: Trash2,
            label: t`Delete all audio`,
            onClick: () => setConfirm("delete"),
            disabled: deleteAll.disabled,
            danger: true,
          },
        ]}
      />
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete" ? <Trans>Delete all audio?</Trans> : <Trans>Add word timing to every clip?</Trans>}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete" ? (
                <Trans>This removes the audio for every language and voice in this book. You'll need to create it again before the book can be read aloud.</Trans>
              ) : (
                <Trans>Every clip in {languageName} is sent for transcription so each word can be highlighted as it's read. This can take a while.</Trans>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm === "delete") deleteAll.onConfirm()
                else transcribeAll.onConfirm()
                setConfirm(null)
              }}
              className={confirm === "delete" ? "bg-destructive text-white hover:bg-destructive/90" : "text-white hover:opacity-90"}
              style={confirm === "delete" ? undefined : { backgroundColor: hex }}
            >
              {confirm === "delete" ? <Trans>Delete all audio</Trans> : <Trans>Add word timing</Trans>}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
