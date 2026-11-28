import { useRef, useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trans, useLingui } from "@lingui/react/macro"
import { api, ApiError } from "@/api/client"
import type { BookSummary } from "@adt/types"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog"

export function RecoverBookCopyButton({ label, reason, onOpen }: { label: string; reason: BookSummary["readUnavailableReason"]; onOpen: (label: string) => void }) {
  const { t } = useLingui()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()
  const recovery = useMutation({
    mutationFn: () => {
      const slug = `${label.slice(0, 180)}-recovered-${crypto.randomUUID().slice(0, 8)}`
      return api.recoverBookCopy(label, slug)
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["books"] }); setOpen(false) },
  })
  if (reason !== "book-busy") return null
  return <>
    <Button ref={trigger} variant="outline" onClick={() => { if (recovery.data) onOpen(recovery.data.label); else { recovery.reset(); setOpen(true) } }}>{recovery.data ? t`Open recovered copy` : t`Recover a copy`}</Button>
    <AlertDialog open={open} onOpenChange={value => { if (!recovery.isPending) setOpen(value) }}>
      <AlertDialogContent onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus() }}>
        <AlertDialogHeader>
          <AlertDialogTitle><Trans>Recover a separate copy?</Trans></AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>Close this book in other apps first. Recovery creates and checks a separate copy, keeping the original book and its lock evidence unchanged. It refuses a known active owner or a source that changes during copying. It does not repair damaged history or regenerate content.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {recovery.error && <p role="alert" className="text-sm text-destructive">{recovery.error instanceof ApiError && recovery.error.code === "BOOK_BUSY"
          ? t`Recovery cannot safely proceed because an active owner cannot be ruled out. Close other book apps and retry. If the refusal persists, restart your computer and try again.`
          : recovery.error instanceof ApiError && recovery.error.code === "BOOK_RECOVERY_COPY_DESTINATION_EXISTS"
            ? t`That recovery copy name is already in use. Retry to use a new name. The original book is unchanged.`
          : recovery.error instanceof ApiError && recovery.error.code === "BOOK_RECOVERY_COPY_NO_SPACE"
            ? t`There is not enough disk space for the copy. Free space and retry. The original book is unchanged.`
          : recovery.error instanceof ApiError && recovery.error.code === "BOOK_RECOVERY_COPY_ACCESS_DENIED"
            ? t`Recovery could not read or write its files. Check folder permissions and retry. The original book is unchanged.`
          : t`The copy could not be validated. The original book is unchanged. Check that other apps have closed it and that there is enough disk space, then retry.`}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={recovery.isPending}><Trans>Cancel</Trans></AlertDialogCancel>
          <Button disabled={recovery.isPending} onClick={() => recovery.mutate()}>{recovery.isPending ? t`Recovering copy…` : t`Recover a copy`}</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>
}
