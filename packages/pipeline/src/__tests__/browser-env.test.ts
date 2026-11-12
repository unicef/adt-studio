import { describe, expect, it } from "vitest"
import { buildBrowserChildEnv } from "../browser-env.js"

describe("buildBrowserChildEnv", () => {
  it("removes credential-like variables while retaining ordinary environment", () => {
    expect(buildBrowserChildEnv({
      PATH: "/bin",
      ADT_ENVIRONMENT: "electron",
      OPENAI_API_KEY: "openai-secret",
      ANTHROPIC_AUTH_TOKEN: "anthropic-secret",
      CLAUDE_CODE_OAUTH_TOKEN: "claude-oauth-secret",
      GITHUB_TOKEN: "github-secret",
      GH_TOKEN: "gh-secret",
      AWS_SESSION_TOKEN: "aws-session-secret",
      AWS_SECRET_ACCESS_KEY: "aws-access-secret",
      AZURE_CLIENT_SECRET: "azure-client-secret",
      AZURE_SPEECH_KEY: "azure-speech-secret",
      CUSTOM_PASSWORD: "password",
      CUSTOM_SECRET: "secret",
      CUSTOM_ACCESS_KEY: "access-key",
      CUSTOM_KEY: "key",
      AZURE_SPEECH_REGION: "region",
    })).toEqual({
      PATH: "/bin",
      ADT_ENVIRONMENT: "electron",
    })
  })
})
