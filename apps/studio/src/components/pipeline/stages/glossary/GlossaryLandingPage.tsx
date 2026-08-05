import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AddGlossaryDialog } from "./AddGlossaryDialog"
import type { GlossaryItem } from "@/api/client"
import { Trans, useLingui } from "@lingui/react/macro"
import { CustomInstructionsField } from "@/components/pipeline/components/CustomInstructionsField"
import { LandingPageShell } from "@/components/pipeline/components/LandingPageShell"
import { PrereqGuard } from "@/components/pipeline/components/PrereqGuard"
import {
  SettingsCard,
  SettingsField,
} from "@/components/pipeline/components/SettingsCard"
import { useActiveConfig } from "@/hooks/use-debug"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { useComposeBookContext } from "@/hooks/use-compose-book-context"
import {
  GlossaryPreview,
  type AmountKey,
} from "./components/GlossaryPreview"
import { AmountRow, AMOUNT_OPTIONS } from "./components/AmountRow"
import { SeedTermRow } from "./components/SeedTermRow"

export function GlossaryLandingPage({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const status = useStageStatus("glossary")
  const storyboardStatus = useStageStatus("storyboard")
  const storyboardReady = storyboardStatus.isCompleted
  const { compose: composeBookContext, canAutoFill } = useComposeBookContext(
    bookLabel,
    t`Prefer terms central to the book's subject matter. Skip generic vocabulary and proper nouns that don't carry meaning beyond the page.`,
  )

  const [amount, setAmount] = useState<AmountKey>("standard")
  const [userPrompt, setUserPrompt] = useState("")
  const [seedTerms, setSeedTerms] = useState<GlossaryItem[]>([])
  const [showAddDialog, setShowAddDialog] = useState(false)

  useEffect(() => {
    if (!activeConfigData) return
    const m = activeConfigData.merged as Record<string, unknown>
    if (
      m.glossary_amount === "concise" ||
      m.glossary_amount === "standard" ||
      m.glossary_amount === "comprehensive"
    ) {
      setAmount(m.glossary_amount)
    }
    if (typeof m.glossary_user_prompt === "string") {
      setUserPrompt(m.glossary_user_prompt)
    }
    if (Array.isArray(m.glossary_seed_terms)) {
      setSeedTerms(m.glossary_seed_terms as GlossaryItem[])
    }
  }, [activeConfigData])

  const handleAmountChange = (value: AmountKey) => {
    setAmount(value)
    persist({ glossary_amount: value })
  }

  const handleSeedTermAdd = (item: GlossaryItem) => {
    const next = [...seedTerms, item]
    setSeedTerms(next)
    persist({ glossary_seed_terms: next })
  }

  const handleSeedTermRemove = (id: string) => {
    const next = seedTerms.filter((t) => t.id !== id)
    setSeedTerms(next)
    persist({ glossary_seed_terms: next })
  }

  const handleUserPromptChange = (value: string) => {
    setUserPrompt(value)
    persist({ glossary_user_prompt: value })
  }

  const handleRun = () => {
    if (!hasApiKey || !storyboardReady || status.isRunning) return
    queueRun({ fromStage: "glossary", toStage: "glossary", apiKey, viewAfter: true })
  }

  const disabledReason = !hasApiKey ? (
    <Trans>Add an API key in Book settings to run the glossary.</Trans>
  ) : !storyboardReady ? (
    <Trans>Run Storyboard first — the glossary is built from the typed sections placed by Storyboard.</Trans>
  ) : undefined

  return (
    <LandingPageShell
      bookLabel={bookLabel}
      stageSlug="glossary"
      settingsTab="general"
      colorClass="bg-lime-600 hover:bg-lime-700"
      accentColor="#65a30d"
      accentColorSoft="#ecfccb"
      isRunning={status.isRunning}
      isCompleted={status.isCompleted}
      hasError={status.hasError}
      canRun={true}
      extraDisabled={!hasApiKey || !storyboardReady}
      disabledReason={disabledReason}
      runLabel={<Trans>Run Glossary</Trans>}
      rerunLabel={<Trans>Re-run</Trans>}
      previewLabel={t`Glossary Preview`}
      onRun={handleRun}
      preview={<GlossaryPreview amount={amount} />}
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
          <Trans>Glossary</Trans>
        </h1>
        <p className="text-[14px] text-[#737373] leading-relaxed">
          <Trans>
            Build a glossary of key terms found in the book. Choose how much
            ground to cover, and add custom instructions to steer term
            selection toward what your audience needs.
          </Trans>
        </p>
      </div>

      <PrereqGuard
        upstreamSlug="storyboard"
        stageSlug="glossary"
        description={
          <Trans>
            The glossary scans the typed sections that Storyboard places into
            pages. Finish Storyboard before running this stage.
          </Trans>
        }
      />

      <SettingsCard>
        <SettingsField label={<Trans>Amount</Trans>}>
          <div role="radiogroup" className="flex flex-col gap-2">
            {AMOUNT_OPTIONS.map((opt) => (
              <AmountRow
                key={opt.value}
                option={opt}
                checked={amount === opt.value}
                onSelect={() => handleAmountChange(opt.value)}
              />
            ))}
          </div>
        </SettingsField>
      </SettingsCard>

      <SettingsCard>
        <SettingsField
          label={<Trans>Pre-defined Terms</Trans>}
          labelAction={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAddDialog(true)}
              className="h-7 gap-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-[#737373] hover:text-[var(--accent-color,#525252)]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              <Trans>Add term</Trans>
            </Button>
          }
          hint={
            <Trans>
              Optional. Terms added here are pinned to the glossary so they
              always appear, even after re-running AI generation.
            </Trans>
          }
        >
          {seedTerms.length === 0 ? (
            <button
              type="button"
              onClick={() => setShowAddDialog(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#e5e5e5] bg-[#fafafa] px-3 py-3 text-[12px] font-medium text-[#737373] transition-colors hover:border-[#d4d4d4] hover:bg-[#f5f5f5] hover:text-[#525252] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
              <Trans>Add your first term</Trans>
            </button>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {seedTerms.map((term) => (
                <SeedTermRow
                  key={term.id}
                  term={term}
                  onRemove={() => handleSeedTermRemove(term.id ?? "")}
                />
              ))}
            </ul>
          )}
        </SettingsField>
      </SettingsCard>

      <SettingsCard>
        <SettingsField
          label={<Trans>Custom Instructions</Trans>}
          hint={
            <Trans>
              Optional. Tell the model what kinds of terms to focus on or
              avoid (e.g. "skip proper nouns", "include scientific names").
            </Trans>
          }
        >
          <CustomInstructionsField
            value={userPrompt}
            onChange={handleUserPromptChange}
            compose={composeBookContext}
            canAutoFill={canAutoFill}
            accentHex="#65a30d"
            dialogDescription={t`Optional notes to steer how the glossary is generated. Use Auto-fill to start from the book's title, language, and summary.`}
            placeholder={t`e.g. focus on scientific vocabulary, skip place names, define every italicized word…`}
          />
        </SettingsField>
      </SettingsCard>

      <AddGlossaryDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        bookLabel={bookLabel}
        existingItems={seedTerms}
        onAdd={handleSeedTermAdd}
      />
    </LandingPageShell>
  )
}
