import { describe, expect, it } from "vitest"
import { join } from "node:path"
import {
  claudeCliCredentialPaths,
  codexCliCredentialPaths,
  hasClaudeCliLogin,
  hasLocalCliLogin,
} from "../providers/shared/local-cli-auth.js"

const homeDir = join("/home", "operator")

describe("claudeCliCredentialPaths", () => {
  it("defaults to the home directory store", () => {
    expect(claudeCliCredentialPaths({ env: {}, homeDir })).toEqual([
      join(homeDir, ".claude", ".credentials.json"),
    ])
  })

  it("prefers CLAUDE_CONFIG_DIR without dropping the default", () => {
    expect(
      claudeCliCredentialPaths({ env: { CLAUDE_CONFIG_DIR: "/etc/claude" }, homeDir }),
    ).toEqual([
      join("/etc/claude", ".credentials.json"),
      join(homeDir, ".claude", ".credentials.json"),
    ])
  })

  it("ignores a blank CLAUDE_CONFIG_DIR", () => {
    expect(claudeCliCredentialPaths({ env: { CLAUDE_CONFIG_DIR: "  " }, homeDir })).toEqual([
      join(homeDir, ".claude", ".credentials.json"),
    ])
  })
})

describe("codexCliCredentialPaths", () => {
  it("defaults to the home directory store", () => {
    expect(codexCliCredentialPaths({ env: {}, homeDir })).toEqual([
      join(homeDir, ".codex", "auth.json"),
    ])
  })

  it("honours CODEX_HOME", () => {
    expect(codexCliCredentialPaths({ env: { CODEX_HOME: "/srv/codex" }, homeDir })).toEqual([
      join("/srv/codex", "auth.json"),
    ])
  })
})

describe("hasLocalCliLogin", () => {
  it("is true when any candidate exists", () => {
    expect(
      hasLocalCliLogin(["/a", "/b"], { fileExists: (path) => path === "/b" }),
    ).toBe(true)
  })

  it("is false when none exists", () => {
    expect(hasLocalCliLogin(["/a", "/b"], { fileExists: () => false })).toBe(false)
  })
})

describe("hasClaudeCliLogin", () => {
  it("accepts the file store without probing the keychain", () => {
    expect(
      hasClaudeCliLogin({
        env: {},
        homeDir,
        fileExists: () => true,
        platform: "darwin",
        keychainHasItem: () => {
          throw new Error("keychain must not be probed when the file exists")
        },
      }),
    ).toBe(true)
  })

  it("falls back to the macOS keychain, where Claude Code stores its login", () => {
    expect(
      hasClaudeCliLogin({
        env: {},
        homeDir,
        fileExists: () => false,
        platform: "darwin",
        keychainHasItem: (service) => service === "Claude Code-credentials",
      }),
    ).toBe(true)
  })

  it("is false on darwin when neither store has a credential", () => {
    expect(
      hasClaudeCliLogin({
        env: {},
        homeDir,
        fileExists: () => false,
        platform: "darwin",
        keychainHasItem: () => false,
      }),
    ).toBe(false)
  })

  it("never probes the keychain off darwin", () => {
    expect(
      hasClaudeCliLogin({
        env: {},
        homeDir,
        fileExists: () => false,
        platform: "linux",
        keychainHasItem: () => {
          throw new Error("keychain probe is darwin-only")
        },
      }),
    ).toBe(false)
  })
})
