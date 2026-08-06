import { useEffect, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, X } from "lucide-react"
import { useLingui } from "@lingui/react/macro"
import { api } from "@/api/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookRun } from "@/hooks/use-book-run"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import { useRegisterDirtyTabs } from "@/hooks/use-settings-dirty-tabs"
import { useSettingsRemount } from "@/hooks/use-settings-remount"

export function CoreTtsProfilesEditor({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const remount = useSettingsRemount()
  const { queueRun } = useBookRun()
  const { apiKey, hasApiKey } = useApiKey()
  const { data, isLoading } = useQuery({
    queryKey: ["core-tts-profiles"],
    queryFn: () => api.getCoreTtsProfiles(),
  })
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newLocale, setNewLocale] = useState("")
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (data) setEntries(data)
  }, [data])

  const save = async () => {
    setSaving(true)
    try {
      await api.updateCoreTtsProfiles(entries)
      await queryClient.invalidateQueries({ queryKey: ["core-tts-profiles"] })
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const saveAndRerun = async () => {
    await save()
    queueRun({ fromStage: "translate", toStage: "translate", apiKey })
  }

  useRegisterDirtyTabs(
    "settings:core-tts-profiles",
    "translate",
    dirty ? ["core-tts-profiles"] : [],
    true,
  )
  useFloatingSave({
    id: "settings:core-tts-profiles",
    dirty,
    saving,
    onSave: save,
    onSaveAndRerun: async () => {
      await saveAndRerun()
      navigate({
        to: "/books/$label/$step",
        params: { label: bookLabel, step: "translate" },
        ignoreBlocker: true,
      })
    },
    onSaveStay: saveAndRerun,
    onDiscard: remount,
    rerunDisabledReason: hasApiKey ? undefined : t`Add an API key to re-run`,
  })

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">{t`Loading TTS normalization...`}</div>
  }

  const update = (key: string, value: string) => {
    setEntries((current) => ({ ...current, [key]: value }))
    setDirty(true)
  }
  const remove = (key: string) => {
    setEntries((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    setDirty(true)
  }
  const add = () => {
    const key = newLocale.trim().toLowerCase().replaceAll("_", "-")
    if (!key || key in entries) return
    setEntries((current) => ({ ...current, [key]: "" }))
    setNewLocale("")
    setAdding(false)
    setDirty(true)
  }
  const keys = Object.keys(entries).filter((key) => key !== "default").sort()

  return (
    <div className="max-w-2xl space-y-6 p-4">
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t`Default guidance`}</Label>
        <p className="text-xs text-muted-foreground">
          {t`Preparation resolves an exact locale first, then its base language, then this default. Guidance is included in the cached, inspectable LLM call.`}
        </p>
        <textarea
          value={entries.default ?? ""}
          onChange={(event) => update("default", event.target.value)}
          rows={5}
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t`Language profiles`}</Label>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAdding(true)}>
            <Plus className="mr-1 h-3 w-3" />
            {t`Add Language`}
          </Button>
        </div>
        {adding ? (
          <div className="flex items-center gap-2">
            <Input
              value={newLocale}
              onChange={(event) => setNewLocale(event.target.value)}
              placeholder={t`e.g. sw, pt-br`}
              className="h-7 w-40 text-xs"
              onKeyDown={(event) => event.key === "Enter" && add()}
              autoFocus
            />
            <Button size="sm" className="h-7 text-xs" onClick={add}>{t`Add`}</Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAdding(false)}>{t`Cancel`}</Button>
          </div>
        ) : null}
        {keys.map((key) => (
          <div key={key} className="space-y-1 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{key}</Label>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => remove(key)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <textarea
              value={entries[key] ?? ""}
              onChange={(event) => update(key, event.target.value)}
              rows={4}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
