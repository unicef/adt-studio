import { useMemo, useState } from "react"
import type { MessageDescriptor } from "@lingui/core"
import { useLingui } from "@lingui/react/macro"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/sonner"
import { cn } from "@/lib/utils"
import type { ProviderCard } from "./providers"

export interface ProviderDraft {
  draftOf: (id: string) => string
  setField: (id: string, value: string) => void
  errors: (MessageDescriptor | null)[]
  revealed: boolean
  toggleReveal: () => void
  canSave: boolean
  hasStoredValue: boolean
  save: () => void
  remove: () => void
}

export function useProviderDraft(card: ProviderCard, onDone: () => void): ProviderDraft {
  const { t } = useLingui()
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(card.fields.map((field) => [field.id, field.value])),
  )
  const [revealed, setRevealed] = useState(false)

  const draftOf = (id: string) => drafts[id] ?? ""
  const errors = card.fields.map((field) => field.validate?.(draftOf(field.id)) ?? null)
  const hasChanges = card.fields.some((field) => draftOf(field.id).trim() !== field.value.trim())
  const canSave = hasChanges && errors.every((error) => error === null)
  const hasStoredValue = card.fields.some((field) => field.value.length > 0)

  return {
    draftOf,
    setField: (id, value) => setDrafts((prev) => ({ ...prev, [id]: value })),
    errors,
    revealed,
    toggleReveal: () => setRevealed((prev) => !prev),
    canSave,
    hasStoredValue,
    save: () => {
      for (const field of card.fields) field.save(draftOf(field.id).trim())
      toast.success(t`API keys saved.`)
      onDone()
    },
    remove: () => {
      for (const field of card.fields) field.save("")
      onDone()
    },
  }
}

export function ProviderFieldInputs({
  card,
  draft,
  onSubmit,
  className,
}: {
  card: ProviderCard
  draft: ProviderDraft
  onSubmit?: () => void
  className?: string
}) {
  const { i18n, t } = useLingui()
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {card.fields.map((field, index) => {
        const error = draft.errors[index]
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>{i18n._(field.label)}</Label>
            <div className="relative">
              <Input
                id={field.id}
                type={field.secret && !draft.revealed ? "password" : "text"}
                placeholder={i18n._(field.placeholder)}
                value={draft.draftOf(field.id)}
                onChange={(event) => draft.setField(field.id, event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && onSubmit && draft.canSave) {
                    event.preventDefault()
                    onSubmit()
                  }
                }}
                aria-invalid={error !== null}
                className={cn("font-mono text-[13px]", field.secret && "pr-10")}
              />
              {field.secret && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 size-9"
                  onClick={draft.toggleReveal}
                  aria-label={draft.revealed ? t`Hide API key` : t`Show API key`}
                  title={draft.revealed ? t`Hide API key` : t`Show API key`}
                >
                  {draft.revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              )}
            </div>
            {error && <p className="text-sm text-destructive">{i18n._(error)}</p>}
          </div>
        )
      })}
    </div>
  )
}

const ACCENT_DOT: Record<string, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  slate: "bg-slate-400",
}

export function useAccentDot(accent: string): string {
  return useMemo(() => ACCENT_DOT[accent] ?? "bg-brand-500", [accent])
}
