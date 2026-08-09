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

/**
 * Provider screen — colorful reference build. Bold brand-gradient icon tiles in a
 * single provider list on the left; selecting an available provider expands its
 * inline key field. A vibrant gradient panel with a floating logo constellation
 * fills the right. Not-yet-wired providers/methods render disabled ("Soon").
 */
export function ProviderSceneColor(_props: OnboardingStepProps) {
  const { t } = useLingui()
  const k = useApiKey()
  const [selectedId, setSelectedId] = useState("openai")
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
          keyUrl: undefined,
          placeholder: "http://localhost:11434/v1",
          value: k.customBaseUrl,
          set: k.setCustomBaseUrl,
        },
      ],
    /* eslint-enable lingui/no-unlocalized-strings */
    [k, t],
  )

  const selected = rows.find((r) => r.id === selectedId) ?? rows[0]
  const isConnected = (r: Row) => (r.value ?? "").trim().length > 0
  const val = (selected.value ?? "").trim()
  const looksValid = val.length > 0 && (!selected.prefix || val.startsWith(selected.prefix))

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text && selected.set) selected.set(text.trim())
    } catch {
      /* clipboard unavailable */
    }
  }

  const constellation = rows.filter((r) => r.id !== "custom")

  return (
    <div className="animate-onboarding-fade-in flex h-full w-full gap-5 px-8 pb-2 pt-6">
      {/* left — provider list */}
      <div className="flex min-w-0 flex-1 flex-col">
        <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-[#0a0a0a]">
          <Trans>Choose your AI provider</Trans>
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-[#737373]">
          <Lock className="h-3.5 w-3.5 text-[#9aa0aa]" />
          <Trans>Keys are stored locally on this device — never sent anywhere else.</Trans>
        </p>

        <div className="mt-3.5 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {rows.map((r) => {
            const isSel = r.id === selectedId && r.enabled
            const connected = isConnected(r)
            return (
              <div key={r.id}>
                <button
                  type="button"
                  disabled={!r.enabled}
                  onClick={() => r.enabled && setSelectedId(r.id)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all duration-200",
                    r.enabled ? "cursor-pointer" : "cursor-not-allowed",
                    isSel
                      ? "border-[#3b82f7]/40 bg-[#f5f8ff] shadow-sm"
                      : "border-black/[0.07] bg-white hover:border-black/15",
                    !r.enabled && "opacity-55",
                  )}
                >
                  <span
                    className={cn(
                      "grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-white shadow-sm",
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
                        <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.05] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9aa0aa]">
                          <Clock className="h-2.5 w-2.5" />
                          <Trans>Soon</Trans>
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-[#737373]">
                      {r.desc}
                    </span>
                  </span>
                  {/* selection indicator */}
                  {r.enabled &&
                    (connected ? (
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#0f9d58]">
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "grid h-5 w-5 shrink-0 place-items-center rounded-full border-2",
                          isSel ? "border-[#3b82f7]" : "border-black/15",
                        )}
                      >
                        {isSel && <span className="h-2 w-2 rounded-full bg-[#3b82f7]" />}
                      </span>
                    ))}
                </button>

                {/* inline key input for the selected provider */}
                {isSel && (
                  <div className="animate-onboarding-fade-in mt-1.5 rounded-2xl border border-black/[0.07] bg-[#fafafb] px-3.5 py-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="color-key" className="text-[12px] font-semibold text-[#0a0a0a]">
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
                        className={cn("h-9 rounded-lg bg-white pr-20", looksValid && "border-[#0f9d58]")}
                      />
                      <div className="absolute right-1 top-0 flex h-9 items-center">
                        <button
                          type="button"
                          onClick={paste}
                          title={t`Paste`}
                          className="grid h-7 w-7 place-items-center rounded-md text-[#9aa0aa] transition-colors hover:text-[#0a0a0a]"
                        >
                          <ClipboardPaste className="h-4 w-4" />
                        </button>
                        {selected.id !== "custom" && (
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={() => setReveal((v) => !v)}
                            className="grid h-7 w-7 place-items-center rounded-md text-[#9aa0aa] transition-colors hover:text-[#0a0a0a]"
                          >
                            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* right — vibrant decorative panel with logo constellation */}
      <div className="relative hidden w-[292px] shrink-0 overflow-hidden rounded-[20px] md:block">
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
          style={{ background: "radial-gradient(closest-side at 70% 78%, rgba(255,255,255,0.28), transparent 70%)" }}
        />
        {/* floating brand logos */}
        {constellation.map((r, i) => {
          const spots = [
            { top: "14%", left: "26%", size: 30, o: 0.9 },
            { top: "24%", left: "70%", size: 26, o: 0.75 },
            { top: "46%", left: "18%", size: 24, o: 0.7 },
            { top: "52%", left: "58%", size: 40, o: 0.95 },
            { top: "70%", left: "34%", size: 28, o: 0.8 },
            { top: "76%", left: "74%", size: 32, o: 0.85 },
          ]
          const s = spots[i % spots.length]
          return (
            <span
              key={r.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-white"
              style={{ top: s.top, left: s.left, opacity: s.o, width: s.size, height: s.size }}
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
            <Trans>Bring any provider — swap or add more anytime.</Trans>
          </div>
        </div>
      </div>
    </div>
  )
}
