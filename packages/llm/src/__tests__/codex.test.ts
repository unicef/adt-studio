import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { ProviderManifest } from "@adt/types"
import { codexManifest, codexProvider } from "../providers/codex/index.js"
import { createCodexStructuredTextBackend } from "../providers/codex/structured-text.js"
import { toJsonSchema, toPromptText } from "../providers/codex/request.js"
import {
  buildCodexArgs,
  codexExecutable,
  readCodexTurn,
  runCodexCli,
  type CodexCliRequest,
  type CodexCliTurn,
  type CodexProcessResult,
} from "../providers/codex/cli.js"
import {
  isProviderConfiguredOnServer,
  validateProviderCredentials,
} from "../credentials.js"
import type { BackendContext, StructuredTextRequest } from "../ports/index.js"

const context: BackendContext<{ apiKey?: string }> = {
  providerId: "codex",
  modelId: "gpt-5.1",
  modality: "structured-text",
  credentials: { apiKey: "sk-secret" },
}

const schema = z.object({ title: z.string(), pages: z.number() })

function makeRequest(overrides: Partial<StructuredTextRequest> = {}): StructuredTextRequest {
  return {
    messages: [{ role: "user", content: "Summarize the book" }],
    schema,
    strategy: "native-schema",
    ...overrides,
  }
}

interface FakeCli {
  runTurn: (request: CodexCliRequest) => Promise<CodexCliTurn>
  requests: CodexCliRequest[]
}

function fakeCli(turn: CodexCliTurn | (() => never)): FakeCli {
  const requests: CodexCliRequest[] = []
  return {
    requests,
    runTurn: (request) => {
      requests.push(request)
      if (typeof turn === "function") turn()
      return Promise.resolve(turn)
    },
  }
}

function successTurn(overrides: Partial<CodexCliTurn> = {}): CodexCliTurn {
  return {
    finalMessage: '{"title":"Atlas","pages":12}',
    usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 6 },
    advisoryErrors: [],
    ...overrides,
  }
}

function backendWith(fake: FakeCli, credentials = context.credentials) {
  return createCodexStructuredTextBackend(
    { ...context, credentials },
    { runTurn: fake.runTurn, scratchDir: "/tmp/adt-codex-test" },
  )
}

function processResult(stdout: string, exitCode = 0, stderr = ""): CodexProcessResult {
  return { stdout, stderr, exitCode }
}

describe("codex manifest", () => {
  it("is Zod-valid and namespaces its credential header", () => {
    expect(() => ProviderManifest.parse(codexManifest)).not.toThrow()
    expect(codexManifest.credentialFields[0]?.header).toBe("X-ADT-Provider-Codex-Key")
  })

  it("declares a factory for every modality it advertises", () => {
    expect(codexManifest.modalities).toEqual(["structured-text"])
    expect(codexProvider.createStructuredTextBackend).toBeTypeOf("function")
  })

  it("declares no image input because the CLI only takes image paths", () => {
    expect(codexManifest.capabilities["structured-text"]?.imageInput).toBe(false)
    expect(codexManifest.capabilities["structured-text"]?.recursiveSchemas).toBe(false)
  })

  it("produces a stable fingerprint that contains no secret", () => {
    const fingerprint = codexProvider.cacheFingerprint(context)

    expect(fingerprint).toEqual(codexProvider.cacheFingerprint(context))
    expect(JSON.stringify(fingerprint)).not.toContain("sk-secret")
  })

  it("treats the api key as optional so the local CLI login can be used", () => {
    expect(codexManifest.credentialFields[0]?.required).toBe(false)
    expect(codexProvider.credentialSchema.parse({})).toEqual({})
    expect(codexProvider.credentialSchema.parse({ apiKey: "   " })).toEqual({})
    expect(codexProvider.credentialSchema.parse({ apiKey: " sk-x " })).toEqual({
      apiKey: "sk-x",
    })
  })

  it("stays available with no credentials configured", () => {
    expect(isProviderConfiguredOnServer(codexProvider)).toBe(true)
    expect(validateProviderCredentials(codexProvider, {})).toEqual({})
  })

  it("offers no model discovery because the CLI has no catalogue", () => {
    expect(codexProvider.listModels).toBeUndefined()
  })

  it("documents the CLI instead of the unused SDK", () => {
    for (const help of Object.values(codexManifest.localizedHelp ?? {})) {
      expect(help).not.toContain("codex-sdk")
    }
  })
})

