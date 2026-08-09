import { useMemo, useState } from "react"
import { Eye, EyeOff, Check, Lock, ClipboardPaste, ChevronDown, ExternalLink, AlertTriangle } from "lucide-react"
import { Trans, useLingui } from "@lingui/react/macro"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { useApiKey } from "@/hooks/use-api-key"
import type { OnboardingStepProps } from "../steps"

type Llm = {
  id: string
  name: string
  desc: string
  letter: string
  tint: string
  tone: string
  prefix: string
  keyUrl: string
  value: string
  set: (v: string) => void
  recommended?: boolean
}

/**
 * Provider screen — Variant A ("guided"). Leads with the primary language-model
 * providers as selectable cards; selecting one reveals an inline key field with
 * paste, reveal, a "get a key" link and live format feedback. Self-hosted and
 * speech providers are tucked behind a disclosure. No modal.
 */
export function ProviderSceneGuided(_props: OnboardingStepProps) {
  const { t } = useLingui()
  const k = useApiKey()
  const [selected, setSelected] = useState<string>("openai")
  const [reveal, setReveal] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const llms = useMemo<Llm[]>(
    () => [
      {
        id: "openai",
        name: "OpenAI",
        desc: t`GPT-5, GPT-4o`,
        letter: "O",
        tint: "#e9f9f1",
        tone: "#059669",
        prefix: "sk-",
        keyUrl: "https://platform.openai.com/api-keys",
        value: k.apiKey,
        set: k.setApiKey,
        recommended: true,
      },
      {
        id: "anthropic",
        name: "Anthropic",
        desc: t`Claude Opus & Sonnet`,
        letter: "A",
        tint: "#fdf1e3",
        tone: "#c2620a",
        prefix: "sk-ant",
        keyUrl: "https://console.anthropic.com/settings/keys",
        value: k.anthropicKey,
        set: k.setAnthropicKey,
      },
      {
        id: "google",
        name: "Google AI",
        desc: t`Gemini + TTS voices`,
        letter: "G",
        tint: "#e8f0fe",
        tone: "#1a73e8",
        // eslint-disable-next-line lingui/no-unlocalized-strings -- API key prefix, not UI copy
        prefix: "AIza",
        keyUrl: "https://aistudio.google.com/app/apikey",
        value: k.googleKey,
        set: (v) => {
          k.setGoogleKey(v)
          k.setGeminiKey(v)
        },
      },
    ],
    [k, t],
  )

  const active = llms.find((p) => p.id === selected) ?? llms[0]
  const connectedCount = llms.filter((p) => p.value.trim().length > 0).length
  const val = active.value.trim()
  const looksValid = val.length > 0 && val.startsWith(active.prefix)
  const looksWrong = val.length > 0 && !val.startsWith(active.prefix)

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (text) active.set(text.trim())
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="animate-onboarding-fade-in flex h-full w-full flex-col items-center px-10 pt-6">
      <h2 className="text-[23px] font-semibold tracking-[-0.02em] text-[#0a0a0a]">
        <Trans>Choose your AI provider</Trans>
      </h2>
      <p className="mt-1.5 flex items-center gap-1.5 text-[13px] leading-relaxed text-[#737373]">
        <Lock className="h-3.5 w-3.5 text-[#9aa0aa]" />
        <Trans>Your key is stored locally on this device — never sent anywhere else.</Trans>
      </p>

      {/* primary language-model cards */}
      <div className="mt-5 grid w-full max-w-[620px] grid-cols-3 gap-2.5">
        {llms.map((p) => {
          const isSel = p.id === selected
          const connected = p.value.trim().length > 0
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p.id)}
              className={cn(
                "group relative flex flex-col items-start gap-2 rounded-2xl border bg-white p-3 text-left transition-all duration-200 cursor-pointer",
                isSel
                  ? "border-[#3b82f7] shadow-[0_0_0_3px_rgba(59,130,247,0.15)]"
                  : "border-black/[0.08] hover:border-black/20",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-[13px] font-bold"
                  style={{ backgroundColor: p.tint, color: p.tone }}
                >
                  {p.letter}
                </span>
                {connected && (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-[#e9f7ef]">
                    <Check className="h-3 w-3 text-[#0f9d58]" strokeWidth={3} />
                  </span>
                )}
              </div>
              <div className="text-[14px] font-semibold text-[#0a0a0a]">{p.name}</div>
              <div className="text-[11.5px] leading-tight text-[#737373]">{p.desc}</div>
              {p.recommended && (
                <span className="absolute -top-2 right-3 rounded-full bg-[#3b82f7] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  <Trans>Recommended</Trans>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* inline key panel for the selected provider */}
      <div className="mt-3 w-full max-w-[620px] rounded-2xl border border-black/[0.08] bg-[#fafafa] p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="guided-key" className="text-[12.5px] font-semibold text-[#0a0a0a]">
            {active.name} <Trans>API key</Trans>
          </label>
          <a
            href={active.keyUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-[#3b82f7] hover:underline"
          >
            <Trans>Get a key</Trans>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <div className="relative">
          <Input
            id="guided-key"
            type={reveal ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder={active.prefix + "…"}
            value={active.value}
            onChange={(e) => active.set(e.target.value)}
            className={cn("h-10 rounded-lg bg-white pr-20", looksValid && "border-[#0f9d58]")}
          />
          <div className="absolute right-1 top-0 flex h-10 items-center">
            <button
              type="button"
              onClick={paste}
              className="grid h-8 w-8 place-items-center rounded-md text-[#9aa0aa] transition-colors hover:text-[#0a0a0a]"
              title={t`Paste`}
            >
              <ClipboardPaste className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              tabIndex={-1}
              className="grid h-8 w-8 place-items-center rounded-md text-[#9aa0aa] transition-colors hover:text-[#0a0a0a]"
            >
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="mt-2 flex min-h-[18px] items-center text-[12px]">
          {looksValid ? (
            <span className="flex items-center gap-1.5 font-medium text-[#0f9d58]">
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
              <Trans>Connected — key saved</Trans>
            </span>
          ) : looksWrong ? (
            <span className="flex items-center gap-1.5 font-medium text-[#c2620a]">
              <AlertTriangle className="h-3.5 w-3.5" />
              <Trans>This doesn't look like a {active.name} key</Trans>
            </span>
          ) : (
            <span className="text-[#9aa0aa]">
              <Trans>Paste your key to connect this provider.</Trans>
            </span>
          )}
        </div>
      </div>

      {/* advanced: self-hosted + speech */}
      <div className="mt-3 w-full max-w-[620px]">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#5a5f68] transition-colors hover:text-[#0a0a0a]"
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform duration-200", showAdvanced && "rotate-180")}
          />
          <Trans>More options — self-hosted & Azure Speech</Trans>
        </button>
        {showAdvanced && (
          <div className="animate-onboarding-fade-in mt-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-black/[0.08] bg-white p-2.5">
              <div className="text-[12.5px] font-semibold text-[#0a0a0a]">
                <Trans>Custom (OpenAI-compatible)</Trans>
              </div>
              <Input
                placeholder="http://localhost:11434/v1"
                value={k.customBaseUrl}
                onChange={(e) => k.setCustomBaseUrl(e.target.value)}
                className="mt-1.5 h-8 rounded-md text-[12px]"
              />
            </div>
            <div className="rounded-xl border border-black/[0.08] bg-white p-2.5">
              <div className="text-[12.5px] font-semibold text-[#0a0a0a]">
                <Trans>Azure Speech</Trans>
              </div>
              <Input
                placeholder={t`Subscription key`}
                type="password"
                value={k.azureKey}
                onChange={(e) => k.setAzureKey(e.target.value)}
                className="mt-1.5 h-8 rounded-md text-[12px]"
              />
            </div>
          </div>
        )}
      </div>

      <p className="mt-auto pb-1 pt-3 text-[12px] text-[#9aa0aa]">
        {connectedCount > 0 ? (
          <Trans>{connectedCount} connected — you can add more anytime in Settings.</Trans>
        ) : (
          <Trans>Not required to continue — you can add a provider later in Settings.</Trans>
        )}
      </p>
    </div>
  )
}
