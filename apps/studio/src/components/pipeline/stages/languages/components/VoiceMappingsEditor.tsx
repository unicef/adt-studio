import { useState, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/api/client"
import { useBookConfig, useUpdateBookConfig } from "@/hooks/use-book-config"
import { useActiveConfig } from "@/hooks/use-debug"
import { useFloatingSave } from "@/components/pipeline/components/floating-save"
import { useSettingsRemount } from "@/hooks/use-settings-remount"
import { useRegisterDirtyTabs } from "@/hooks/use-settings-dirty-tabs"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { useLingui } from "@lingui/react/macro"

interface VoiceMappingsEditorProps {
  bookLabel: string
  headerTarget?: HTMLDivElement | null
}

const PROVIDER_ORDER = ["openai", "azure", "gemini"] as const

type VoiceProviderKey = (typeof PROVIDER_ORDER)[number]

interface VoiceRow {
  lang: string
  openai: string
  azure: string
  gemini: string
}

export function VoiceMappingsEditor({ bookLabel }: VoiceMappingsEditorProps) {
  const { t } = useLingui()
  const queryClient = useQueryClient()
  const remount = useSettingsRemount()
  const { queueRun } = useBookRun()
  const { apiKey, hasApiKey } = useApiKey()
  const navigate = useNavigate()
  const { data: bookConfigData, isLoading: isBookConfigLoading } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const updateConfig = useUpdateBookConfig()
  const { data, isLoading } = useQuery({
    queryKey: ["voice-mappings"],
    queryFn: () => api.getVoiceMappings(),
  })

  const [rows, setRows] = useState<VoiceRow[]>([])
  const [defaultVoice, setDefaultVoice] = useState("")
  const [dirtyMappings, setDirtyMappings] = useState(false)
  const [dirtyDefaultVoice, setDirtyDefaultVoice] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newLangKey, setNewLangKey] = useState("")
  const [showAddLang, setShowAddLang] = useState(false)

  useEffect(() => {
    if (!data) return
    const openai = data.openai ?? {}
    const azure = data.azure ?? {}
    const gemini = data.gemini ?? {}
    const allLangs = new Set([
      ...Object.keys(openai),
      ...Object.keys(azure),
      ...Object.keys(gemini),
    ])
    const built: VoiceRow[] = []
    for (const lang of allLangs) {
      built.push({
        lang,
        openai: openai[lang] ?? "",
        azure: azure[lang] ?? "",
        gemini: gemini[lang] ?? "",
      })
    }
    // Sort with "default" first, then alphabetical
    built.sort((a, b) => {
      if (a.lang === "default") return -1
      if (b.lang === "default") return 1
      return a.lang.localeCompare(b.lang)
    })
    setRows(built)
  }, [data])

  useEffect(() => {
    if (dirtyDefaultVoice || !activeConfigData) return
    const merged = activeConfigData.merged as Record<string, unknown>
    const speech = merged.speech
    if (!speech || typeof speech !== "object") {
      setDefaultVoice("")
      return
    }
    const voice = (speech as Record<string, unknown>).voice
    setDefaultVoice(typeof voice === "string" ? voice : "")
  }, [activeConfigData, dirtyDefaultVoice])

  const updateRow = (index: number, field: VoiceProviderKey, value: string) => {
    setRows((prev) => prev.map((r, i) => i === index ? { ...r, [field]: value } : r))
    setDirtyMappings(true)
  }

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setDirtyMappings(true)
  }

  const addLanguage = () => {
    const key = newLangKey.trim().toLowerCase()
    if (!key || rows.some((r) => r.lang === key)) return
    setRows((prev) => [...prev, { lang: key, openai: "", azure: "", gemini: "" }])
    setNewLangKey("")
    setShowAddLang(false)
    setDirtyMappings(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const saves: Promise<unknown>[] = []

      if (dirtyMappings) {
        const nextMappings: Record<string, Record<string, string>> = {}
        for (const key of PROVIDER_ORDER) {
          const values: Record<string, string> = {}
          for (const row of rows) {
            const value = row[key].trim()
            if (value) values[row.lang] = value
          }
          if (Object.keys(values).length > 0) {
            nextMappings[key] = values
          }
        }
        saves.push(api.updateVoiceMappings(nextMappings))
      }

      if (dirtyDefaultVoice) {
        const existingConfig = (bookConfigData?.config ?? {}) as Record<string, unknown>
        const existingSpeech = existingConfig.speech
        const speechObject = (existingSpeech && typeof existingSpeech === "object")
          ? (existingSpeech as Record<string, unknown>)
          : {}
        const nextSpeech = {
          ...speechObject,
          voice: defaultVoice.trim() || undefined,
        }
        const cleanSpeech = Object.fromEntries(
          Object.entries(nextSpeech).filter(([, value]) => value !== undefined)
        )
        const nextConfig: Record<string, unknown> = { ...existingConfig }
        if (Object.keys(cleanSpeech).length > 0) nextConfig.speech = cleanSpeech
        else delete nextConfig.speech

        saves.push(updateConfig.mutateAsync({ label: bookLabel, config: nextConfig }))
      }

      if (saves.length > 0) await Promise.all(saves)
      if (dirtyMappings) {
        queryClient.invalidateQueries({ queryKey: ["voice-mappings"] })
      }
      setDirtyMappings(false)
      setDirtyDefaultVoice(false)
    } finally {
      setSaving(false)
    }
  }

  useRegisterDirtyTabs(
    "settings:voice-mappings",
    "speech",
    dirtyMappings || dirtyDefaultVoice ? ["voices"] : [],
    true,
  )
  useFloatingSave({
    id: "settings:voice-mappings",
    dirty: dirtyMappings || dirtyDefaultVoice,
    saving: saving || updateConfig.isPending,
    onSaveAndRerun: async () => {
      await handleSave()
      queueRun({ fromStage: "speech", toStage: "speech", apiKey })
      navigate({ to: "/books/$label/$step", params: { label: bookLabel, step: "speech" } })
    },
    onSaveStay: async () => {
      await handleSave()
      queueRun({ fromStage: "speech", toStage: "speech", apiKey })
    },
    onDiscard: remount,
    rerunDisabledReason: !hasApiKey
      ? t`Add an API key to re-run`
      : dirtyDefaultVoice && isBookConfigLoading
        ? t`Loading book config…`
        : undefined,
  })

  if (isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">{t`Loading voice mappings...`}</div>
  }

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t`Default Voice`}
        </Label>
        <Input
          value={defaultVoice}
          onChange={(e) => {
            setDefaultVoice(e.target.value)
            setDirtyDefaultVoice(true)
          }}
          placeholder={t`e.g. alloy`}
          className="w-72 h-8 text-xs"
        />
        <p className="text-xs text-muted-foreground">
          {t`Default voice used when not specified for a language.`}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t`Voice Mappings`}
          </Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t`Map language codes to voice names for each TTS provider.`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setShowAddLang(true)}
        >
          <Plus className="mr-1 h-3 w-3" />
          {t`Add Language`}
        </Button>
      </div>

      {showAddLang && (
        <div className="flex items-center gap-2">
          <Input
            value={newLangKey}
            onChange={(e) => setNewLangKey(e.target.value)}
            placeholder={t`e.g. fr, es-mx`}
            className="w-40 h-7 text-xs"
            onKeyDown={(e) => e.key === "Enter" && addLanguage()}
            autoFocus
          />
          <Button size="sm" className="h-7 text-xs" onClick={addLanguage}>
            {t`Add`}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => { setShowAddLang(false); setNewLangKey("") }}
          >
            {t`Cancel`}
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b">
              <th className="text-left font-medium px-3 py-2 w-28">{t`Language`}</th>
              {PROVIDER_ORDER.map((key) => (
                <th key={key} className="text-left font-medium px-3 py-2">
                  {key === "openai"
                    ? t`OpenAI Voice`
                    : key === "azure"
                      ? t`Azure Voice`
                      : t`Gemini Voice`}
                </th>
              ))}
              <th className="w-10 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.lang} className="border-b last:border-b-0 hover:bg-muted/30">
                <td className="px-3 py-1.5 font-medium text-muted-foreground">
                  {row.lang}
                </td>
                {PROVIDER_ORDER.map((key) => (
                  <td key={key} className="px-3 py-1.5">
                    <Input
                      value={row[key]}
                      onChange={(e) => updateRow(i, key, e.target.value)}
                      className="h-7 text-xs"
                      placeholder={
                        key === "openai"
                          ? t`e.g. alloy`
                          : key === "azure"
                            ? t`e.g. en-US-JennyNeural`
                            : t`e.g. Kore`
                      }
                    />
                  </td>
                ))}
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
                <td colSpan={1 + PROVIDER_ORDER.length + 1} className="px-3 py-4 text-center text-muted-foreground italic">
                  {t`No voice mappings configured.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