describe("createCodexStructuredTextBackend", () => {
  it("returns the parsed output and the reported token usage", async () => {
    const fake = fakeCli(successTurn())

    const result = await backendWith(fake).generateStructured(makeRequest())

    expect(result.object).toEqual({ title: "Atlas", pages: 12 })
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 6 })
    expect(result.rawText).toBe('{"title":"Atlas","pages":12}')
  })

  it("runs the requested model in the configured scratch directory", async () => {
    const fake = fakeCli(successTurn())

    await backendWith(fake).generateStructured(makeRequest())

    expect(fake.requests[0]!.model).toBe("gpt-5.1")
    expect(fake.requests[0]!.scratchDir).toBe("/tmp/adt-codex-test")
  })

  it("bills the resolved credential and drops ambient credential variables", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-ambient")
    try {
      const fake = fakeCli(successTurn())
      await backendWith(fake).generateStructured(makeRequest())

      const env = fake.requests[0]!.env
      expect(env.CODEX_API_KEY).toBe("sk-secret")
      expect(env.OPENAI_API_KEY).toBeUndefined()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("hands the CLI no credential at all when none is configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-ambient")
    vi.stubEnv("CODEX_API_KEY", "sk-also-ambient")
    try {
      const fake = fakeCli(successTurn())
      await backendWith(fake, {}).generateStructured(makeRequest())

      const env = fake.requests[0]!.env
      expect(env.CODEX_API_KEY).toBeUndefined()
      expect(env.OPENAI_API_KEY).toBeUndefined()
      expect(env.PATH ?? env.Path).toBeDefined()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("passes the JSON Schema as the native output schema", async () => {
    const fake = fakeCli(successTurn())

    await backendWith(fake).generateStructured(makeRequest())

    expect(fake.requests[0]!.schema).toMatchObject({ type: "object" })
    expect(fake.requests[0]!.schema!.$schema).toBeUndefined()
    expect(fake.requests[0]!.prompt).not.toContain("JSON Schema")
  })

  it("moves the schema into the prompt for non-native strategies", async () => {
    const fake = fakeCli(successTurn())

    await backendWith(fake).generateStructured(
      makeRequest({ strategy: "parse-repair", system: "You extract metadata." }),
    )

    expect(fake.requests[0]!.schema).toBeUndefined()
    expect(fake.requests[0]!.prompt).toContain("You extract metadata.")
    expect(fake.requests[0]!.prompt).toContain("JSON Schema")
  })

  it("parses a fenced response", async () => {
    const fake = fakeCli(
      successTurn({ finalMessage: '```json\n{"title":"Atlas","pages":12}\n```' }),
    )

    const result = await backendWith(fake).generateStructured(makeRequest())

    expect(result.object).toEqual({ title: "Atlas", pages: 12 })
  })

  it("keeps advisory errors out of the success path", async () => {
    const fake = fakeCli(
      successTurn({ advisoryErrors: ["Model metadata for `gpt-5.1` not found."] }),
    )

    await expect(backendWith(fake).generateStructured(makeRequest())).resolves.toMatchObject({
      object: { title: "Atlas", pages: 12 },
    })
  })

  it("reports the advisory errors when no output came back", async () => {
    const fake = fakeCli(
      successTurn({ finalMessage: "", advisoryErrors: ["usage limit reached"] }),
    )

    await expect(backendWith(fake).generateStructured(makeRequest())).rejects.toThrow(
      /usage limit reached/,
    )
  })

  it("rejects output that does not match the schema", async () => {
    const fake = fakeCli(successTurn({ finalMessage: '{"title":"Atlas"}' }))

    await expect(backendWith(fake).generateStructured(makeRequest())).rejects.toThrow(
      /did not match the schema/,
    )
  })

  it("wraps a failed turn and keeps the cause", async () => {
    const fake = fakeCli(() => {
      throw new Error("Codex CLI exited with code 1: unexpected status 404 Not Found")
    })

    await expect(backendWith(fake).generateStructured(makeRequest())).rejects.toThrow(
      /Codex turn failed: Codex CLI exited with code 1: unexpected status 404/,
    )
  })

  it("redacts the api key the CLI echoes back in its rejection", async () => {
    const fake = fakeCli(() => {
      throw new Error('401 Unauthorized: Incorrect API key provided: sk-secret')
    })

    const failure = await backendWith(fake)
      .generateStructured(makeRequest())
      .catch((error: Error) => error)

    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).not.toContain("sk-secret")
    expect((failure as Error).message).toContain("[redacted]")
  })

  it("forwards an abort signal to the CLI runner", async () => {
    const fake = fakeCli(successTurn())

    await backendWith(fake).generateStructured(makeRequest())

    expect(fake.requests[0]!.signal).toBeInstanceOf(AbortSignal)
  })
})

describe("buildCodexArgs", () => {
  const args = buildCodexArgs({ model: "gpt-5.1", prompt: "Do it", workDir: "/tmp/work" })

  it("runs isolated: read-only sandbox, no web search, no approvals, no user config", () => {
    expect(args.slice(0, 2)).toEqual(["exec", "--json"])
    expect(args).toContain("--sandbox")
    expect(args).toContain("read-only")
    expect(args).toContain("--ephemeral")
    expect(args).toContain("--ignore-user-config")
    expect(args).toContain("--skip-git-repo-check")
    expect(args).toContain('approval_policy="never"')
    expect(args).toContain("tools.web_search=false")
  })

  it("pins the working directory and the model, and puts the prompt last", () => {
    expect(args[args.indexOf("--cd") + 1]).toBe("/tmp/work")
    expect(args[args.indexOf("--model") + 1]).toBe("gpt-5.1")
    expect(args.at(-1)).toBe("Do it")
  })

  it("adds the output schema file only when one was written", () => {
    expect(args).not.toContain("--output-schema")

    const withSchema = buildCodexArgs({
      model: "gpt-5.1",
      prompt: "Do it",
      workDir: "/tmp/work",
      schemaPath: "/tmp/work/output-schema.json",
    })

    expect(withSchema[withSchema.indexOf("--output-schema") + 1]).toBe(
      "/tmp/work/output-schema.json",
    )
    expect(withSchema.at(-1)).toBe("Do it")
  })
})

