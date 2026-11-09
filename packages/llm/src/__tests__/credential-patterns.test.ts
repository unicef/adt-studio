import { describe, expect, it } from "vitest"
import { CredentialFieldManifest } from "@adt/types"
import {
  anthropicManifest,
  geminiManifest,
  googleManifest,
  openaiManifest,
} from "../providers/index.js"

function apiKeyPattern(manifest: { credentialFields: CredentialFieldManifest[] }): RegExp {
  const field = manifest.credentialFields.find((f) => f.key === "apiKey")
  expect(field?.pattern).toBeDefined()
  // The manifest schema must still accept the field with its pattern.
  CredentialFieldManifest.parse(field)
  return new RegExp(field!.pattern!)
}

describe("API key shape hints", () => {
  const cases = [
    {
      name: "openai",
      manifest: openaiManifest,
      valid: [
        "sk-abc123DEF456ghi789",
        "sk-proj-Ab_cD-ef12345678901234567890",
        "sk-svcacct-AbCdEf0123456789",
        "sk-admin-AbCdEf0123456789",
      ],
      invalid: ["abc123", "sk-", "\"sk-abc123\"", "Bearer sk-abc123", "sk-abc 123", "proj-abc123", "sk-ant-api03-AbC"],
    },
    {
      name: "anthropic",
      manifest: anthropicManifest,
      valid: ["sk-ant-api03-AbC_dEf-0123456789", "sk-ant-admin01-AbC"],
      invalid: ["sk-proj-abc123", "ant-api03-abc", "sk-ant-", "sk-ant-abc 123"],
    },
    {
      name: "google",
      manifest: googleManifest,
      // Classic AIza… keys and the newer AQ.… keys AI Studio now issues.
      valid: ["AIzaSyA-bC_dEfGhIjKlMnOpQrStUvWxYz01234", "AQ.Ab8RN6Kx-zY_0123.abcDEF"],
      invalid: ["sk-abc123", "aizaSyAbc", "AIza", "AIzaSy Abc", "AQ.", "AQ.Ab8 RN6", "AQAb8RN6"],
    },
    {
      name: "gemini",
      manifest: geminiManifest,
      valid: ["AIzaSyA-bC_dEfGhIjKlMnOpQrStUvWxYz01234", "AQ.Ab8RN6Kx-zY_0123.abcDEF"],
      invalid: ["sk-abc123", "AIza", "AQ."],
    },
  ]

  for (const { name, manifest, valid, invalid } of cases) {
    it(`${name} accepts well-formed keys and rejects malformed ones`, () => {
      const pattern = apiKeyPattern(manifest)
      for (const key of valid) expect(pattern.test(key), key).toBe(true)
      for (const key of invalid) expect(pattern.test(key), key).toBe(false)
    })
  }
})
