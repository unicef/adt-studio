import { useAtom, useAtomValue, useSetAtom } from "jotai"
import { ChevronRight } from "lucide-react"
import { ToggleRow } from "@/features/settings/components/ToggleRow"
import { appConfigAtom } from "@/shared/state/config.atoms"
import {
  autoplayModeAtom,
  describeImagesModeAtom,
  readAloudModeAtom,
  wordHighlightModeAtom,
} from "@/features/audio/state/audio.atoms"
import {
  easyReadModeAtom,
  eli5ModeAtom,
  glossaryListOpenAtom,
  signLanguageModeAtom,
} from "@/shared/state/ui.atoms"
import { useTranslation } from "@/features/language/hooks/useTranslation"
import { currentPageSignLanguageVideoAtom } from "@/features/sign-language/state/sign-language.atoms"
import { trackToggleEvent } from "@/shared/lib/analytics"

/**
 * Assistant tab — the "AI assistance" toggles. Only renders sections whose
 * feature flag is on in `config.features` (matches the `applyFeatureFlags`
 * pattern from base.js).
 */
export function AssistantTab() {
  const { t } = useTranslation()
  const features = useAtomValue(appConfigAtom).features

  const [easyRead, setEasyRead] = useAtom(easyReadModeAtom)
  const [readAloud, setReadAloud] = useAtom(readAloudModeAtom)
  const [autoplay, setAutoplay] = useAtom(autoplayModeAtom)
  const [describeImages, setDescribeImages] = useAtom(describeImagesModeAtom)
  const [wordHighlight, setWordHighlight] = useAtom(wordHighlightModeAtom)
  const [signLanguage, setSignLanguage] = useAtom(signLanguageModeAtom)
  const hasPageSignLanguageVideo = Boolean(
    useAtomValue(currentPageSignLanguageVideoAtom),
  )
  const [eli5, setEli5] = useAtom(eli5ModeAtom)
  const setGlossaryListOpen = useSetAtom(glossaryListOpenAtom)

  const wrap = (name: string, setter: (v: boolean) => void) => (next: boolean) => {
    trackToggleEvent(name, next)
    setter(next)
  }

  return (
    <div className="flex flex-col">
      {features.easyRead ? (
        <ToggleRow
          label={t("easy-read-label") || "Easy Read"}
          checked={easyRead}
          onChange={wrap("EasyRead", setEasyRead)}
        />
      ) : null}

      {features.readAloud ? (
        <>
          <ToggleRow
            label={t("tts-label") || "Text to speech"}
            checked={readAloud}
            onChange={wrap("ReadAloud", setReadAloud)}
            borderTop
          />

          {readAloud ? (
            <div className="bg-muted/40 rounded-lg border border-border mt-2 px-3">
              {features.autoplay ? (
                <ToggleRow
                  label={t("autoplay-label") || "Autoplay"}
                  checked={autoplay}
                  onChange={wrap("Autoplay", setAutoplay)}
                />
              ) : null}
              {features.describeImages ? (
                <ToggleRow
                  label={t("describe-images-label") || "Describe images"}
                  checked={describeImages}
                  onChange={wrap("DescribeImages", setDescribeImages)}
                  borderTop
                />
              ) : null}
              {/*
                Word-vs-sentence highlight toggle. Shown whenever read-aloud
                is on, NOT gated on `features.highlight` — that flag only
                indicates the book has precise per-word timings from the API.
                In its absence the player falls back to weight-based timing
                estimates from the tokenizer, which still produces a usable
                word highlight. Hiding the toggle in that case would lock
                the user into one mode with no recourse, which is exactly
                what the user reported.
              */}
              <ToggleRow
                label={t("word-highlight-label") || "Word highlight"}
                checked={wordHighlight}
                onChange={wrap("WordHighlight", setWordHighlight)}
                borderTop
              />
            </div>
          ) : null}
        </>
      ) : null}

      {features.signLanguage && hasPageSignLanguageVideo ? (
        <ToggleRow
          label={t("sign-language-label") || "Sign language"}
          checked={signLanguage}
          onChange={wrap("SignLanguage", setSignLanguage)}
          borderTop
        />
      ) : null}

      {features.eli5 ? (
        <ToggleRow
          label={t("eli5-label") || "Explain to me"}
          checked={eli5}
          onChange={wrap("Eli5", setEli5)}
          borderTop
        />
      ) : null}

      {features.glossary ? (
        <button
          type="button"
          onClick={() => setGlossaryListOpen(true)}
          aria-label={t("glossary-label") || "Glossary"}
          title={t("glossary-label") || "Glossary"}
          className="flex items-center justify-between py-3 border-t border-border w-full text-left hover:bg-accent/50 -mx-3 px-3 transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md"
        >
          <span className="text-base font-medium">
            {t("glossary-label") || "Glossary"}
          </span>
          <ChevronRight className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
