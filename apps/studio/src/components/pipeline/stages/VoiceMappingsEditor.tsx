import { useState, useEffect, useMemo } from "react"
import { createPortal } from "react-dom"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Save, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/api/client"

interface VoiceMappingsEditorProps {
  bookLabel: string
  headerTarget?: HTMLDivElement | null
}

interface VoiceRow {
  lang: string
  openai: string
  azure: string
}

export function VoiceMappingsEditor({ bookLabel, headerTarget }: VoiceMappingsEditorProps) {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["voice-mappings"],
    queryFn: () => api.getVoiceMappings(),
  })

  const [rows, setRows] = useState<VoiceRow[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newLangKey, setNewLangKey] = useState("")
  const [showAddLang, setShowAddLang] = useState(false)

  useEffect(() => {
    if (!data) return
    const openai = data.openai ?? {}
    const azure = data.azure ?? {}
    const allLangs = new Set([...Object.keys(openai), ...Object.keys(azure)])
    const built: VoiceRow[] = []
    for (const lang of allLangs) {
      built.push({ lang, openai: openai[lang] ?? "", azure: azure[lang] ?? "" })
    }
    // Sort with "default" first, then alphabetical
    built.sort((a, b) => {
      if (a.lang === "default") return -1
      if (b.lang === "default") return 1
      return a.lang.localeCompare(b.lang)
    })
    setRows(built)
  }, [data])

  const updateRow = (index: number, field: "openai" | "azure", value: string) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
    setDirty(true)
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setDirty(true)
  }

  const addLanguage = () => {
    const key = newLangKey.trim().toLowerCase()
    if (!key || rows.some((r) => r.lang === key)) return
    setRows((prev) => [...prev, { lang: key, openai: "", azure: "" }])
    setNewLangKey("")
    setShowAddLang(false)
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const openai: Record<string, string> = {}
      const azure: Record<string, string> = {}
      for (const row of rows) {
        if (row.openai.trim()) openai[row.lang] = row.openai.trim()
        if (row.azure.trim()) azure[row.lang] = row.azure.trim()
      }
      await api.updateVoiceMappings({ openai, azure })
      queryClient.invalidateQueries({ queryKey: ["voice-mappings"] })
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading voice mappings...</div>
  }

  return (
    <div className="p-4 space-y-4">
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

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Voice Mappings
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Map language codes to voice names for each TTS provider.
          </p>
        </div>
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

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left font-medium px-3 py-2 w-28">Language</th>
              <th className="text-left font-medium px-3 py-2">OpenAI Voice</th>
              <th className="text-left font-medium px-3 py-2">Azure Voice</th>
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.lang} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-3 py-1.5 font-medium text-muted-foreground">
                  {row.lang}
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    value={row.openai}
                    onChange={(e) => updateRow(i, "openai", e.target.value)}
                    className="h-7 text-xs"
                    placeholder="—"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    value={row.azure}
                    onChange={(e) => updateRow(i, "azure", e.target.value)}
                    className="h-7 text-xs"
                    placeholder="—"
                  />
                </td>
                <td className="px-2 py-1.5">
                  {row.lang !== "default" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => removeRow(i)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground italic">
                  No voice mappings configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
