import { z } from "zod"
import type { LocalizedText, ProviderManifest } from "@adt/types"
import type { ProviderModule } from "../../ports/index.js"
import { ModelDiscoveryError } from "../../model-discovery.js"
import { ANTHROPIC_ORIGIN, listAnthropicModels } from "../shared/anthropic-rest/models.js"
import { LABEL_API_KEY } from "../shared/i18n.js"
import { checkClaudeAgentConnection } from "./connection.js"
import {
  createClaudeAgentStructuredTextBackend,
  type ClaudeAgentCredentials,
} from "./structured-text.js"

export const CLAUDE_AGENT_PROVIDER_ID = "claude-agent"
const ADAPTER_VERSION = "claude-agent-1"

const credentialSchema = z
  .object({ apiKey: z.string().max(400).optional() })
  .transform((values): ClaudeAgentCredentials => {
    const apiKey = values.apiKey?.trim()
    return apiKey ? { apiKey } : {}
  })

const HELP_API_KEY: LocalizedText = {
  en: "Optional. Leave empty to use the Claude Code login already on this machine. When filled, requests are billed to this Anthropic API key instead.",
  "pt-BR":
    "Opcional. Deixe vazio para usar o login do Claude Code já existente nesta máquina. Se preenchida, as requisições são cobradas nesta chave de API da Anthropic.",
  es: "Opcional. Déjelo vacío para usar el inicio de sesión de Claude Code ya presente en este equipo. Si se rellena, las solicitudes se facturan a esta clave de API de Anthropic.",
  fr: "Facultatif. Laissez vide pour utiliser la session Claude Code déjà présente sur cette machine. Si renseignée, les requêtes sont facturées sur cette clé d'API Anthropic.",
  sq: "Opsionale. Lëreni bosh për të përdorur hyrjen e Claude Code që ndodhet në këtë makinë. Kur plotësohet, kërkesat faturohen në këtë kyç API të Anthropic.",
}

const LOCALIZED_HELP: LocalizedText = {
  en: "Runs prompts through the Claude Agent SDK on this machine instead of calling the Anthropic API directly, reusing the Claude Code login when no API key is set. Tools, session files and local settings are disabled so results stay reproducible.",
  "pt-BR":
    "Executa os prompts pelo Claude Agent SDK nesta máquina em vez de chamar a API da Anthropic diretamente, reaproveitando o login do Claude Code quando nenhuma chave de API é informada. Ferramentas, arquivos de sessão e configurações locais ficam desativados para manter os resultados reproduzíveis.",
  es: "Ejecuta los prompts mediante el Claude Agent SDK en este equipo en lugar de llamar directamente a la API de Anthropic, reutilizando el inicio de sesión de Claude Code cuando no hay clave de API. Las herramientas, los archivos de sesión y la configuración local están desactivados para mantener resultados reproducibles.",
  fr: "Exécute les prompts via le Claude Agent SDK sur cette machine au lieu d'appeler directement l'API Anthropic, en réutilisant la session Claude Code lorsqu'aucune clé d'API n'est définie. Les outils, les fichiers de session et les réglages locaux sont désactivés afin que les résultats restent reproductibles.",
  sq: "Ekzekuton promptet përmes Claude Agent SDK në këtë makinë në vend që të thërrasë drejtpërdrejt API-n e Anthropic, duke ripërdorur hyrjen e Claude Code kur nuk është caktuar kyç API. Veglat, skedarët e sesionit dhe cilësimet lokale janë të çaktivizuara për t'i mbajtur rezultatet të riprodhueshme.",
}

export const claudeAgentManifest: ProviderManifest = {
  id: CLAUDE_AGENT_PROVIDER_ID,
  displayName: "Claude Agent",
  modalities: ["structured-text"],
  credentialFields: [
    {
      key: "apiKey",
      kind: "secret",
      label: LABEL_API_KEY,
      required: false,
      header: "X-ADT-Provider-Claude-Agent-Key",
      legacyHeaders: [],
      storageKey: "adt-studio-claude-agent-key",
      legacyStorageKeys: [],
      placeholder: "sk-ant-...",
      help: HELP_API_KEY,
    },
  ],
  capabilities: {
    "structured-text": {
      // The CLI's `json_schema` output format has no `$ref` support, so
      // recursive schemas fall back to a schema-in-the-prompt round.
      strategies: ["native-schema", "parse-repair"],
      recursiveSchemas: false,
      imageInput: true,
      temperature: false,
    },
  },
  defaultModels: {
    "structured-text": "claude-sonnet-4-5",
  },
  localizedHelp: LOCALIZED_HELP,
  docsUrl: "https://code.claude.com/docs/en/agent-sdk/overview",
}

export const claudeAgentProvider: ProviderModule<ClaudeAgentCredentials> = {
  manifest: claudeAgentManifest,
  credentialSchema,

  resolveServerCredentials: () => ({
    apiKey: process.env.CLAUDE_AGENT_API_KEY ?? process.env.ANTHROPIC_API_KEY,
  }),

  cacheFingerprint: () => ({
    adapterVersion: ADAPTER_VERSION,
    origin: ANTHROPIC_ORIGIN,
  }),

  /** The CLI login is not an API credential, so discovery only works with a key. */
  listModels: (context) => {
    const apiKey = context.credentials.apiKey
    if (!apiKey) {
      return Promise.reject(
        new ModelDiscoveryError(
          "missing-credential",
          "Model discovery needs an Anthropic API key; the Claude Code login cannot list models",
        ),
      )
    }
    return listAnthropicModels({ apiKey, signal: context.signal })
  },

  checkConnection: (context) => checkClaudeAgentConnection(context),

  createStructuredTextBackend: (context) =>
    createClaudeAgentStructuredTextBackend(context),
}
