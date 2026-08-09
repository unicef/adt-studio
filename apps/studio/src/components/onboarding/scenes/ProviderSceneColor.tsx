import { useMemo, useState, type ComponentType } from "react"
import {
  Eye,
  EyeOff,
  Check,
  Lock,
  ExternalLink,
  ClipboardPaste,
  Terminal,
  Blocks,
  Waves,
  KeyRound,
  Clock,
  ArrowRight,
} from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { useApiKey } from "@/hooks/use-api-key"
import type { OnboardingStepProps } from "../steps"

/* --- brand marks (inline SVG, dependency-free) --- */

function OpenAiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7451-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
    </svg>
  )
}

function AnthropicMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.541Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
    </svg>
  )
}

function GeminiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 24A14.304 14.304 0 0 0 0 12 14.304 14.304 0 0 0 12 0a14.305 14.305 0 0 0 12 12 14.305 14.305 0 0 0-12 12" />
    </svg>
  )
}

/* --- model --- */

type Row = {
  id: string
  name: string
  desc: string
  from: string
  to: string
  Mark: ComponentType<{ className?: string }>
  enabled: boolean
  keyUrl?: string
  prefix?: string
  placeholder?: string
  value?: string
  set?: (v: string) => void
}

const LIST_W = 536
const RAIL_W = 214

/**
 * Provider screen — colorful list that morphs into a rail once you pick a
 * provider. Empty state: full-width brand-gradient list + a vibrant gradient
 * "constellation" sidebar. On select, the list animates down to a compact icon
 * rail and the sidebar crossfades into the key-entry panel (A → A2), giving the
 * inputs room. Not-yet-wired rows (Codex, Claude SDK, DeepSeek) stay disabled.
 */