describe("readCodexTurn", () => {
  const agentMessage = (text: string) =>
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text } })
  const turnCompleted = JSON.stringify({
    type: "turn.completed",
    usage: { input_tokens: 20, cached_input_tokens: 8, output_tokens: 5, reasoning_output_tokens: 3 },
  })

  it("keeps the last agent message and the reported usage", () => {
    const turn = readCodexTurn(
      processResult(
        [
          JSON.stringify({ type: "thread.started", thread_id: "t1" }),
          agentMessage("first"),
          agentMessage('{"ok":true}'),
          turnCompleted,
        ].join("\n"),
      ),
    )

    expect(turn.finalMessage).toBe('{"ok":true}')
    expect(turn.usage).toEqual({
      input_tokens: 20,
      cached_input_tokens: 8,
      output_tokens: 5,
      reasoning_output_tokens: 3,
    })
    expect(turn.advisoryErrors).toEqual([])
  })

  it("collects error items the CLI reported without failing the turn", () => {
    const turn = readCodexTurn(
      processResult(
        [
          JSON.stringify({ type: "item.completed", item: { type: "error", message: "advisory" } }),
          agentMessage("done"),
        ].join("\n"),
      ),
    )

    expect(turn.advisoryErrors).toEqual(["advisory"])
    expect(turn.finalMessage).toBe("done")
  })

  it("throws with the turn.failed message", () => {
    expect(() =>
      readCodexTurn(
        processResult(
          [
            JSON.stringify({ type: "error", message: "unexpected status 404 Not Found" }),
            JSON.stringify({ type: "turn.failed", error: { message: "Model not found" } }),
          ].join("\n"),
          1,
        ),
      ),
    ).toThrow(/exited with code 1: Model not found/)
  })

  it("falls back to the transport error, then to stderr, on a non-zero exit", () => {
    expect(() =>
      readCodexTurn(
        processResult(JSON.stringify({ type: "error", message: "stream disconnected" }), 1),
      ),
    ).toThrow(/stream disconnected/)

    expect(() => readCodexTurn(processResult("", 2, "  not logged in  "))).toThrow(
      /exited with code 2: not logged in/,
    )
  })

  it("ignores non-JSON lines and unparsable events", () => {
    const turn = readCodexTurn(
      processResult(["Reading prompt...", "{not json}", agentMessage("done")].join("\n")),
    )

    expect(turn.finalMessage).toBe("done")
  })
})

describe("codexExecutable", () => {
  it("defaults to the PATH lookup and honours an override", () => {
    expect(codexExecutable({})).toBe("codex")
    expect(codexExecutable({ CODEX_EXECUTABLE: "  " })).toBe("codex")
    expect(codexExecutable({ CODEX_EXECUTABLE: " C:\\tools\\codex.cmd " })).toBe(
      "C:\\tools\\codex.cmd",
    )
  })
})

describe("runCodexCli", () => {
  it("explains how to install the CLI when the executable is missing", async () => {
    await expect(
      runCodexCli({
        model: "gpt-5.1",
        prompt: "hi",
        env: {},
        signal: AbortSignal.timeout(5_000),
        executable: "adt-codex-does-not-exist",
      }),
    ).rejects.toThrow(/Codex CLI not found.*codex login.*CODEX_EXECUTABLE/s)
  })
})

describe("codex prompt flattening", () => {
  it("drops system messages and keeps a single turn verbatim", () => {
    const prompt = toPromptText(
      undefined,
      [
        { role: "system", content: "ignored" },
        { role: "user", content: "Only turn" },
      ],
      undefined,
    )

    expect(prompt).toBe("Only turn")
  })

  it("labels a multi-turn transcript", () => {
    const prompt = toPromptText(
      "System text",
      [
        { role: "user", content: "First" },
        { role: "assistant", content: "Second" },
      ],
      undefined,
    )

    expect(prompt).toBe("System text\n\nUser:\nFirst\n\nAssistant:\nSecond")
  })

  it("refuses inline images instead of silently dropping them", () => {
    expect(() =>
      toPromptText(
        undefined,
        [{ role: "user", content: [{ type: "image", image: "iVBORw0KGgo=" }] }],
        undefined,
      ),
    ).toThrow(/image files by path only/)
  })
})

describe("codex toJsonSchema", () => {
  it("converts a Zod schema and strips $schema", () => {
    const converted = toJsonSchema(schema)

    expect(converted.type).toBe("object")
    expect(converted.$schema).toBeUndefined()
  })

  it("passes a plain object through and rejects anything else", () => {
    const plain = { type: "object" as const }

    expect(toJsonSchema(plain)).toBe(plain)
    expect(() => toJsonSchema("nope")).toThrow(/Codex structured output/)
  })
})
