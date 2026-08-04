import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { ProviderManifest } from "@adt/types"
import { claudeAgentManifest, claudeAgentProvider } from "../providers/claude-agent/index.js"
import { createClaudeAgentStructuredTextBackend } from "../providers/claude-agent/structured-text.js"
import {
  detectImageMediaType,
  toJsonSchema,
  toPromptBlocks,
} from "../providers/claude-agent/request.js"
import { listClaudeAgentModels } from "../providers/claude-agent/models.js"
import type {
  ClaudeAgentMessage,
  ClaudeAgentModelInfo,
  ClaudeAgentQuery,
  ClaudeAgentQueryOptions,
  ClaudeAgentResultMessage,
} from "../providers/claude-agent/sdk.js"
import type { BackendContext, StructuredTextRequest } from "../ports/index.js"
import {
  isProviderConfiguredOnServer,
  validateProviderCredentials,
} from "../credentials.js"
import type { Message } from "../types.js"

const context: BackendContext<{ apiKey?: string }> = {
  providerId: "claude-agent",
  modelId: "claude-sonnet-4-5",
  modality: "structured-text",
  credentials: { apiKey: "sk-ant-secret" },
}

const schema = z.object({ title: z.string(), pages: z.number() })

function makeRequest(
  overrides: Partial<StructuredTextRequest> = {},
): StructuredTextRequest {
  return {
    messages: [{ role: "user", content: "Summarize the book" }],
    schema,
    strategy: "native-schema",
    ...overrides,
  }
}

interface FakeQuery {
  query: ClaudeAgentQuery
  calls: ClaudeAgentQueryOptions[]
}

function fakeQuery(...messages: ClaudeAgentMessage[]): FakeQuery {
  const calls: ClaudeAgentQueryOptions[] = []
  const query: ClaudeAgentQuery = ({ options }) => {
    if (options) calls.push(options)
    return (async function* () {
      yield* messages
    })()
  }
  return { query, calls }
}

function successResult(
  overrides: Partial<ClaudeAgentResultMessage> = {},
): ClaudeAgentResultMessage {
  return {
    type: "result",
    subtype: "success",
    result: '{"title":"Atlas","pages":12}',
    structured_output: { title: "Atlas", pages: 12 },
    usage: { input_tokens: 10, output_tokens: 4 },
    ...overrides,
  }
}

function backendWith(fake: FakeQuery) {
  return createClaudeAgentStructuredTextBackend(context, {
    loadQuery: () => Promise.resolve(fake.query),
    scratchDir: "/tmp/adt-claude-agent-test",
  })
}

describe("claude-agent manifest", () => {
  it("is Zod-valid and namespaces its credential header", () => {
    expect(() => ProviderManifest.parse(claudeAgentManifest)).not.toThrow()
    expect(claudeAgentManifest.credentialFields[0]?.header).toBe(
      "X-ADT-Provider-Claude-Agent-Key",
    )
  })

  it("declares a factory for every modality it advertises", () => {
    expect(claudeAgentManifest.modalities).toEqual(["structured-text"])
    expect(claudeAgentProvider.createStructuredTextBackend).toBeTypeOf("function")
  })

  it("produces a stable fingerprint that contains no secret", () => {
    const fingerprint = claudeAgentProvider.cacheFingerprint(context)

    expect(fingerprint).toEqual(claudeAgentProvider.cacheFingerprint(context))
    expect(JSON.stringify(fingerprint)).not.toContain("sk-ant-secret")
    expect(fingerprint.configurableOrigin).toBeFalsy()
  })

  it("treats the api key as optional so the local CLI login can be used", () => {
    expect(claudeAgentManifest.credentialFields[0]?.required).toBe(false)
    expect(claudeAgentProvider.credentialSchema.parse({})).toEqual({})
    expect(claudeAgentProvider.credentialSchema.parse({ apiKey: "   " })).toEqual({})
    expect(claudeAgentProvider.credentialSchema.parse({ apiKey: " sk-ant-x " })).toEqual({
      apiKey: "sk-ant-x",
    })
  })

  it("stays available with no credentials configured", () => {
    expect(isProviderConfiguredOnServer(claudeAgentProvider)).toBe(true)
    expect(validateProviderCredentials(claudeAgentProvider, {})).toEqual({})
  })

})

