import { z } from "zod"
import type { LocalizedText, ProviderManifest } from "@adt/types"
import type { ProviderModule } from "../../ports/index.js"
import { LABEL_API_KEY } from "../shared/i18n.js"
import { checkCodexConnection } from "./connection.js"
import { codexCliLogin } from "./login.js"
import { listCodexModels } from "./models.js"
import { createCodexStructuredTextBackend, type CodexCredentials } from "./structured-text.js"

export const CODEX_PROVIDER_ID = "codex"
const ADAPTER_VERSION = "codex-1"
const CODEX_ORIGIN = "local://codex-cli"

const credentialSchema = z
  .object({ apiKey: z.string().max(400).optional() })
  .transform((values): CodexCredentials => {
    const apiKey = values.apiKey?.trim()
    return apiKey ? { apiKey } : {}
  })

const HELP_API_KEY: LocalizedText = {
  en: "Optional. Leave empty to use the Codex CLI login already on this machine. When filled, requests are billed to this OpenAI API key instead.",
  "pt-BR":
    "Opcional. Deixe vazio para usar o login do Codex CLI já existente nesta máquina. Se preenchida, as requisições são cobradas nesta chave de API da OpenAI.",
  es: "Opcional. Déjelo vacío para usar el inicio de sesión del Codex CLI ya presente en este equipo. Si se rellena, las solicitudes se facturan a esta clave de API de OpenAI.",
  fr: "Facultatif. Laissez vide pour utiliser la session Codex CLI déjà présente sur cette machine. Si renseignée, les requêtes sont facturées sur cette clé d'API OpenAI.",
  sq: "Opsionale. Lëreni bosh për të përdorur hyrjen e Codex CLI që ndodhet në këtë makinë. Kur plotësohet, kërkesat faturohen në këtë kyç API të OpenAI.",
}

const LOCALIZED_HELP: LocalizedText = {
  en: "Runs prompts through the Codex CLI on this machine, reusing its login when no API key is set. The CLI is found on PATH, in common install locations or inside the ChatGPT desktop app (CODEX_EXECUTABLE overrides); sign in with your ChatGPT account from this screen or with `codex login`. The sandbox is read-only and web search, approvals and the user config are disabled so results stay reproducible.",
  "pt-BR":
    "Executa os prompts pelo Codex CLI desta máquina, reaproveitando o login dele quando nenhuma chave de API é informada. O CLI é localizado no PATH, em locais de instalação comuns ou dentro do aplicativo ChatGPT para desktop (CODEX_EXECUTABLE tem prioridade); entre com sua conta do ChatGPT nesta tela ou com `codex login`. O sandbox é somente leitura e busca na web, aprovações e a configuração do usuário ficam desativados para manter os resultados reproduzíveis.",
  es: "Ejecuta los prompts mediante el Codex CLI de este equipo, reutilizando su inicio de sesión cuando no hay clave de API. El CLI se busca en el PATH, en las ubicaciones de instalación habituales o dentro de la aplicación de escritorio de ChatGPT (CODEX_EXECUTABLE tiene prioridad); inicie sesión con su cuenta de ChatGPT desde esta pantalla o con `codex login`. El sandbox es de solo lectura y la búsqueda web, las aprobaciones y la configuración del usuario están desactivadas para mantener resultados reproducibles.",
  fr: "Exécute les prompts via le CLI Codex de cette machine, en réutilisant sa session lorsqu'aucune clé d'API n'est définie. Le CLI est recherché dans le PATH, dans les emplacements d'installation courants ou dans l'application de bureau ChatGPT (CODEX_EXECUTABLE a la priorité) ; connectez-vous avec votre compte ChatGPT depuis cet écran ou avec `codex login`. Le bac à sable est en lecture seule et la recherche web, les approbations et la configuration utilisateur sont désactivées afin que les résultats restent reproductibles.",
  sq: "Ekzekuton promptet përmes Codex CLI të kësaj makine, duke ripërdorur hyrjen e tij kur nuk është caktuar kyç API. CLI kërkohet në PATH, në vendndodhjet e zakonshme të instalimit ose brenda aplikacionit ChatGPT për desktop (CODEX_EXECUTABLE ka përparësi); hyni me llogarinë tuaj ChatGPT nga ky ekran ose me `codex login`. Sandboxi është vetëm për lexim dhe kërkimi në web, miratimet dhe konfigurimi i përdoruesit janë të çaktivizuara për t'i mbajtur rezultatet të riprodhueshme.",
}

export const codexManifest: ProviderManifest = {
  id: CODEX_PROVIDER_ID,
  displayName: "OpenAI Codex",
  modalities: ["structured-text"],
  credentialFields: [
    {
      key: "apiKey",
      kind: "secret",
      label: LABEL_API_KEY,
      required: false,
      header: "X-ADT-Provider-Codex-Key",
      legacyHeaders: [],
      storageKey: "adt-studio-codex-key",
      legacyStorageKeys: [],
      placeholder: "sk-...",
      help: HELP_API_KEY,
    },
  ],
  capabilities: {
    "structured-text": {
      // `--output-schema` reaches the model as a strict structured-output schema,
      // so recursive schemas fall back to a schema-in-the-prompt round.
      strategies: ["native-schema", "parse-repair"],
      recursiveSchemas: false,
      // The CLI only accepts images as file paths, so the runner writes each
      // inline image to the turn's scratch directory and attaches it with
      // `--image`.
      imageInput: true,
      temperature: false,
    },
  },
  defaultModels: {
    "structured-text": "gpt-5.6-sol",
  },
  minimumRequestTimeoutMs: 600_000,
  localizedHelp: LOCALIZED_HELP,
  docsUrl: "https://developers.openai.com/codex/cli/",
}

export const codexProvider: ProviderModule<CodexCredentials> = {
  manifest: codexManifest,
  credentialSchema,

  /** Never the ambient OPENAI_API_KEY — that key belongs to the direct
   *  `openai` provider, and adopting it here would bill it without opt-in.
   *  Without the dedicated variable the CLI login is the sanctioned fallback. */
  resolveServerCredentials: () => ({
    apiKey: process.env.CODEX_API_KEY,
  }),

  cacheFingerprint: () => ({
    adapterVersion: ADAPTER_VERSION,
    origin: CODEX_ORIGIN,
  }),

  listModels: (context) => listCodexModels(context),

  checkConnection: (context) => checkCodexConnection(context),

  /** Browser sign-in (`codex login`) driven from Studio; the CLI keeps the tokens. */
  cliLogin: codexCliLogin,

  createStructuredTextBackend: (context) => createCodexStructuredTextBackend(context),
}
