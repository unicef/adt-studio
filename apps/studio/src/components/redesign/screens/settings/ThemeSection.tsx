import { useState } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { Check, Sun, Moon, Monitor } from "lucide-react"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { CARD, HEADING, LEAD, SettingRow } from "./ui"

type ThemeMode = "light" | "dark" | "system"
const THEME_KEY = "adt.theme"

const THEMES = [
  { key: "light" as const, label: msg`Light`, icon: Sun, previewBg: "#fafafa", railBg: "#f4f5f7", hairline: "#e4e4e7", barStrong: "#a1a1aa", barSoft: "#d4d4d8", cardBg: "#ffffff", split: false },
  { key: "dark" as const, label: msg`Dark`, icon: Moon, previewBg: "#0f172a", railBg: "#1e293b", hairline: "#334155", barStrong: "#64748b", barSoft: "#334155", cardBg: "#1e293b", split: false },
  { key: "system" as const, label: msg`System`, icon: Monitor, previewBg: "#fafafa", railBg: "#f4f5f7", hairline: "#e4e4e7", barStrong: "#a1a1aa", barSoft: "#d4d4d8", cardBg: "#ffffff", split: true },
]

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
  const { i18n } = useLingui()
  const [theme, setTheme] = useState<ThemeMode>(storedTheme)
  const [motion, setMotion] = useState(false)

  return (
    <>
      <div className={HEADING}>
        <Trans>Theme</Trans>
      </div>
      <div className={LEAD}>
        <Trans>How ADT Studio looks on this machine.</Trans>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-3.5">
        {THEMES.map((th) => {
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
        <SettingRow title={<Trans>Reduce motion</Trans>} subtitle={<Trans>Minimise onboarding and list-reorder animations.</Trans>}>
          <Switch checked={motion} onCheckedChange={setMotion} />
        </SettingRow>
      </div>
    </>
  )
}
