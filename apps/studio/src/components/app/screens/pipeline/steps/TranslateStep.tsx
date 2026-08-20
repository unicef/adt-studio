import { useMemo, useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { tint } from "@/components/app/screens/pipeline/shared/plugins"
import { useSaveTranslation } from "./shared/mutations"
import { useTextCatalog } from "./shared/queries"
import { StepEmpty, StepLoading, StepShell } from "./shared/StepShell"
import { EditableText, SaveError, StepBody, StepCard, StepEmptyHint, StepRail } from "./shared/ui"
import type { StepProps } from "./shared/types"

function languageName(code: string, locale: string): string {
  if (!code) return ""
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(code) ?? code.toUpperCase()
  } catch {
    return code.toUpperCase()
  }
}

export function TranslateStep(props: StepProps) {
  const { label, plugin } = props
  const { t, i18n } = useLingui()
  const query = useTextCatalog(label)

  const catalog = query.data
  const languages = useMemo(() => Object.keys(catalog?.translations ?? {}).sort(), [catalog])
  const [active, setActive] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const language = active ?? languages[0] ?? ""
  const save = useSaveTranslation(label, language)

  const sourceById = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of catalog?.entries ?? []) map.set(entry.id, entry.text)
    return map
  }, [catalog])

  const translation = language ? catalog?.translations[language] : undefined

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (translation?.entries ?? []).filter((entry) => {
      if (!q) return true
      return (entry.text + " " + (sourceById.get(entry.id) ?? "")).toLowerCase().includes(q)
    })
  }, [translation, search, sourceById])

  const patch = (id: string, text: string) => {
    if (!translation) return
    save.mutate({
      entries: translation.entries.map((entry) => (entry.id === id ? { ...entry, text } : entry)),
    })
  }

  if (query.isLoading) return <StepLoading {...props} />
  if (languages.length === 0) return <StepEmpty {...props} />

  const total = catalog?.entries.length ?? 0

  return (
    <StepShell
      {...props}
      chips={[t`${total} strings`, t`${languages.length} languages`]}
      canApply={languages.length > 0}
      rail={
        <StepRail
          heading={<Trans>Target languages</Trans>}
          hex={plugin.hex}
          entries={languages.map((code) => ({
            key: code,
            title: languageName(code, i18n.locale),
            count: catalog?.translations[code]?.entries.length ?? 0,
          }))}
          activeKey={language}
          onSelect={setActive}
          footer={<Trans>{total} source strings in the catalog.</Trans>}
        />
      }
    >
      <StepBody
        title={<Trans>Translation</Trans>}
        meta={languageName(language, i18n.locale)}
        actions={
          <Input
            wrapperClassName="w-[240px]"
            className="h-8"
            prependIcon={<Search className="size-3.5" />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t`Search source or translation…`}
          />
        }
      >
        <SaveError error={save.error} />

        {rows.length === 0 ? (
          <StepEmptyHint>
            <Trans>No strings match this search.</Trans>
          </StepEmptyHint>
        ) : (
          rows.map((entry) => (
            <StepCard key={entry.id} accent={plugin.hex}>
              <div className="grid grid-cols-2 gap-3.5">
                <div className="flex flex-col gap-1">
                  <span className="font-mono text-[10px] text-muted-foreground">{entry.id}</span>
                  <p className="px-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                    {sourceById.get(entry.id) ?? ""}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <span
                    className="w-fit rounded px-1.5 font-mono text-[10px] uppercase"
                    style={{ background: tint(plugin.hex, 0.12), color: plugin.hex }}
                  >
                    {language}
                  </span>
                  <EditableText
                    value={entry.text}
                    ariaLabel={t`translation of ${entry.id}`}
                    placeholder={t`Not translated yet`}
                    isSaving={save.isPending}
                    onSave={(text) => patch(entry.id, text)}
                    className="text-[12.5px] leading-relaxed"
                  />
                </div>
              </div>
            </StepCard>
          ))
        )}
      </StepBody>
    </StepShell>
  )
}
