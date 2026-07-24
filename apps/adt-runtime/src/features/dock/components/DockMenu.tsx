import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useRef } from "react";
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
  signLanguageModeAtom,
  type DockMenuValue,
} from "@/shared/state/ui.atoms";
import { useAudioPlayerContext } from "@/features/audio/hooks/AudioPlayerContext";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import { trackToggleEvent } from "@/shared/lib/analytics";
import { cn } from "@/shared/lib/utils";
import { DockIconButton } from "@/features/dock/components/DockIconButton";
import { useDockContext } from "@/features/dock/context/dock-context";
import { GlossaryContent } from "@/features/glossary/components/GlossaryDockContent";
import { AudioContent } from "@/features/audio/components/AudioDockContent";
import { LanguageContent } from "@/features/language/components/LanguageDockContent";
import { SettingsContent } from "@/features/settings/components/SettingsDockContent";
import { DockPanel } from "./DockPanel";

interface DockMenuProps {
  className?: string;
}

export function DockMenu({ className }: DockMenuProps) {
  const features = useAtomValue(appConfigAtom).features;
  const [value, setValue] = useAtom(dockMenuValueAtom);
  const [signLanguage, setSignLanguage] = useAtom(signLanguageModeAtom);
  const { t } = useTranslation();
  const { popoverSide: side } = useDockContext();

  const glossaryBtnRef = useRef<HTMLButtonElement>(null);
  const languageBtnRef = useRef<HTMLButtonElement>(null);
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  const toggle = (next: DockMenuValue) =>
    setValue((prev) => (prev === next ? "" : next));

  return (
    <>
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

        <TTSDockButton />

        {features.signLanguage ? (
          <DockIconButton
            ariaLabel={t("sign-language-label") || "Sign language"}
            pressed={signLanguage}
            onClick={() => {
              const next = !signLanguage;
              trackToggleEvent("SignLanguage", next);
              setSignLanguage(next);
            }}
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
          ariaLabel={t("sidebar-title") || "Settings"}
          pressed={value === "settings"}
          onClick={() => toggle("settings")}
        >
          <Settings />
        </DockIconButton>
      </div>

      <DockPanel
        open={value === "glossary"}
        onClose={() => setValue("")}
        anchor={glossaryBtnRef}
        side={side}
      >
        <GlossaryContent />
      </DockPanel>

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

function TTSDockButton() {
  const hasTTS = useAtomValue(appConfigAtom).features.readAloud;
  const [value, setValue] = useAtom(dockMenuValueAtom);
  const readAloud = useAtomValue(readAloudModeAtom);
  const setPlayBarVisible = useSetAtom(playBarVisibleAtom);
  const { isPlaying, play } = useAudioPlayerContext();
  const { t } = useTranslation();
  const { popoverSide: side } = useDockContext();
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = (next: DockMenuValue) =>
    setValue((prev) => (prev === next ? "" : next));

  const handleClick = () => {
    setPlayBarVisible(true);
    toggle("audio");

    if (value != "audio") {
      play();
    }
  };

  if (!hasTTS) return null;

  return (
    <>
      <DockIconButton
        ref={btnRef}
        ariaLabel={
          readAloud
            ? t("deactivate-tts-label") || "Deactivate text to speech"
            : t("activate-tts-label") || "Activate text to speech"
        }
        onClick={handleClick}
      >
        {readAloud ? (
          <Volume2 className={cn(isPlaying && "animate-pulse")} />
        ) : (
          <VolumeX />
        )}
      </DockIconButton>
      <DockPanel
        open={value === "audio"}
        onClose={() => setValue("")}
        anchor={btnRef}
        side={side}
      >
        <AudioContent />
      </DockPanel>
    </>
  );
}