export function ProviderSceneColor({ onSkip }: OnboardingStepProps) {
  const { t } = useLingui()
  const k = useApiKey()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reveal, setReveal] = useState(false)

  const rows = useMemo<Row[]>(
    () =>
      /* eslint-disable lingui/no-unlocalized-strings -- brand/product names, key prefixes/placeholders, URLs are not translated */
      [
        {
          id: "openai",
          name: "OpenAI",
          desc: t`GPT-5, GPT-4o & the Responses API.`,
          from: "#10B981",
          to: "#0D8F6F",
          Mark: OpenAiMark,
          enabled: true,
          keyUrl: "https://platform.openai.com/api-keys",
          prefix: "sk-",
          placeholder: "sk-...",
          value: k.apiKey,
          set: k.setApiKey,
        },
        {
          id: "codex",
          name: "OpenAI Codex",
          desc: t`Reuse your ChatGPT Plus or Pro plan.`,
          from: "#34D399",
          to: "#10A37F",
          Mark: Terminal,
          enabled: false,
        },
        {
          id: "anthropic",
          name: "Anthropic",
          desc: t`Claude Opus & Sonnet via API.`,
          from: "#E08A5F",
          to: "#C2410C",
          Mark: AnthropicMark,
          enabled: true,
          keyUrl: "https://console.anthropic.com/settings/keys",
          prefix: "sk-ant",
          placeholder: "sk-ant-...",
          value: k.anthropicKey,
          set: k.setAnthropicKey,
        },
        {
          id: "claude-sdk",
          name: "Claude SDK",
          desc: t`Reuse your Claude Pro or Max plan.`,
          from: "#F0A87A",
          to: "#D97757",
          Mark: Blocks,
          enabled: false,
        },
        {
          id: "gemini",
          name: "Google Gemini",
          desc: t`Gemini models + TTS voices.`,
          from: "#4285F4",
          to: "#9B4FD0",
          Mark: GeminiMark,
          enabled: true,
          keyUrl: "https://aistudio.google.com/app/apikey",
          prefix: "AIza",
          placeholder: "AIza...",
          value: k.googleKey,
          set: (v) => {
            k.setGoogleKey(v)
            k.setGeminiKey(v)
          },
        },
        {
          id: "deepseek",
          name: "DeepSeek",
          desc: t`DeepSeek-V3 & R1 reasoning.`,
          from: "#5B7BFF",
          to: "#4D6BFE",
          Mark: Waves,
          enabled: false,
        },
        {
          id: "custom",
          name: "Custom (OpenAI-compatible)",
          desc: t`Ollama, vLLM, Together — any endpoint.`,
          from: "#8B5CF6",
          to: "#6D28D9",
          Mark: KeyRound,
          enabled: true,
          placeholder: "http://localhost:11434/v1",
          value: k.customBaseUrl,
          set: k.setCustomBaseUrl,
        },
      ],
    /* eslint-enable lingui/no-unlocalized-strings */
    [k, t],
  )

  const railMode = selectedId !== null
  const selected = rows.find((r) => r.id === selectedId) ?? null
  const isConnected = (r: Row) => (r.value ?? "").trim().length > 0
  const val = (selected?.value ?? "").trim()
  const looksValid = val.length > 0 && (!selected?.prefix || val.startsWith(selected.prefix))

  const select = (r: Row) => {
    if (!r.enabled) return
    setReveal(false)
    setSelectedId(r.id)
  }

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && selected?.set) selected.set(text.trim())
    } catch {
      /* clipboard unavailable */
    }
  }

  const constellation = rows.filter((r) => r.id !== "custom")

  return (
    <div className="animate-onboarding-fade-in flex h-full w-full flex-col px-8 pb-2 pt-5">
      {/* header */}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-[21px] font-semibold tracking-[-0.02em] text-[#0a0a0a]">
            <Trans>Choose your AI provider</Trans>
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[#737373]">
            <Lock className="h-3.5 w-3.5 text-[#9aa0aa]" />
            <Trans>Keys are stored locally on this device — never sent anywhere else.</Trans>
          </p>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="shrink-0 rounded-lg px-3 py-1.5 text-[12.5px] font-medium text-[#9aa0aa] transition-colors hover:text-[#0a0a0a] cursor-pointer"
        >
          <Trans>Skip for now</Trans>
        </button>
      </div>

      {/* morphing body */}
      <div className="mt-3.5 flex min-h-0 flex-1 gap-4">
        {/* left — list that collapses to a rail */}
        <div
          style={{ width: railMode ? RAIL_W : LIST_W }}
          className="flex min-h-0 shrink-0 flex-col transition-[width] duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        >
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
            {rows.map((r) => {
              const sel = r.id === selectedId && r.enabled
              const connected = isConnected(r)
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={!r.enabled}
                  onClick={() => select(r)}
                  style={sel ? { boxShadow: `inset 3px 0 0 0 ${r.to}` } : undefined}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all duration-300",
                    r.enabled ? "cursor-pointer" : "cursor-not-allowed opacity-55",
                    sel
                      ? "border-transparent bg-[#f5f7ff]"
                      : "border-black/[0.07] bg-white hover:border-black/15",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-white shadow-sm transition-all duration-300",
                      !r.enabled && "grayscale",
                    )}
                    style={{ backgroundImage: `linear-gradient(135deg, ${r.from}, ${r.to})` }}
                  >
                    <r.Mark className="h-[21px] w-[21px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-[#0a0a0a]">
                        {r.name}
                      </span>
                      {!r.enabled && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9aa0aa]">
                          <Clock className="h-2.5 w-2.5" />
                          <Trans>Soon</Trans>
                        </span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "block overflow-hidden truncate text-[12px] text-[#737373] transition-all duration-[320ms]",
                        railMode ? "max-h-0 opacity-0" : "mt-0.5 max-h-5 opacity-100",
                      )}
                    >
                      {r.desc}
                    </span>
                  </span>
                  {/* selection / status indicator */}
                  {connected ? (
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0f9d58]">
                      <Check className="h-3 w-3 text-white" strokeWidth={3} />
                    </span>
                  ) : (
                    r.enabled && (
                      <span
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 transition-all duration-300",
                          railMode ? "scale-0 opacity-0" : "scale-100 opacity-100",
                          sel ? "border-[#3b82f7]" : "border-black/15",
                        )}
                      >
                        {sel && <span className="h-2 w-2 rounded-full bg-[#3b82f7]" />}
                      </span>
                    )
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* right — gradient sidebar (empty) morphs to key-entry panel (selected) */}
        <div className="relative min-w-0 flex-1">
          {/* empty-state gradient constellation */}
          <div
            className={cn(
              "absolute inset-0 overflow-hidden rounded-[20px] transition-all duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              railMode ? "pointer-events-none scale-[0.98] opacity-0" : "opacity-100",
            )}
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(120% 90% at 20% 12%, #a7f3e4 0%, #38bdf8 34%, #3b82f7 62%, #7c3aed 100%)",
              }}
            />
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(closest-side at 70% 78%, rgba(255,255,255,0.28), transparent 70%)",
              }}
            />
            {constellation.map((r, i) => {
              const spots = [
                { top: "15%", left: "24%", size: 32, o: 0.9 },
                { top: "26%", left: "72%", size: 26, o: 0.72 },
                { top: "47%", left: "16%", size: 24, o: 0.68 },
                { top: "53%", left: "56%", size: 42, o: 0.95 },
                { top: "72%", left: "32%", size: 28, o: 0.8 },
                { top: "78%", left: "76%", size: 32, o: 0.85 },
              ]
              const s = spots[i % spots.length]
              return (
                <span
                  key={r.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2 text-white"
                  style={{ top: s.top, left: s.left, width: s.size, height: s.size, opacity: s.o }}
                >
                  <r.Mark className="h-full w-full drop-shadow-sm" />
                  <span className="sr-only">{r.name}</span>
                </span>
              )
            })}
            <div className="absolute inset-x-0 bottom-0 p-5">
              <div className="text-[15px] font-semibold leading-snug text-white drop-shadow">
                <Trans>Your AI, your keys.</Trans>
              </div>
              <div className="mt-1 text-[12px] leading-snug text-white/80">
                <Trans>Pick a provider to connect — swap or add more anytime.</Trans>
              </div>
            </div>
          </div>

          {/* selected-state key panel */}
          <div
            className={cn(
              "absolute inset-0 flex flex-col rounded-2xl border border-black/[0.08] bg-[#fbfbfc] p-5 transition-all duration-[520ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
              railMode ? "opacity-100 delay-100" : "pointer-events-none translate-x-2 opacity-0",
            )}
          >
            {selected && (
              <>
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] text-white shadow-sm"
                    style={{ backgroundImage: `linear-gradient(135deg, ${selected.from}, ${selected.to})` }}
                  >
                    <selected.Mark className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold text-[#0a0a0a]">{selected.name}</div>
                    <div className="truncate text-[12.5px] text-[#737373]">{selected.desc}</div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="color-key" className="text-[12.5px] font-semibold text-[#0a0a0a]">
                      {selected.id === "custom" ? (
                        <Trans>Base URL</Trans>
                      ) : (
                        <>
                          {selected.name} <Trans>API key</Trans>
                        </>
                      )}
                    </label>
                    {selected.keyUrl && (
                      <a
                        href={selected.keyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[12px] font-medium text-[#3b82f7] hover:underline"
                      >
                        <Trans>Get a key</Trans>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="color-key"
                      type={selected.id !== "custom" && !reveal ? "password" : "text"}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={selected.placeholder}
                      value={selected.value ?? ""}
                      onChange={(e) => selected.set?.(e.target.value)}
                      className={cn("h-10 rounded-lg bg-white pr-20", looksValid && "border-[#0f9d58]")}
                    />
                    <div className="absolute right-1 top-0 flex h-10 items-center">
                      <button
                        type="button"
                        onClick={paste}
                        title={t`Paste`}
                        className="grid h-8 w-8 place-items-center rounded-md text-[#9aa0aa] transition-colors hover:text-[#0a0a0a]"
                      >
                        <ClipboardPaste className="h-4 w-4" />
                      </button>
                      {selected.id !== "custom" && (
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => setReveal((v) => !v)}
                          className="grid h-8 w-8 place-items-center rounded-md text-[#9aa0aa] transition-colors hover:text-[#0a0a0a]"
                        >
                          {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex min-h-[18px] items-center text-[12px]">
                    {looksValid ? (
                      <span className="flex items-center gap-1.5 font-medium text-[#0f9d58]">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        <Trans>Connected — key saved</Trans>
                      </span>
                    ) : (
                      <span className="text-[#9aa0aa]">
                        <Trans>Paste your key to connect this provider.</Trans>
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="mt-auto inline-flex w-fit items-center gap-1 text-[12px] font-medium text-[#9aa0aa] transition-colors hover:text-[#0a0a0a] cursor-pointer"
                >
                  <ArrowRight className="h-3.5 w-3.5 rotate-180" />
                  <Trans>Back to all providers</Trans>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
