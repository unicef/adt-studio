import { delimiter, join } from "node:path"
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
import {
  buildClaudeArgs,
  readClaudeTurn,
  type ClaudeAgentResultEvent,
  type ClaudeAgentTurn,
  type ClaudeCliRequest,
  type ClaudeCliRunner,
} from "../providers/claude-agent/cli.js"
import {
  findClaudeAgentExecutable,
  resolveClaudeAgentExecutable,
} from "../providers/claude-agent/executable.js"
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

const CLI_PATH = "/usr/local/bin/claude"

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

interface FakeRunner {
  runCli: ClaudeCliRunner
  calls: ClaudeCliRequest[]
}

function fakeRunner(turn: ClaudeAgentTurn): FakeRunner {
  const calls: ClaudeCliRequest[] = []
  const runCli: ClaudeCliRunner = (request) => {
    calls.push(request)
    return Promise.resolve(turn)
  }
  return { runCli, calls }
}

function successEvent(
  overrides: Partial<ClaudeAgentResultEvent> = {},
): ClaudeAgentResultEvent {
  return {
    type: "result",
    subtype: "success",
    result: '{"title":"Atlas","pages":12}',
    structured_output: { title: "Atlas", pages: 12 },
    usage: { input_tokens: 10, output_tokens: 4 },
    ...overrides,
  }
}

function successTurn(overrides: Partial<ClaudeAgentResultEvent> = {}): ClaudeAgentTurn {
  return { resultEvent: successEvent(overrides), exitCode: 0, stderr: "" }
}

