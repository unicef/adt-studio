import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Eye, EyeOff, Trash2 } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import type { ProviderCard } from "./providers"

function ProviderKeyForm({ card, onDone }: { card: ProviderCard; onDone: () => void }) {
  const { i18n, t } = useLingui()
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(card.fields.map((field) => [field.id, field.value])),
  )
  const [revealed, setRevealed] = useState(false)

  const draftOf = (id: string) => drafts[id] ?? ""
  const errors = card.fields.map((field) => field.validate?.(draftOf(field.id)) ?? null)
  const hasChanges = card.fields.some((field) => draftOf(field.id).trim() !== field.value.trim())
  const canSave = hasChanges && errors.every((error) => error === null)
  const hasStoredValue = card.fields.some((field) => field.value.length > 0)

  const save = () => {
    for (const field of card.fields) field.save(draftOf(field.id).trim())
    toast.success(t`API keys saved.`)
    onDone()
  }

  const remove = () => {
    for (const field of card.fields) field.save("")
    onDone()
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) save()
      }}
    >
      <DialogHeader>
        <DialogTitle>{card.name}</DialogTitle>
        <DialogDescription>{i18n._(card.desc)}</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4 py-5">
        {card.fields.map((field, index) => {
          const error = errors[index]
          return (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.id}>{i18n._(field.label)}</Label>
              <div className="relative">
                <Input
                  id={field.id}
                  type={field.secret && !revealed ? "password" : "text"}
                  placeholder={i18n._(field.placeholder)}
                  value={draftOf(field.id)}
                  onChange={(event) => setDrafts((prev) => ({ ...prev, [field.id]: event.target.value }))}
                  aria-invalid={error !== null}
                  className={field.secret ? "pr-10" : undefined}
                />
                {field.secret && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 size-9"
                    onClick={() => setRevealed((prev) => !prev)}
                    aria-label={revealed ? t`Hide API key` : t`Show API key`}
                    title={revealed ? t`Hide API key` : t`Show API key`}
                  >
                    {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                )}
              </div>
              {error && <p className="text-sm text-destructive">{i18n._(error)}</p>}
            </div>
          )
        })}
        {card.hint && <p className="text-xs leading-normal text-muted-foreground">{i18n._(card.hint)}</p>}
      </div>

      <DialogFooter>
        {hasStoredValue && (
          <Button
            type="button"
            variant="outline"
            onClick={remove}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive sm:mr-auto"
          >
            <Trash2 className="size-4" />
            <Trans>Remove</Trans>
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          <Trans>Cancel</Trans>
        </Button>
        <Button type="submit" disabled={!canSave}>
          <Trans>Save</Trans>
        </Button>
      </DialogFooter>
    </form>
  )
}

export function ProviderKeyDialog({ card, onClose }: { card: ProviderCard | null; onClose: () => void }) {
  return (
    <Dialog
      open={card !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {card && <ProviderKeyForm key={card.id} card={card} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