describe("listClaudeAgentModels", () => {
  const discoveryContext = { providerId: "claude-agent", credentials: {} }

  function fakeModelQuery(models: ClaudeAgentModelInfo[]): {
    query: ClaudeAgentQuery
    calls: ClaudeAgentQueryOptions[]
  } {
    const calls: ClaudeAgentQueryOptions[] = []
    const query: ClaudeAgentQuery = ({ options }) => {
      if (options) calls.push(options)
      const stream = (async function* (): AsyncGenerator<ClaudeAgentMessage> {})()
      return Object.assign(stream, {
        supportedModels: () => Promise.resolve(models),
      })
    }
    return { query, calls }
  }

  it("lists the SDK's supported models through the CLI login", async () => {
    const fake = fakeModelQuery([
      { value: "default", displayName: "Default (recommended)" },
      { value: "sonnet", displayName: "Sonnet" },
      { value: "claude-haiku-4-5", displayName: "Haiku" },
    ])

    const models = await listClaudeAgentModels(discoveryContext, {
      loadQuery: () => Promise.resolve(fake.query),
      hasLogin: () => true,
      scratchDir: "/tmp/adt-claude-agent-test",
    })

    expect(models).toEqual([
      { id: "default", displayName: "Default (recommended)" },
      { id: "sonnet", displayName: "Sonnet" },
      { id: "claude-haiku-4-5", displayName: "Haiku" },
    ])
  })

  it("spends no turn and never leaks an ambient credential", async () => {
    const fake = fakeModelQuery([{ value: "sonnet" }])
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-ambient")
    try {
      await listClaudeAgentModels(discoveryContext, {
        loadQuery: () => Promise.resolve(fake.query),
        hasLogin: () => true,
      })
    } finally {
      vi.unstubAllEnvs()
    }

    const options = fake.calls[0]!
    expect(options.maxTurns).toBe(1)
    expect(options.tools).toEqual([])
    expect(options.persistSession).toBe(false)
    expect(options.env?.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it("drops alias ids the app cannot round-trip as model ids", async () => {
    const fake = fakeModelQuery([
      { value: "opus[1m]", displayName: "Opus (1M context)" },
      { value: "opus", displayName: "Opus" },
    ])

    const models = await listClaudeAgentModels(discoveryContext, {
      loadQuery: () => Promise.resolve(fake.query),
      hasLogin: () => true,
    })

    expect(models).toEqual([{ id: "opus", displayName: "Opus" }])
  })

  it("reports missing-credential when neither key nor login exists", async () => {
    const fake = fakeModelQuery([{ value: "sonnet" }])

    await expect(
      listClaudeAgentModels(discoveryContext, {
        loadQuery: () => Promise.resolve(fake.query),
        hasLogin: () => false,
      }),
    ).rejects.toMatchObject({
      name: "ModelDiscoveryError",
      code: "missing-credential",
    })
  })

  it("reports unreachable when the SDK is not installed", async () => {
    await expect(
      listClaudeAgentModels(discoveryContext, {
        loadQuery: () => Promise.reject(new Error("Cannot find module")),
        hasLogin: () => true,
      }),
    ).rejects.toMatchObject({ code: "unreachable" })
  })

  it("reports invalid-response when the SDK cannot enumerate models", async () => {
    const query: ClaudeAgentQuery = () =>
      (async function* (): AsyncGenerator<ClaudeAgentMessage> {})()

    await expect(
      listClaudeAgentModels(discoveryContext, {
        loadQuery: () => Promise.resolve(query),
        hasLogin: () => true,
      }),
    ).rejects.toMatchObject({ code: "invalid-response" })
  })

  it("reports invalid-response when every model is unusable", async () => {
    const fake = fakeModelQuery([{ value: "opus[1m]" }])

    await expect(
      listClaudeAgentModels(discoveryContext, {
        loadQuery: () => Promise.resolve(fake.query),
        hasLogin: () => true,
      }),
    ).rejects.toMatchObject({ code: "invalid-response" })
  })
})

describe("createClaudeAgentStructuredTextBackend", () => {
  it("returns the structured output and the summed token usage", async () => {
    const fake = fakeQuery(
      { type: "assistant" },
      successResult({
        usage: {
          input_tokens: 10,
          output_tokens: 4,
          cache_creation_input_tokens: 3,
          cache_read_input_tokens: 5,
        },
      }),
    )

    const result = await backendWith(fake).generateStructured(makeRequest())

    expect(result.object).toEqual({ title: "Atlas", pages: 12 })
    expect(result.usage).toEqual({ inputTokens: 18, outputTokens: 4 })
    expect(result.rawText).toBe('{"title":"Atlas","pages":12}')
  })

  it("runs isolated: no tools, no local settings, no session files", async () => {
    const fake = fakeQuery(successResult())

    await backendWith(fake).generateStructured(makeRequest())

    const options = fake.calls[0]!
    expect(options.tools).toEqual([])
    expect(options.settingSources).toEqual([])
    expect(options.persistSession).toBe(false)
    expect(options.maxTurns).toBe(1)
    expect(options.thinking).toEqual({ type: "disabled" })
    expect(options.cwd).toBe("/tmp/adt-claude-agent-test")
    expect(options.model).toBe("claude-sonnet-4-5")
  })

  it("bills the resolved credential and drops an inherited OAuth token", async () => {
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "oauth-token-from-operator")
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "oauth-token-from-parent-session")
    try {
      const fake = fakeQuery(successResult())
      await backendWith(fake).generateStructured(makeRequest())

      expect(fake.calls[0]!.env?.ANTHROPIC_API_KEY).toBe("sk-ant-secret")
      expect(fake.calls[0]!.env?.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
      expect(fake.calls[0]!.env?.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("hands the CLI no credential at all when none is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-ambient")
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "oauth-token-from-operator")
    try {
      const fake = fakeQuery(successResult())
      await createClaudeAgentStructuredTextBackend(
        { ...context, credentials: {} },
        { loadQuery: () => Promise.resolve(fake.query) },
      ).generateStructured(makeRequest())

      const env = fake.calls[0]!.env!
      expect(env.ANTHROPIC_API_KEY).toBeUndefined()
      expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
      expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("strips the parent Claude Code session out of the child environment", async () => {
    vi.stubEnv("CLAUDECODE", "1")
    vi.stubEnv("CLAUDE_CODE_SESSION_ID", "parent-session")
    vi.stubEnv("CLAUDE_EFFORT", "xhigh")
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/home/operator/.claude")
    try {
      const fake = fakeQuery(successResult())
      await backendWith(fake).generateStructured(makeRequest())

      const env = fake.calls[0]!.env!
      expect(env.CLAUDECODE).toBeUndefined()
      expect(env.CLAUDE_CODE_SESSION_ID).toBeUndefined()
      expect(env.CLAUDE_EFFORT).toBeUndefined()
      expect(env.CLAUDE_CONFIG_DIR).toBe("/home/operator/.claude")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("passes the JSON Schema as the native output format", async () => {
    const fake = fakeQuery(successResult())

    await backendWith(fake).generateStructured(makeRequest())

    expect(fake.calls[0]!.outputFormat?.type).toBe("json_schema")
    expect(fake.calls[0]!.outputFormat?.schema).toMatchObject({ type: "object" })
    expect(fake.calls[0]!.outputFormat?.schema.$schema).toBeUndefined()
  })

  it("moves the schema into the system prompt for non-native strategies", async () => {
    const fake = fakeQuery(successResult({ structured_output: undefined }))

    const result = await backendWith(fake).generateStructured(
      makeRequest({ strategy: "parse-repair", system: "You are terse." }),
    )

    expect(fake.calls[0]!.outputFormat).toBeUndefined()
    expect(fake.calls[0]!.systemPrompt).toContain("You are terse.")
    expect(fake.calls[0]!.systemPrompt).toContain('"title"')
    expect(result.object).toEqual({ title: "Atlas", pages: 12 })
  })

  it("parses fenced text when the SDK reports no structured output", async () => {
    const fake = fakeQuery(
      successResult({
        structured_output: undefined,
        result: 'Here:\n```json\n{"title":"Atlas","pages":12}\n```',
      }),
    )

    const result = await backendWith(fake).generateStructured(makeRequest())

    expect(result.object).toEqual({ title: "Atlas", pages: 12 })
  })

  it("rejects output that does not validate against the schema", async () => {
    const fake = fakeQuery(successResult({ structured_output: { title: "Atlas" } }))

    await expect(backendWith(fake).generateStructured(makeRequest())).rejects.toThrow(
      /did not match the schema/,
    )
  })

  it("fails on a non-success result subtype", async () => {
    const fake = fakeQuery(
      successResult({ subtype: "error_max_turns", errors: ["turn limit"] }),
    )

    await expect(backendWith(fake).generateStructured(makeRequest())).rejects.toThrow(
      /error_max_turns.*turn limit/,
    )
  })

  it("fails when the stream ends without a result message", async () => {
    const fake = fakeQuery({ type: "assistant" })

    await expect(backendWith(fake).generateStructured(makeRequest())).rejects.toThrow(
      /without a result message/,
    )
  })

  it("aborts the SDK when the caller's signal aborts mid-stream", async () => {
    const caller = new AbortController()
    const abortedInside: boolean[] = []
    const query: ClaudeAgentQuery = ({ options }) =>
      (async function* () {
        caller.abort()
        abortedInside.push(options?.abortController?.signal.aborted ?? false)
        yield successResult()
      })()

    const backend = createClaudeAgentStructuredTextBackend(context, {
      loadQuery: () => Promise.resolve(query),
    })

    await backend.generateStructured(makeRequest({ signal: caller.signal }))
    expect(abortedInside).toEqual([true])
  })

  it("aborts immediately when the caller's signal is already aborted", async () => {
    const fake = fakeQuery(successResult())

    await backendWith(fake).generateStructured(makeRequest({ signal: AbortSignal.abort() }))

    expect(fake.calls[0]!.abortController?.signal.aborted).toBe(true)
  })
})

describe("prompt flattening", () => {
  it("drops system messages and keeps a single turn unlabelled", () => {
    const messages: Message[] = [
      { role: "system", content: "ignored" },
      { role: "user", content: "hello" },
    ]

    expect(toPromptBlocks(messages)).toEqual([{ type: "text", text: "hello" }])
  })

  it("labels each turn of a multi-turn conversation", () => {
    const messages: Message[] = [
      { role: "user", content: "first" },
      { role: "assistant", content: "second" },
      { role: "user", content: "third" },
    ]

    expect(toPromptBlocks(messages).map((block) => ("text" in block ? block.text : ""))).toEqual([
      "User:",
      "first",
      "Assistant:",
      "second",
      "User:",
      "third",
    ])
  })

  it("converts image parts into base64 blocks without the data-url prefix", () => {
    const messages: Message[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "what is this" },
          { type: "image", image: "data:image/jpeg;base64,AAAA" },
        ],
      },
    ]

    expect(toPromptBlocks(messages)[1]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: "AAAA" },
    })
  })
})

describe("detectImageMediaType", () => {
  it("prefers an explicit data-url media type", () => {
    expect(detectImageMediaType("data:image/webp;base64,UklGRxxx")).toBe("image/webp")
  })

  it("falls back to base64 magic prefixes", () => {
    expect(detectImageMediaType("iVBORw0KGgoAAA")).toBe("image/png")
    expect(detectImageMediaType("/9j/4AAQ")).toBe("image/jpeg")
    expect(detectImageMediaType("R0lGODlh")).toBe("image/gif")
    expect(detectImageMediaType("UklGRiQ")).toBe("image/webp")
    expect(detectImageMediaType("unrecognized")).toBe("image/png")
  })
})

describe("toJsonSchema", () => {
  it("passes a plain JSON Schema object through untouched", () => {
    const plain = { type: "object", properties: {} }
    expect(toJsonSchema(plain)).toBe(plain)
  })

  it("rejects a value that is neither a Zod schema nor an object", () => {
    expect(() => toJsonSchema("nope")).toThrow(/object or Zod schema/)
  })
})