function backendWith(fake: FakeRunner) {
  return createClaudeAgentStructuredTextBackend(context, {
    runCli: fake.runCli,
    resolveExecutable: () => CLI_PATH,
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

  it("serves the CLI's stable aliases through the local login", async () => {
    const models = await listClaudeAgentModels(discoveryContext, { hasLogin: () => true })

    expect(models.map((model) => model.id)).toEqual(["sonnet", "opus", "haiku"])
    expect(models.every((model) => model.displayName)).toBe(true)
  })

  it("reports missing-credential when neither key nor login exists", async () => {
    await expect(
      listClaudeAgentModels(discoveryContext, { hasLogin: () => false }),
    ).rejects.toMatchObject({
      name: "ModelDiscoveryError",
      code: "missing-credential",
    })
  })

  it("serves the aliases with an API key even without a login", async () => {
    const models = await listClaudeAgentModels(
      { ...discoveryContext, credentials: { apiKey: "sk-ant-x" } },
      { hasLogin: () => false },
    )

    expect(models.length).toBeGreaterThan(0)
  })
})

describe("createClaudeAgentStructuredTextBackend", () => {
  it("returns the structured output and the summed token usage", async () => {
    const fake = fakeRunner(
      successTurn({
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

  it("hands the runner the resolved executable, model and scratch cwd", async () => {
    const fake = fakeRunner(successTurn())

    await backendWith(fake).generateStructured(makeRequest())

    const request = fake.calls[0]!
    expect(request.executable).toBe(CLI_PATH)
    expect(request.model).toBe("claude-sonnet-4-5")
    expect(request.cwd).toBe("/tmp/adt-claude-agent-test")
    expect(request.userMessage).toEqual({
      type: "user",
      message: { role: "user", content: [{ type: "text", text: "Summarize the book" }] },
      parent_tool_use_id: null,
    })
  })

  it("fails fast with an install hint when no CLI can be resolved", async () => {
    const fake = fakeRunner(successTurn())
    const backend = createClaudeAgentStructuredTextBackend(context, {
      runCli: fake.runCli,
      resolveExecutable: () => undefined,
    })

    await expect(backend.generateStructured(makeRequest())).rejects.toThrow(
      /CLAUDE_AGENT_EXECUTABLE/,
    )
    expect(fake.calls).toHaveLength(0)
  })

  it("bills the resolved credential and drops an inherited OAuth token", async () => {
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "oauth-token-from-operator")
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "oauth-token-from-parent-session")
    try {
      const fake = fakeRunner(successTurn())
      await backendWith(fake).generateStructured(makeRequest())

      expect(fake.calls[0]!.env.ANTHROPIC_API_KEY).toBe("sk-ant-secret")
      expect(fake.calls[0]!.env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
      expect(fake.calls[0]!.env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("hands the CLI no credential at all when none is configured", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-ambient")
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "oauth-token-from-operator")
    try {
      const fake = fakeRunner(successTurn())
      await createClaudeAgentStructuredTextBackend(
        { ...context, credentials: {} },
        { runCli: fake.runCli, resolveExecutable: () => CLI_PATH },
      ).generateStructured(makeRequest())

      const env = fake.calls[0]!.env
      expect(env.ANTHROPIC_API_KEY).toBeUndefined()
      expect(env.ANTHROPIC_AUTH_TOKEN).toBeUndefined()
      expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("strips the parent Claude Code session and disables thinking", async () => {
    vi.stubEnv("CLAUDECODE", "1")
    vi.stubEnv("CLAUDE_CODE_SESSION_ID", "parent-session")
    vi.stubEnv("CLAUDE_EFFORT", "xhigh")
    vi.stubEnv("CLAUDE_CONFIG_DIR", "/home/operator/.claude")
    try {
      const fake = fakeRunner(successTurn())
      await backendWith(fake).generateStructured(makeRequest())

      const env = fake.calls[0]!.env
      expect(env.CLAUDECODE).toBeUndefined()
      expect(env.CLAUDE_CODE_SESSION_ID).toBeUndefined()
      expect(env.CLAUDE_EFFORT).toBeUndefined()
      expect(env.CLAUDE_CONFIG_DIR).toBe("/home/operator/.claude")
      expect(env.MAX_THINKING_TOKENS).toBe("0")
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("passes the JSON Schema for native validation", async () => {
    const fake = fakeRunner(successTurn())

    await backendWith(fake).generateStructured(makeRequest())

    const request = fake.calls[0]!
    expect(request.schemaJson).toBeDefined()
    expect(JSON.parse(request.schemaJson!)).toMatchObject({ type: "object" })
    expect(JSON.parse(request.schemaJson!).$schema).toBeUndefined()
  })

  it("moves the schema into the system prompt for non-native strategies", async () => {
    const fake = fakeRunner(successTurn({ structured_output: undefined }))

    const result = await backendWith(fake).generateStructured(
      makeRequest({ strategy: "parse-repair", system: "You are terse." }),
    )

    const request = fake.calls[0]!
    expect(request.schemaJson).toBeUndefined()
    expect(request.systemPrompt).toContain("You are terse.")
    expect(request.systemPrompt).toContain('"title"')
    expect(result.object).toEqual({ title: "Atlas", pages: 12 })
  })

  it("parses fenced text when the CLI reports no structured output", async () => {
    const fake = fakeRunner(
      successTurn({
        structured_output: undefined,
        result: 'Here:\n```json\n{"title":"Atlas","pages":12}\n```',
      }),
    )

    const result = await backendWith(fake).generateStructured(makeRequest())

    expect(result.object).toEqual({ title: "Atlas", pages: 12 })
  })

  it("rejects output that does not validate against the schema", async () => {
    const fake = fakeRunner(successTurn({ structured_output: { title: "Atlas" } }))

    await expect(backendWith(fake).generateStructured(makeRequest())).rejects.toThrow(
      /did not match the schema/,
    )
  })

  it("fails on a non-success result subtype", async () => {
    const fake = fakeRunner(
      successTurn({ subtype: "error_during_execution", errors: ["turn limit"] }),
    )

    await expect(backendWith(fake).generateStructured(makeRequest())).rejects.toThrow(
      /error_during_execution.*turn limit/,
    )
  })

  it("surfaces the exit code and stderr when no result message arrives", async () => {
    const fake = fakeRunner({ exitCode: 1, stderr: "invalid api key" })

    await expect(backendWith(fake).generateStructured(makeRequest())).rejects.toThrow(
      /exited with code 1.*invalid api key/,
    )
  })

  it("hands the runner an already-aborted signal from the caller", async () => {
    const fake = fakeRunner(successTurn())

    await backendWith(fake).generateStructured(makeRequest({ signal: AbortSignal.abort() }))

    expect(fake.calls[0]!.signal.aborted).toBe(true)
  })
})

describe("buildClaudeArgs", () => {
  it("runs isolated: no tools, no settings, no MCP, no session files", () => {
    const args = buildClaudeArgs({ model: "sonnet" })

    expect(args).toContain("--print")
    expect(args).toContain("--no-session-persistence")
    expect(args).toContain("--strict-mcp-config")
    expect(args).toContain("--verbose")
    expect(args.join(" ")).toContain("--input-format stream-json")
    expect(args.join(" ")).toContain("--output-format stream-json")
    expect(args[args.indexOf("--tools") + 1]).toBe("")
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("")
    expect(args[args.indexOf("--model") + 1]).toBe("sonnet")
    expect(args).not.toContain("--system-prompt")
    expect(args).not.toContain("--json-schema")
  })

  it("appends the system prompt and schema only when present", () => {
    const args = buildClaudeArgs({
      model: "sonnet",
      systemPrompt: "Be terse.",
      schemaJson: '{"type":"object"}',
    })

    expect(args[args.indexOf("--system-prompt") + 1]).toBe("Be terse.")
    expect(args[args.indexOf("--json-schema") + 1]).toBe('{"type":"object"}')
  })
})

describe("readClaudeTurn", () => {
  it("extracts the result event and ignores other stream lines", () => {
    const stdout = [
      '{"type":"system","subtype":"init"}',
      "not json",
      '{"type":"assistant"}',
      '{"type":"result","subtype":"success","result":"{}","is_error":false}',
      "",
    ].join("\n")

    const turn = readClaudeTurn({ stdout, stderr: "", exitCode: 0 })

    expect(turn.resultEvent).toMatchObject({ type: "result", subtype: "success" })
    expect(turn.exitCode).toBe(0)
  })

  it("keeps exit code and stderr when no result event exists", () => {
    const turn = readClaudeTurn({ stdout: "boom\n", stderr: "bad flag", exitCode: 2 })

    expect(turn.resultEvent).toBeUndefined()
    expect(turn.exitCode).toBe(2)
    expect(turn.stderr).toBe("bad flag")
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

describe("resolveClaudeAgentExecutable", () => {
  it("prefers the explicit CLAUDE_AGENT_EXECUTABLE override", () => {
    const executable = resolveClaudeAgentExecutable({
      env: { CLAUDE_AGENT_EXECUTABLE: " /opt/claude/claude " },
      fileExists: () => false,
    })

    expect(executable).toBe("/opt/claude/claude")
  })

  it("discovers claude.exe on PATH and skips .cmd shims on Windows", () => {
    const shimDir = join("fake", "npm")
    const binDir = join("fake", "bin")
    const files = new Set([join(shimDir, "claude.cmd"), join(binDir, "claude.exe")])

    const executable = findClaudeAgentExecutable({
      env: { PATH: [shimDir, binDir].join(delimiter) },
      platform: "win32",
      homeDir: join("fake", "home"),
      fileExists: (path) => files.has(path),
    })

    expect(executable).toBe(join(binDir, "claude.exe"))
  })

  it("falls back to the native installer location when PATH has nothing", () => {
    const home = join("fake", "home")

    const executable = findClaudeAgentExecutable({
      env: { PATH: join("fake", "empty") },
      platform: "linux",
      homeDir: home,
      fileExists: (path) => path === join(home, ".local", "bin", "claude"),
    })

    expect(executable).toBe(join(home, ".local", "bin", "claude"))
  })

  it("returns undefined when nothing resolves", () => {
    const executable = resolveClaudeAgentExecutable({
      env: {},
      homeDir: join("fake", "home"),
      fileExists: () => false,
    })

    expect(executable).toBeUndefined()
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
