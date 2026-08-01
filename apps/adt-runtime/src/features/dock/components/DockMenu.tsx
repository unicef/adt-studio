import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useMemo, useRef } from "react";
import {
  BookOpen,
  Hand,
  Languages,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";
import { appConfigAtom } from "@/shared/state/config.atoms";
import {
  playBarVisibleAtom,
  readAloudModeAtom,
} from "@/features/audio/state/audio.atoms";
import {
  dockMenuValueAtom,
  easyReadModeAtom,
  glossaryModeAtom,
  signLanguageModeAtom,
  type DockMenuValue,
} from "@/shared/state/ui.atoms";
import { useAudioPlayerContext } from "@/features/audio/hooks/AudioPlayerContext";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import { trackToggleEvent } from "@/shared/lib/analytics";
import { cn } from "@/shared/lib/utils";
import { useIsMobile } from "@/shared/hooks/use-is-mobile";
import { DockIconButton } from "@/features/dock/components/DockIconButton";
import { DockMobileTools, type DockTool } from "@/features/dock/components/DockMobileTools";
import { useDockContext } from "@/features/dock/context/dock-context";
import { GlossaryContent } from "@/features/glossary/components/GlossaryDockContent";
import { AudioContent } from "@/features/audio/components/AudioDockContent";
import { LanguageContent } from "@/features/language/components/LanguageDockContent";
import { SettingsContent } from "@/features/settings/components/SettingsDockContent";
import { currentPageSignLanguageVideoAtom } from "@/features/sign-language/state/sign-language.atoms";
import { DockPanel } from "./DockPanel";

interface DockMenuProps {
  className?: string;
}

export function DockMenu({ className }: DockMenuProps) {
  const features = useAtomValue(appConfigAtom).features;
  const [value, setValue] = useAtom(dockMenuValueAtom);
  const [signLanguage, setSignLanguage] = useAtom(signLanguageModeAtom);
  const glossaryHighlight = useAtomValue(glossaryModeAtom);
  const easyRead = useAtomValue(easyReadModeAtom);
  const hasPageSignLanguageVideo = Boolean(
    useAtomValue(currentPageSignLanguageVideoAtom),
  );
  const { t } = useTranslation();
  const { popoverSide: side } = useDockContext();
  const isMobile = useIsMobile();

  const readAloud = useAtomValue(readAloudModeAtom);
  const setReadAloud = useSetAtom(readAloudModeAtom);
  const setPlayBarVisible = useSetAtom(playBarVisibleAtom);
  const { isPlaying, play, stop } = useAudioPlayerContext();

  const glossaryBtnRef = useRef<HTMLButtonElement>(null);
  const audioBtnRef = useRef<HTMLButtonElement>(null);
  const languageBtnRef = useRef<HTMLButtonElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(
    (next: DockMenuValue) => setValue((prev) => (prev === next ? "" : next)),
    [setValue],
  );

  const toggleReadAloud = useCallback(() => {
    if (readAloud) {
      stop();
      setReadAloud(false);
      setPlayBarVisible(false);
    } else {
      setPlayBarVisible(true);
      setReadAloud(true);
      play();
    }
  }, [readAloud, stop, setReadAloud, setPlayBarVisible, play]);

  const showSignLanguage = features.signLanguage && hasPageSignLanguageVideo;
  const toggleSignLanguage = useCallback(() => {
    const next = !signLanguage;
    trackToggleEvent("SignLanguage", next);
    setSignLanguage(next);
  }, [signLanguage, setSignLanguage]);

  const tools = useMemo<DockTool[]>(
    () =>
      [
        features.glossary && {
          key: "glossary",
          label: t("glossary-label") || "Glossary",
          icon: BookOpen,
          active: glossaryHighlight,
          onSelect: () => toggle("glossary"),
        },
        features.readAloud && {
          key: "audio",
          label: t("tts-label") || "Text to speech",
          icon: readAloud ? Volume2 : VolumeX,
          active: readAloud,
          onSelect: toggleReadAloud,
        },
        showSignLanguage && {
          key: "sign-language",
          label: t("sign-language-label") || "Sign language",
          icon: Hand,
          active: signLanguage,
          onSelect: toggleSignLanguage,
        },
        {
          key: "language",
          label: t("language-label") || "Language",
          icon: Languages,
          active: easyRead,
          onSelect: () => toggle("language"),
        },
        {
          key: "settings",
          label: t("sidebar-settings") || "Settings",
          icon: Settings,
          active: false,
          onSelect: () => toggle("settings"),
        },
      ].filter(Boolean) as DockTool[],
    [
      features.glossary,
      features.readAloud,
      showSignLanguage,
      glossaryHighlight,
      readAloud,
      signLanguage,
      easyRead,
      t,
      toggle,
      toggleReadAloud,
      toggleSignLanguage,
    ],
  );

  return (
    <>
      {isMobile ? (
        <DockMobileTools tools={tools} label={t("tutorial-smart-utility-sidebar-label") || "Accessibility menu"} />
      ) : (
        <div className={cn("flex items-center justify-end gap-2 pl-1", className)}>
          {features.glossary ? (
            <DockIconButton
              ref={glossaryBtnRef}
              ariaLabel={t("glossary-label") || "Glossary"}
              pressed={value === "glossary"}
              onClick={() => toggle("glossary")}
            >
              <BookOpen />
            </DockIconButton>
          ) : null}

          {features.readAloud ? (
            <DockIconButton
              ref={audioBtnRef}
              ariaLabel={
                readAloud
                  ? t("deactivate-tts-label") || "Deactivate text to speech"
                  : t("activate-tts-label") || "Activate text to speech"
              }
              pressed={readAloud}
              onClick={toggleReadAloud}
            >
              {readAloud ? (
                <Volume2 className={cn(isPlaying && "animate-pulse")} />
              ) : (
                <VolumeX />
              )}
            </DockIconButton>
          ) : null}

          {showSignLanguage ? (
            <DockIconButton
              ariaLabel={t("sign-language-label") || "Sign language"}
              pressed={signLanguage}
              onClick={toggleSignLanguage}
            >
              <Hand />
            </DockIconButton>
          ) : null}

          <DockIconButton
            ref={languageBtnRef}
            ariaLabel={t("language-label") || "Language"}
            pressed={value === "language"}
            onClick={() => toggle("language")}
          >
            <Languages />
          </DockIconButton>

          <DockIconButton
            ref={settingsBtnRef}
            ariaLabel={t("sidebar-settings") || "Settings"}
            pressed={value === "settings"}
            onClick={() => toggle("settings")}
          >
            <Settings />
          </DockIconButton>
        </div>
      )}

      {features.glossary ? (
        <DockPanel
          open={value === "glossary"}
          onClose={() => setValue("")}
          anchor={glossaryBtnRef}
          side={side}
        >
          <GlossaryContent />
        </DockPanel>
      ) : null}

      {features.readAloud ? (
        <DockPanel
          open={readAloud}
          onClose={() => {
            stop();
            setReadAloud(false);
            setPlayBarVisible(false);
          }}
          anchor={audioBtnRef}
          side={side}
          mobileVariant="inline"
          persistent
        >
          <AudioContent />
        </DockPanel>
      ) : null}

      <DockPanel
        open={value === "language"}
        onClose={() => setValue("")}
        anchor={languageBtnRef}
        side={side}
      >
        <LanguageContent onSelect={() => setValue("")} />
      </DockPanel>

      <DockPanel
        open={value === "settings"}
        onClose={() => setValue("")}
        anchor={settingsBtnRef}
        side={side}
      >
        <SettingsContent />
      </DockPanel>
    </>
  );
}
