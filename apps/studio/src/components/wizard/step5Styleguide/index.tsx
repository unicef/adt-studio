import { useMemo, useRef, useState } from "react"
import { useStore } from "@tanstack/react-form"
import { msg } from "@lingui/core/macro"
import { useLingui } from "@lingui/react/macro"
import { Palette, Check, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useWizardForm } from "@/components/wizard/wizardForm"
import { useStyleguides, useUploadStyleguide } from "@/hooks/use-presets"
import { getPresetAccent, type PresetAccent } from "@/components/wizard/constants"

const DESCRIPTION_PRIMARY = msg`A style guide provides consistent HTML and CSS patterns that the LLM uses when generating pages. It controls typography, colors, spacing, and component styles so every page in your book has a unified look.`
const DESCRIPTION_SECONDARY = msg`Selecting "None" lets the LLM choose its own styling for each page.`
const SEARCH_PLACEHOLDER = msg`Search style guides...`
const NONE_OPTION = msg`None`
const LOADING_STYLEGUIDES = msg`Loading style guides...`
const UPLOADING = msg`Uploading...`
const UPLOAD_STYLE_GUIDE = msg`Upload Style Guide`
const UPLOAD_FAILED = msg`Upload failed`

function StyleguideOption({
  name,
  selected,
  onSelect,
  accent,
}: {
  name: string
  selected: boolean
  onSelect: () => void
  accent: PresetAccent
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 shadow-sm text-left",
        "bg-card border-border",
        "hover:bg-muted hover:border-input",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected && "border",
      )}
      style={
        selected
          ? { borderColor: `${accent.bg}80`, backgroundColor: `${accent.bg}0d`, transition: "border-color 0.4s ease, background-color 0.4s ease" }
          : { transition: "border-color 0.4s ease, background-color 0.4s ease" }
      }
    >
      <div
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
          selected ? "text-white" : "border-muted-foreground/30 bg-card",
        )}
        style={
          selected
            ? { borderColor: accent.bg, backgroundColor: accent.bg, transition: "border-color 0.4s ease, background-color 0.4s ease" }
            : { transition: "border-color 0.4s ease, background-color 0.4s ease" }
        }
      >
        {selected && <Check className="h-3 w-3" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium text-foreground">{name}</span>
      </div>
      <Palette className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

export function Step5() {
  const form = useWizardForm()
  const { i18n } = useLingui()
  const styleguide = useStore(form.store, (s) => s.values.styleguide)
  const selectedPreset = useStore(form.store, (s) => s.values.selectedPreset)
  const accent = getPresetAccent(selectedPreset)
  const { data: styleguidesData, isLoading } = useStyleguides()
  const available = styleguidesData?.styleguides ?? []
  const [search, setSearch] = useState("")
  const uploadMutation = useUploadStyleguide()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const allStyleguides = available
  const showSearch = allStyleguides.length > 8
  const visibleStyleguides = useMemo(() => {
    if (!showSearch) return allStyleguides
    const query = search.trim().toLowerCase()
    if (!query) return allStyleguides
    return allStyleguides.filter((sg) => sg.toLowerCase().includes(query))
  }, [allStyleguides, search, showSearch])

  function select(name: string) {
    form.setFieldValue("styleguide", styleguide === name ? "" : name)
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    uploadMutation.mutate(file, {
      onSuccess: (data) => {
        form.setFieldValue("styleguide", data.name)
      },
    })
    e.target.value = ""
  }

  return (
    <div className="flex w-full flex-col gap-5 p-8">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground leading-relaxed">
          {i18n._(DESCRIPTION_PRIMARY)}
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {i18n._(DESCRIPTION_SECONDARY)}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {showSearch && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={i18n._(SEARCH_PLACEHOLDER)}
          />
        )}

        <div className="max-h-96 overflow-y-auto pr-1">
          <div className="flex flex-col gap-2">
            <StyleguideOption
              name={i18n._(NONE_OPTION)}
              selected={styleguide === ""}
              onSelect={() => form.setFieldValue("styleguide", "")}
              accent={accent}
            />

            {isLoading && (
              <p className="px-4 py-3 text-sm text-muted-foreground">{i18n._(LOADING_STYLEGUIDES)}</p>
            )}

            {visibleStyleguides.map((sg) => (
              <StyleguideOption
                key={sg}
                name={sg}
                selected={styleguide === sg}
                onSelect={() => select(sg)}
                accent={accent}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".md"
          className="hidden"
          onChange={handleUpload}
        />
        <Button
          type="button"
          variant="outline"
          className="cursor-pointer gap-2"
          disabled={uploadMutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-4 w-4" />
          {uploadMutation.isPending ? i18n._(UPLOADING) : i18n._(UPLOAD_STYLE_GUIDE)}
        </Button>
        {uploadMutation.isError && (
          <p className="text-sm text-destructive">
            {uploadMutation.error?.message ?? i18n._(UPLOAD_FAILED)}
          </p>
        )}
      </div>
    </div>
  )
}
