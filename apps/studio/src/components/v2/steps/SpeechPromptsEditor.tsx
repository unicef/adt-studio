import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Save, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/api/client"

interface SpeechPromptsEditorProps {
  bookLabel: string
  headerTarget?: HTMLDivElement | null
}

export function SpeechPromptsEditor({ bookLabel, headerTarget }: SpeechPromptsEditorProps) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["speech-instructions"],
    queryFn: () => api.getSpeechInstructions(),
  })

  const [entries, setEntries] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newLangKey, setNewLangKey] = useState("")
  const [showAddLang, setShowAddLang] = useState(false)

  useEffect(() => {
    if (data) setEntries(data)
  }, [data])

  const updateEntry = (key: string, value: string) => {
    setEntries((prev) => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  const removeEntry = (key: string) => {
    setEntries((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    setDirty(true)
  }

  const addLanguage = () => {
    const key = newLangKey.trim().toLowerCase()
    if (!key || key in entries) return
    setEntries((prev) => ({ ...prev, [key]: "" }))
    setNewLangKey("")
    setShowAddLang(false)
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.updateSpeechInstructions(entries)
      queryClient.invalidateQueries({ queryKey: ["speech-instructions"] })
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading speech instructions...</div>
  }

  const defaultEntry = entries["default"] ?? ""
  const languageKeys = Object.keys(entries).filter((k) => k !== "default").sort()

  return (
    <div className="p-4 max-w-2xl space-y-6">
      {headerTarget && createPortal(
        <Button
          size="sm"
          className="h-7 px-2.5 text-xs bg-black/15 text-white hover:bg-black/25"
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? "Saving..." : "Save"}
        </Button>,
        headerTarget
      )}

      {/* Default prompt */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Default Prompt
        </Label>
        <p className="text-xs text-muted-foreground">
          The default TTS instruction sent to OpenAI for all languages unless overridden below.
        </p>
        <textarea
          value={defaultEntry}
          onChange={(e) => updateEntry("default", e.target.value)}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
        />
      </div>

      {/* Per-language prompts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Language-Specific Prompts
          </Label>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowAddLang(true)}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add Language
          </Button>
        </div>

        {showAddLang && (
          <div className="flex items-center gap-2">
            <Input
              value={newLangKey}
              onChange={(e) => setNewLangKey(e.target.value)}
              placeholder="e.g. fr, es-mx"
              className="w-40 h-7 text-xs"
              onKeyDown={(e) => e.key === "Enter" && addLanguage()}
              autoFocus
            />
            <Button size="sm" className="h-7 text-xs" onClick={addLanguage}>
              Add
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => { setShowAddLang(false); setNewLangKey("") }}
            >
              Cancel
            </Button>
          </div>
        )}

        {languageKeys.length === 0 && !showAddLang && (
          <p className="text-xs text-muted-foreground italic">
            No language-specific prompts configured.
          </p>
        )}

        {languageKeys.map((key) => (
          <div key={key} className="space-y-1 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-medium">{key.toUpperCase()}</Label>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => removeEntry(key)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <textarea
              value={entries[key] ?? ""}
              onChange={(e) => updateEntry(key, e.target.value)}
              rows={4}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
