import { useState, useEffect, useRef } from "react"
import { flushSync } from "react-dom"
import { AlertCircle, Images, Pencil, X } from "lucide-react"
import { SettingExplainer } from "@/components/pipeline/components/SettingExplainer"
import { Trans, useLingui } from "@lingui/react/macro"
import { LandingPageShell } from "@/components/pipeline/components/LandingPageShell"
import { PrereqGuard } from "@/components/pipeline/components/PrereqGuard"
import {
  SettingsCard,
  SettingsField,
} from "@/components/pipeline/components/SettingsCard"
import { LanguagePicker } from "@/components/LanguagePicker"
import { useActiveConfig } from "@/hooks/use-debug"
import { useStageStatus } from "@/hooks/use-stage-status"
import { useBookRun } from "@/hooks/use-book-run"
import { useApiKey } from "@/hooks/use-api-key"
import { useBookConfig } from "@/hooks/use-book-config"
import { usePersistConfig } from "@/hooks/use-persist-config"
import { useBook } from "@/hooks/use-books"
import { normalizeLocale } from "@/lib/languages"
import { reconcileSourceOutputLanguage } from "./lib/translations-view-state"
import { displayLang } from "./lib/display-lang"
import { SelectImagesDialog } from "./components/SelectImagesDialog"
import { ImageTranslationVisual } from "./components/ImageTranslationVisual"
import { LanguagePreview } from "./components/LanguagePreview"

const viewTransitionNameFor = (code: string) => `lang-chip-${code.replace(/[^a-zA-Z0-9_-]/g, "_")}`

