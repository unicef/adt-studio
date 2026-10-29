import { useState } from "react"
import { useLingui } from "@lingui/react/macro"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"

export function ActivityActions({ disabled, canRecreate, onDelete, onRecreate }: {
  disabled: boolean
  canRecreate: boolean
  onDelete: () => Promise<unknown>
  onRecreate: (feedback: string) => Promise<unknown>
}) {
  const { t } = useLingui()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState<string | null>(null)

  return (
    <>
      <Dialog open={feedbackOpen} onOpenChange={(open) => { if (!disabled) { setFeedbackOpen(open); setError(null) } }}>
        <DialogTrigger asChild>
          <Button variant="outline" className="min-h-11" disabled={disabled || !canRecreate}>{t`Recreate with feedback`}</Button>
        </DialogTrigger>
        <DialogContent>
          <form className="space-y-4" onSubmit={async (event) => {
            event.preventDefault()
            if (disabled || !canRecreate || !feedback.trim()) return
            setError(null)
            try {
              await onRecreate(feedback.trim())
              setFeedbackOpen(false)
            } catch (err) {
              setError(err instanceof Error ? err.message : t`Activity recreation failed`)
            }
          }}>
            <DialogHeader>
              <DialogTitle>{t`Recreate with feedback`}</DialogTitle>
              <DialogDescription>{t`Describe what should change in this activity. AI will update it in place, and previous versions remain available in the page editor.`}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <label htmlFor="activity-feedback" className="text-sm font-medium">{t`Comment feedback`}</label>
              <Textarea id="activity-feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} disabled={disabled} rows={5} required />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" disabled={disabled} onClick={() => setFeedbackOpen(false)}>{t`Cancel`}</Button>
              <Button type="submit" disabled={disabled || !canRecreate || !feedback.trim()}>{t`Recreate activity`}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={confirmDelete} onOpenChange={(open) => { if (!disabled) { setConfirmDelete(open); setError(null) } }}>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="min-h-11 text-destructive" disabled={disabled}>{t`Delete activity`}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Delete this activity?`}</AlertDialogTitle>
            <AlertDialogDescription>{t`This removes the selected activity from the book. Previous versions remain available in the page editor.`}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disabled}>{t`Cancel`}</AlertDialogCancel>
            <Button variant="destructive" disabled={disabled} onClick={async () => {
              if (disabled) return
              setError(null)
              try {
                await onDelete()
                setConfirmDelete(false)
              } catch (err) {
                setError(err instanceof Error ? err.message : t`Delete failed`)
              }
            }}>{t`Delete`}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
