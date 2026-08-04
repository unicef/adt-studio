import { useMemo } from "react"
import { Trans, useLingui } from "@lingui/react/macro"
import { msg } from "@lingui/core/macro"
import { Sparkles, Server, AudioLines, Check, Minus, ShieldCheck, Pencil, Plus } from "lucide-react"
import { useApiKey } from "@/hooks/use-api-key"
import { useSettingsDialog } from "@/routes/__root"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { HEADING, LEAD } from "./ui"

function mask(key: string): string {
  if (!key) return ""
  const tail = key.slice(-4)
  const head = key.startsWith("sk-ant") ? "sk-ant-" : key.startsWith("sk-") ? "sk-" : ""
  return `${head}••••${tail}`
}

export function ProvidersSection() {
  const { i18n } = useLingui()
  const { openSettings } = useSettingsDialog()
  const { apiKey, anthropicKey, googleKey, customApiKey, customBaseUrl, azureKey } = useApiKey()

  const providers = useMemo(
    () => [
      { name: "OpenAI", icon: Sparkles, desc: msg`GPT models for pipeline tasks.`, key: apiKey, tile: "bg-emerald-50 text-emerald-600" },
      { name: "Anthropic", icon: Sparkles, desc: msg`Claude models — Opus, Sonnet.`, key: anthropicKey, tile: "bg-amber-50 text-amber-600" },
      { name: "Google AI", icon: Sparkles, desc: msg`Gemini — LLM and TTS voices.`, key: googleKey, tile: "bg-blue-50 text-blue-600" },
      { name: "Custom (OpenAI-compatible)", icon: Server, desc: msg`Ollama, vLLM, Together AI — any compatible endpoint.`, key: customApiKey || customBaseUrl, tile: "bg-muted text-muted-foreground" },
      { name: "Azure Speech", icon: AudioLines, desc: msg`Azure TTS voices · subscription key + region.`, key: azureKey, tile: "bg-indigo-50 text-indigo-600" },
    ],
    [apiKey, anthropicKey, googleKey, customApiKey, customBaseUrl, azureKey],
  )

  return (
    <>
      <div className={HEADING}>
        <Trans>AI providers</Trans>
      </div>
      <div className={LEAD}>
        <Trans>API keys for the AI pipeline. Keys are stored locally on this machine and never leave it except to call the provider.</Trans>
      </div>
      <div className="flex flex-col gap-2.5">
        {providers.map((pr) => {
          const Icon = pr.icon
          const connected = !!pr.key
          return (
            <div key={pr.name} className="flex items-center gap-3.5 rounded-xl border bg-card px-[18px] py-[15px] shadow-sm">
              <div className={cn("grid size-10 shrink-0 place-items-center rounded-[11px]", pr.tile)}>
                <Icon className="size-[19px]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{pr.name}</span>
                  <Badge variant={connected ? "success" : "secondary"} className="gap-1 px-2 text-[10.5px]">
                    {connected ? <Check className="size-3" /> : <Minus className="size-3" />}
                    {connected ? <Trans>Connected</Trans> : <Trans>Not set</Trans>}
                  </Badge>
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{i18n._(pr.desc)}</div>
              </div>
              {connected && <span className="font-mono text-[12.5px] text-muted-foreground">{mask(pr.key)}</span>}
              <Button variant="outline" size="sm" onClick={() => openSettings()}>
                {connected ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />}
                {connected ? <Trans>Update</Trans> : <Trans>Add key</Trans>}
              </Button>
            </div>
          )
        })}
      </div>
      <div className="mt-3.5 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-emerald-600" />
        <Trans>Keys are kept in this machine's local storage. Custom uses any OpenAI-compatible endpoint; Azure powers Speech TTS.</Trans>
      </div>
    </>
  )
}
