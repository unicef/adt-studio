import { useAtom, useAtomValue } from "jotai";
import { ToggleRow } from "@/features/settings/components/ToggleRow";
import { SegmentedRow } from "@/features/settings/components/SegmentedRow";
import { SettingsSection } from "@/features/settings/components/SettingsSection";
import { DockLayoutPicker } from "@/features/settings/components/DockLayoutPicker";
import { KeyboardShortcutsSection } from "@/features/settings/components/KeyboardShortcutsSection";
import { appConfigAtom, isSettingLocked } from "@/shared/state/config.atoms";
import {
  autoplayModeAtom,
  describeImagesModeAtom,
  readAloudModeAtom,
  wordHighlightModeAtom,
} from "@/features/audio/state/audio.atoms";
import {
  easyReadModeAtom,
  iconSizeAtom,
  reduceMotionAtom,
  stateModeAtom,
  themeAtom,
  type IconSize,
  type Theme,
} from "@/shared/state/ui.atoms";
import { useTranslation } from "@/features/language/hooks/useTranslation";
import { trackToggleEvent } from "@/shared/lib/analytics";

export function SettingsTab() {
  const { t } = useTranslation();
  const config = useAtomValue(appConfigAtom);
  const features = config.features;
  const dockLayoutLocked = isSettingLocked(config, "dockLayout");
  const themeLocked = isSettingLocked(config, "theme");
  const iconSizeLocked = isSettingLocked(config, "iconSize");
  const reduceMotionLocked = isSettingLocked(config, "reduceMotion");
  const showAccessibilitySection =
    !themeLocked || !iconSizeLocked || !reduceMotionLocked;
  const [easyRead, setEasyRead] = useAtom(easyReadModeAtom);
  const [stateMode, setStateMode] = useAtom(stateModeAtom);
  const [readAloud, setReadAloud] = useAtom(readAloudModeAtom);
  const [autoplay, setAutoplay] = useAtom(autoplayModeAtom);
  const [describeImages, setDescribeImages] = useAtom(describeImagesModeAtom);
  const [wordHighlight, setWordHighlight] = useAtom(wordHighlightModeAtom);
  const [iconSize, setIconSize] = useAtom(iconSizeAtom);
  const [reduceMotion, setReduceMotion] = useAtom(reduceMotionAtom);
  const [theme, setTheme] = useAtom(themeAtom);

  const wrap =
    (name: string, setter: (v: boolean) => void) => (next: boolean) => {
      trackToggleEvent(name, next);
      setter(next);
    };

  const showReadingSection = features.readAloud || !!features.easyRead;
  const showTtsSubsettings = readAloud;

  return (
    <div className="flex flex-col gap-1 px-4 pb-6">
      {showReadingSection ? (
        <SettingsSection title={t("settings-section-reading") || "Reading"}>
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
              />
              {showTtsSubsettings ? (
                <>
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
                    />
                  ) : null}
                  <SegmentedRow<"word" | "sentence">
                    label={t("highlight-mode-label") || "Highlight"}
                    value={wordHighlight ? "word" : "sentence"}
                    onChange={(v) => {
                      const next = v === "word";
                      trackToggleEvent("WordHighlight", next);
                      setWordHighlight(next);
                    }}
                    options={[
                      { value: "word", label: t("highlight-word") || "Word" },
                      {
                        value: "sentence",
                        label: t("highlight-sentence") || "Sentence",
                      },
                    ]}
                  />
                </>
              ) : null}
            </>
          ) : null}
        </SettingsSection>
      ) : null}

      {!dockLayoutLocked ? (
        <SettingsSection title={t("settings-section-toolbar") || "Toolbar"}>
          <DockLayoutPicker />
        </SettingsSection>
      ) : null}

      {showAccessibilitySection ? (
        <SettingsSection
          title={t("settings-section-accessibility") || "Accessibility"}
        >
          {!themeLocked ? (
            <SegmentedRow<Theme>
              label={t("theme-label") || "Theme"}
              value={theme as Theme}
              onChange={(v) => {
                trackToggleEvent(`Theme:${v}`, true);
                setTheme(v);
              }}
              options={[
                { value: "light", label: t("theme-light") || "Light" },
                { value: "dark", label: t("theme-dark") || "Dark" },
                { value: "system", label: t("theme-system") || "System" },
              ]}
            />
          ) : null}
          {!iconSizeLocked ? (
            <SegmentedRow<IconSize>
              label={t("icon-size-label") || "Icon size"}
              value={iconSize as IconSize}
              onChange={(v) => {
                trackToggleEvent(`IconSize:${v}`, true);
                setIconSize(v);
              }}
              options={[
                { value: "sm", label: t("icon-size-sm") || "Small" },
                { value: "md", label: t("icon-size-md") || "Medium" },
                { value: "lg", label: t("icon-size-lg") || "Large" },
              ]}
            />
          ) : null}
          {!reduceMotionLocked ? (
            <ToggleRow
              label={t("reduce-motion-label") || "Reduce motion"}
              description={
                t("reduce-motion-description") ||
                "Disable animations and transitions across the reader."
              }
              checked={reduceMotion}
              onChange={(v) => {
                trackToggleEvent("ReduceMotion", v);
                setReduceMotion(v);
              }}
            />
          ) : null}
        </SettingsSection>
      ) : null}

      {features.showAutoHideButton !== false ? (
        <SettingsSection title={t("settings-section-behavior") || "Behavior"}>
          <ToggleRow
            label={t("state-label") || "Auto-hide menus"}
            checked={stateMode}
            onChange={(v) => {
              trackToggleEvent("HideMenus", v);
              setStateMode(v);
            }}
          />
        </SettingsSection>
      ) : null}

      <KeyboardShortcutsSection />
    </div>
  );
}