export function LanguageLandingPage({ bookLabel }: { bookLabel: string }) {
  const { t } = useLingui()
  const { data: bookConfigData } = useBookConfig(bookLabel)
  const { data: activeConfigData } = useActiveConfig(bookLabel)
  const { data: book } = useBook(bookLabel)
  const persist = usePersistConfig(bookLabel)
  const { apiKey, hasApiKey } = useApiKey()
  const { queueRun } = useBookRun()
  const status = useStageStatus("translate")
  const storyboardStatus = useStageStatus("storyboard")
  const storyboardReady = storyboardStatus.isCompleted
  const captionsStatus = useStageStatus("captions")
  const captionsReady = captionsStatus.isCompleted

  const [outputLanguages, setOutputLanguages] = useState<Set<string>>(new Set())
  const [selectedImageIds, setSelectedImageIds] = useState<string[]>([])
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const seededRef = useRef(false)

  // The book's original language drives the implicit base output. Resolve it the
  // same way as LanguageView/LanguageSettings: prefer an explicit editing-language
  // override, otherwise the Extract metadata language, normalized to a BCP-47
  // locale so a localized code (e.g. "es-UY") is preserved.
  const configuredEditingLanguage =
    typeof activeConfigData?.merged?.editing_language === "string"
      ? (activeConfigData.merged.editing_language as string)
      : null
  const bookLanguage = book?.languageCode ?? book?.metadata?.language_code ?? null
  const baseLanguage = normalizeLocale(
    configuredEditingLanguage ?? bookLanguage ?? "en",
  )

  useEffect(() => {
    if (!activeConfigData || !book) return
    const m = activeConfigData.merged as Record<string, unknown>
    const existing = Array.isArray(m.output_languages)
      ? (m.output_languages as string[]).map((code) => normalizeLocale(code))
      : []

    if (!seededRef.current) {
      seededRef.current = true
      // The book's original language is always an output. Reconcile its entry
      // with the current Extract metadata language so a previously-seeded bare
      // code is updated to the live, localized one ("es" -> "es-UY"). Only the
      // stale bare-base seed is replaced — deliberately-added regional variants
      // (e.g. "en-GB" while the source is "en", or "es-MX" while the source is
      // "es-UY") are preserved.
      const reconciled = reconcileSourceOutputLanguage(existing, baseLanguage)
      setOutputLanguages(new Set(reconciled))
      // Persist only when the set of languages actually changed (ignore reorder).
      const changed =
        reconciled.length !== existing.length ||
        reconciled.some((code) => !existing.includes(code)) ||
        existing.some((code) => !reconciled.includes(code))
      if (changed) persist({ output_languages: reconciled })
    }

    if (m.image_translation && typeof m.image_translation === "object") {
      const it = m.image_translation as Record<string, unknown>
      if (Array.isArray(it.selected_image_ids)) {
        setSelectedImageIds(it.selected_image_ids as string[])
      }
    }
  }, [activeConfigData, book, baseLanguage])

  const withChipTransition = (update: () => void) => {
    const reduceMotion =
      typeof window !== "undefined" &&
      // eslint-disable-next-line lingui/no-unlocalized-strings -- CSS media query, not user-visible
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const doc = typeof document !== "undefined" ? document : null
    if (!doc || typeof doc.startViewTransition !== "function" || reduceMotion) {
      update()
      return
    }
    doc.startViewTransition(() => {
      flushSync(update)
    })
  }

  const handleLanguageToggle = (code: string) => {
    withChipTransition(() => {
      const next = new Set(outputLanguages)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      setOutputLanguages(next)
      persist({ output_languages: Array.from(next) })
    })
  }

  const handleLanguageRemove = (code: string) => {
    withChipTransition(() => {
      const next = new Set(outputLanguages)
      next.delete(code)
      setOutputLanguages(next)
      persist({ output_languages: Array.from(next) })
    })
  }

  const persistImageTranslation = (patch: Record<string, unknown>) => {
    const existing = (bookConfigData?.config?.image_translation ?? {}) as Record<
      string,
      unknown
    >
    persist({ image_translation: { ...existing, ...patch } })
  }

  const handleImagesConfirm = (ids: string[]) => {
    setSelectedImageIds(ids)
    // Image translations are "enabled" iff at least one image is selected —
    // the selection itself is the on/off signal. Still persist both fields so
    // the pipeline's existing `enabled` check keeps working.
    persistImageTranslation({
      enabled: ids.length > 0,
      selected_image_ids: ids.length > 0 ? ids : undefined,
    })
    setImageDialogOpen(false)
  }

  const handleRun = () => {
    if (!hasApiKey || !storyboardReady || status.isRunning) return
    queueRun({ fromStage: "translate", toStage: "translate", apiKey })
  }

  const hasLanguages = outputLanguages.size > 0

  const disabledReason = !hasApiKey ? (
    <Trans>Add an API key in Book settings to run translation.</Trans>
  ) : !storyboardReady ? (
    <Trans>Run Storyboard first — translation needs the typed sections placed by Storyboard.</Trans>
  ) : !hasLanguages ? (
    <Trans>Add at least one output language to run translation.</Trans>
  ) : undefined

  return (
    <LandingPageShell
      bookLabel={bookLabel}
      stageSlug="translate"
      settingsTab="general"
      colorClass="bg-pink-600 hover:bg-pink-700"
      accentColor="#db2777"
      accentColorSoft="#fce7f3"
      isRunning={status.isRunning}
      isCompleted={status.isCompleted}
      hasError={status.hasError}
      canRun={true}
      extraDisabled={!hasApiKey || !storyboardReady || !hasLanguages}
      disabledReason={disabledReason}
      runLabel={<Trans>Run Translation</Trans>}
      rerunLabel={<Trans>Re-run</Trans>}
      previewLabel={t`Translation Preview`}
      onRun={handleRun}
      preview={
        <LanguagePreview
          baseLanguage={baseLanguage}
          outputLanguages={Array.from(outputLanguages)}
          imageCount={selectedImageIds.length}
        />
      }
    >
      <div className="flex flex-col gap-2">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#0a0a0a]">
          <Trans>Language</Trans>
        </h1>
        <p className="text-[14px] text-[#737373] leading-relaxed">
          <Trans>
            Translate the book into additional languages. Each language is
            generated alongside the original, ready for narration, captions,
            and on-page reading.
          </Trans>
        </p>
      </div>

      <PrereqGuard
        upstreamSlug="storyboard"
        stageSlug="translate"
        description={
          <Trans>
            Translation runs on the typed sections placed by Storyboard.
            Finish Storyboard before running this stage.
          </Trans>
        }
      />

      <SettingsCard>
        <SettingsField
          label={<Trans>Output Languages</Trans>}
          hint={
            <Trans>
              Pick the languages you want to translate to. The book's original
              language stays as-is.
            </Trans>
          }
        >
          <div className="flex flex-col gap-2.5">
            {outputLanguages.size > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {Array.from(outputLanguages).map((code) => (
                  <li
                    key={code}
                    style={{ viewTransitionName: viewTransitionNameFor(code) }}
                  >
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-pink-200 bg-pink-50 px-2.5 py-1 text-[12px] font-medium text-pink-700 transition-colors">
                      {displayLang(code)}
                      <button
                        type="button"
                        onClick={() => handleLanguageRemove(code)}
                        aria-label={t`Remove ${displayLang(code)}`}
                        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-pink-500 transition-colors hover:bg-pink-100 hover:text-pink-700"
                      >
                        <X className="h-2.5 w-2.5" strokeWidth={2.5} aria-hidden />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <LanguagePicker
              selected={outputLanguages}
              onSelect={handleLanguageToggle}
              multiple
              renderBadges={false}
              label={t`Add language`}
            />
          </div>
        </SettingsField>
      </SettingsCard>

      <SettingsCard>
        <SettingsField
          label={<Trans>Image Translations</Trans>}
          labelAction={
            <SettingExplainer
              visual={<ImageTranslationVisual />}
              description={
                <Trans>
                  Sample shown for illustration. The actual languages used
                  come from your Output Languages list above.
                </Trans>
              }
            />
          }
          hint={
            <Trans>
              Optionally translate burned-in text inside images (signs, labels,
              callouts). Select the images to localize — leaving the list
              empty keeps images in the source language.
            </Trans>
          }
        >
            <div className="flex flex-col gap-2">
              {selectedImageIds.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setImageDialogOpen(true)}
                  disabled={!captionsReady}
                  className="group flex w-full items-center gap-3 rounded-md border border-[#e5e5e5] bg-white px-3 py-2.5 text-left transition-colors hover:border-[#d4d4d4] hover:bg-[#fafafa] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-pink-100 text-pink-700">
                    <Images className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </span>
                  <span className="flex-1 text-[13px] font-medium text-[#0a0a0a]">
                    <Trans>
                      {selectedImageIds.length} image
                      {selectedImageIds.length === 1 ? "" : "s"} selected
                    </Trans>
                  </span>
                  <Pencil
                    className="h-3.5 w-3.5 text-[#a3a3a3] transition-colors group-hover:text-[#525252]"
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setImageDialogOpen(true)}
                  disabled={!captionsReady}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#e5e5e5] bg-[#fafafa] px-3 py-3 text-[12px] font-medium text-[#737373] transition-colors hover:border-[#d4d4d4] hover:bg-[#f5f5f5] hover:text-[#525252] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Images
                    className="h-3.5 w-3.5"
                    strokeWidth={2.25}
                    aria-hidden
                  />
                  <Trans>Choose images...</Trans>
                </button>
              )}

              {!captionsReady && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800">
                  <AlertCircle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <span>
                    <Trans>
                      Run Image Captions first — only captioned images appear
                      in this list.
                    </Trans>
                  </span>
                </div>
              )}
            </div>
          </SettingsField>
        </SettingsCard>

      {imageDialogOpen && (
        <SelectImagesDialog
          bookLabel={bookLabel}
          initialSelected={selectedImageIds}
          onConfirm={handleImagesConfirm}
          onClose={() => setImageDialogOpen(false)}
        />
      )}
    </LandingPageShell>
  )
}
