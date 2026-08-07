import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Trans, useLingui } from "@lingui/react/macro"
import { Check } from "lucide-react"
import { SegmentedControl } from "@/components/ui/segmented-control"
import { Switch } from "@/components/ui/switch"
import { useUiVersion } from "@/hooks/use-ui-version"
import { cn } from "@/lib/utils"
import { CARD, HEADING, LEAD, SettingRow } from "./ui"
import { THEME_OPTIONS, type ThemeMode } from "./options"
import { SETTINGS_ANCHORS } from "./nav"

const THEME_KEY = "adt.theme"

function storedTheme(): ThemeMode {
  try {
    return (localStorage.getItem(THEME_KEY) as ThemeMode) || "light"
  } catch {
    return "light"
  }
}

function applyTheme(mode: ThemeMode) {
  const dark =
    mode === "dark" ||
    // eslint-disable-next-line lingui/no-unlocalized-strings
    (mode === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", !!dark)
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    /* ignore */
  }
}

export function ThemeSection() {
  const { t, i18n } = useLingui()
  const navigate = useNavigate()
  const [theme, setTheme] = useState<ThemeMode>(storedTheme)
  const [motion, setMotion] = useState(false)
  const [uiVersion, setUiVersion] = useUiVersion()

  return (
    <>
      <div className={HEADING}>
        <Trans>Theme</Trans>
      </div>
      <div className={LEAD}>
        <Trans>How ADT Studio looks on this machine.</Trans>
      </div>
      <div id={SETTINGS_ANCHORS.themeMode} className="mb-4 grid scroll-mt-24 grid-cols-3 gap-3.5">
        {THEME_OPTIONS.map((th) => {
          const sel = theme === th.key
          const Icon = th.icon
          return (
            <button
              key={th.key}
              type="button"
              onClick={() => {
                setTheme(th.key)
                applyTheme(th.key)
              }}
              className={cn(
                "overflow-hidden rounded-2xl border-[1.5px] bg-card text-left transition-colors hover:border-brand-300",
                sel ? "border-brand-600 shadow-[0_0_0_3px_var(--brand-50)]" : "border-border shadow-sm",
              )}
            >
              <div className="relative flex h-24 overflow-hidden" style={{ background: th.previewBg }}>
                <div className="flex w-[34%] flex-col gap-[5px] px-[7px] py-2" style={{ background: th.railBg, borderRight: `1px solid ${th.hairline}` }}>
                  <div className="size-3.5 rounded bg-brand-600" />
                  <div className="h-[5px] w-[85%] rounded-full" style={{ background: th.barStrong }} />
                  <div className="h-[5px] w-[70%] rounded-full" style={{ background: th.barSoft }} />
                  <div className="h-[5px] w-[78%] rounded-full" style={{ background: th.barSoft }} />
                </div>
                <div className="flex flex-1 flex-col gap-1.5 px-2.5 py-[9px]">
                  <div className="h-[7px] w-[55%] rounded-full" style={{ background: th.barStrong }} />
                  <div className="h-[5px] w-[88%] rounded-full" style={{ background: th.barSoft }} />
                  <div className="h-[5px] w-[74%] rounded-full" style={{ background: th.barSoft }} />
                  <div className="mt-auto flex gap-[5px]">
                    <div className="h-[22px] flex-1 rounded-md" style={{ background: th.cardBg, border: `1px solid ${th.hairline}` }} />
                    <div className="h-[22px] flex-1 rounded-md" style={{ background: th.cardBg, border: `1px solid ${th.hairline}` }} />
                  </div>
                </div>
                {th.split && <div className="absolute inset-0" style={{ background: "linear-gradient(105deg, transparent 49.8%, #0f172a 50.2%)" }} />}
              </div>
              <div className="flex items-center gap-2 border-t px-3.5 py-[11px]">
                <Icon className={cn("size-[15px]", sel ? "text-brand-700" : "text-foreground")} />
                <span className={cn("text-[13px] font-semibold", sel ? "text-brand-700" : "text-foreground")}>{i18n._(th.label)}</span>
                <span className={cn("ml-auto grid size-[18px] place-items-center rounded-full", sel ? "bg-brand-600 text-white" : "bg-muted")}>
                  {sel && <Check className="size-[11px]" />}
                </span>
              </div>
            </button>
          )
        })}
      </div>
      <div className={CARD}>
        <SettingRow
          anchorId={SETTINGS_ANCHORS.interface}
          title={<Trans>Interface</Trans>}
          subtitle={<Trans>Switch between the new and the classic ADT Studio interface.</Trans>}
        >
          <SegmentedControl
            className="w-52"
            options={[
              { value: "new", label: t`New` },
              { value: "old", label: t`Classic` },
            ]}
            value={uiVersion}
            onValueChange={(version) => {
              setUiVersion(version)
              if (version === "old") {
                void navigate({ to: "/settings", search: { section: "default-model" } })
              }
            }}
          />
        </SettingRow>
        <SettingRow
          anchorId={SETTINGS_ANCHORS.reduceMotion}
          title={<Trans>Reduce motion</Trans>}
          subtitle={<Trans>Minimise onboarding and list-reorder animations.</Trans>}
        >
          <Switch checked={motion} onCheckedChange={setMotion} />
        </SettingRow>
      </div>
    </>
  )
}
