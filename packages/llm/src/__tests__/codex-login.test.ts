import { EventEmitter } from "node:events"
import { delimiter, join } from "node:path"
import { PassThrough } from "node:stream"
import type { spawn } from "node:child_process"
import { describe, expect, it, vi } from "vitest"
import { parseLoginUrl, runCodexLogout, startCodexLogin } from "../providers/codex/login.js"
import {
  chatGptAppCodexPaths,
  findCodexExecutable,
  resolveCodexExecutable,
} from "../providers/codex/executable.js"

/** Verbatim shape of `codex login` (v0.147) while it waits for the browser callback. */
const LOGIN_OUTPUT =
  "Starting local login server on http://localhost:1455.\n" +
  "If your browser did not open, navigate to this URL to authenticate:\n\n" +
  "\x1b[94mhttps://auth.openai.com/oauth/authorize?response_type=code&client_id=app_x&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback\x1b[0m\n\n" +
  "On a remote or headless machine? Use `codex login --device-auth` instead.\n"

const AUTH_URL =
  "https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_x&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback"

type FakeChild = EventEmitter & {
  stdout: PassThrough
  stderr: PassThrough
  kill: () => boolean
  killed: boolean
}

function fakeChild(): FakeChild {
  const child = new EventEmitter() as FakeChild
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  child.killed = false
  child.kill = () => {
    child.killed = true
    return true
  }
  return child
}

function fakeSpawn(child: FakeChild) {
  const spawnProcess = vi.fn(() => child)
  return { spawnProcess: spawnProcess as unknown as typeof spawn, calls: spawnProcess.mock.calls }
}

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

describe("parseLoginUrl", () => {
  it("extracts the authorize URL from the coloured output", () => {
    expect(parseLoginUrl(LOGIN_OUTPUT)).toBe(AUTH_URL)
  })

  it("ignores the local callback server line", () => {
    expect(parseLoginUrl("Starting local login server on http://localhost:1455.\n")).toBeUndefined()
    expect(parseLoginUrl("")).toBeUndefined()
  })

  it("waits for the whole URL when a chunk ends in the middle of it", () => {
    const cut = LOGIN_OUTPUT.indexOf("redirect_uri")
    expect(parseLoginUrl(LOGIN_OUTPUT.slice(0, cut))).toBeUndefined()
    expect(parseLoginUrl(LOGIN_OUTPUT)).toBe(AUTH_URL)
  })
})

describe("startCodexLogin", () => {
  it("runs the browser login with API keys stripped and resolves once the URL is printed", async () => {
    const child = fakeChild()
    const { spawnProcess, calls } = fakeSpawn(child)

    const pending = startCodexLogin({ executable: "/opt/codex", env: { PATH: "/bin" }, spawnProcess })
    child.stdout.write(LOGIN_OUTPUT)
    const session = await pending

    expect(calls[0]?.[0]).toBe("/opt/codex")
    expect(calls[0]?.[1]).toEqual(["login"])
    expect(session.url).toBe(AUTH_URL)

    child.emit("close", 0)
    await expect(session.completion).resolves.toBeUndefined()
  })

  it("drops ambient API keys so the CLI signs into a ChatGPT account", async () => {
    vi.stubEnv("CODEX_API_KEY", "sk-ambient")
    vi.stubEnv("OPENAI_API_KEY", "sk-ambient-2")
    try {
      const child = fakeChild()
      const { spawnProcess, calls } = fakeSpawn(child)
      const pending = startCodexLogin({ executable: "/opt/codex", spawnProcess })
      child.stdout.write(LOGIN_OUTPUT)
      await pending

      const env = (calls[0]?.[2] as { env: Record<string, string> }).env
      expect(env.CODEX_API_KEY).toBeUndefined()
      expect(env.OPENAI_API_KEY).toBeUndefined()
      expect(env.PATH ?? env.Path).toBeDefined()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("rejects the completion with the CLI's message when the login fails after the URL", async () => {
    const child = fakeChild()
    const { spawnProcess } = fakeSpawn(child)
    const pending = startCodexLogin({ executable: "/opt/codex", env: {}, spawnProcess })
    child.stdout.write(LOGIN_OUTPUT)
    const session = await pending

    child.stderr.write("authorization was denied")
    await flush()
    child.emit("close", 1)

    await expect(session.completion).rejects.toThrow(/exited with code 1.*authorization was denied/s)
  })

  it("rejects the start when the CLI quits before printing a URL", async () => {
    const child = fakeChild()
    const { spawnProcess } = fakeSpawn(child)
    const pending = startCodexLogin({ executable: "/opt/codex", env: {}, spawnProcess })

    child.stderr.write("address already in use: 127.0.0.1:1455")
    await flush()
    child.emit("close", 1)

    await expect(pending).rejects.toThrow(/exited with code 1.*1455/s)
  })

  it("treats a clean exit without a URL as already signed in", async () => {
    const child = fakeChild()
    const { spawnProcess } = fakeSpawn(child)
    const pending = startCodexLogin({ executable: "/opt/codex", env: {}, spawnProcess })

    child.emit("close", 0)
    const session = await pending

    expect(session.url).toBeUndefined()
    await expect(session.completion).resolves.toBeUndefined()
  })

  it("kills the waiting CLI on cancel and rejects the completion", async () => {
    const child = fakeChild()
    const { spawnProcess } = fakeSpawn(child)
    const pending = startCodexLogin({ executable: "/opt/codex", env: {}, spawnProcess })
    child.stdout.write(LOGIN_OUTPUT)
    const session = await pending

    session.cancel()

    expect(child.killed).toBe(true)
    await expect(session.completion).rejects.toThrow(/cancelled/)
  })

  it("explains a missing executable", async () => {
    const child = fakeChild()
    const { spawnProcess } = fakeSpawn(child)
    const pending = startCodexLogin({ executable: "/nope/codex", env: {}, spawnProcess })

    child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }))

    await expect(pending).rejects.toThrow(/Codex CLI not found.*CODEX_EXECUTABLE/s)
  })
})

describe("runCodexLogout", () => {
  it("surfaces a non-zero exit as an error", async () => {
    // `node logout` cannot find a module named "logout" and exits 1.
    await expect(
      runCodexLogout({
        executable: process.execPath,
        env: { ...process.env } as Record<string, string>,
        signal: AbortSignal.timeout(15_000),
      }),
    ).rejects.toThrow(/logout exited with code 1/)
  })
})

describe("resolveCodexExecutable", () => {
  it("prefers the explicit CODEX_EXECUTABLE override", () => {
    expect(
      resolveCodexExecutable({ env: { CODEX_EXECUTABLE: " /opt/codex/codex " }, fileExists: () => false }),
    ).toBe("/opt/codex/codex")
  })

  it("finds codex on PATH first", () => {
    const binDir = join("fake", "bin")
    const executable = findCodexExecutable({
      env: { PATH: [join("fake", "empty"), binDir].join(delimiter) },
      platform: "linux",
      homeDir: join("fake", "home"),
      fileExists: (path) => path === join(binDir, "codex"),
    })
    expect(executable).toBe(join(binDir, "codex"))
  })

  it("falls back to the common install locations a GUI app's PATH misses", () => {
    const executable = findCodexExecutable({
      env: { PATH: join("fake", "empty") },
      platform: "darwin",
      homeDir: join("fake", "home"),
      fileExists: (path) => path === "/opt/homebrew/bin/codex",
    })
    expect(executable).toBe("/opt/homebrew/bin/codex")
  })

  it("uses the CLI bundled in the ChatGPT desktop app on macOS as a last resort", () => {
    const home = join("fake", "home")
    const bundled = chatGptAppCodexPaths(home)[0]!
    const executable = findCodexExecutable({
      env: { PATH: join("fake", "empty") },
      platform: "darwin",
      homeDir: home,
      fileExists: (path) => path === bundled,
    })
    expect(executable).toBe("/Applications/ChatGPT.app/Contents/Resources/codex")
  })

  it("does not look inside the ChatGPT app on other platforms", () => {
    const home = join("fake", "home")
    const executable = findCodexExecutable({
      env: { PATH: join("fake", "empty") },
      platform: "linux",
      homeDir: home,
      fileExists: (path) => chatGptAppCodexPaths(home).includes(path),
    })
    expect(executable).toBeUndefined()
  })

  it("discovers codex.exe on Windows and skips .cmd shims", () => {
    const shimDir = join("fake", "npm")
    const binDir = join("fake", "bin")
    const files = new Set([join(shimDir, "codex.cmd"), join(binDir, "codex.exe")])
    const executable = findCodexExecutable({
      env: { PATH: [shimDir, binDir].join(delimiter) },
      platform: "win32",
      homeDir: join("fake", "home"),
      fileExists: (path) => files.has(path),
    })
    expect(executable).toBe(join(binDir, "codex.exe"))
  })

  it("returns undefined when nothing resolves", () => {
    expect(
      resolveCodexExecutable({ env: {}, platform: "linux", homeDir: join("fake", "home"), fileExists: () => false }),
    ).toBeUndefined()
  })
})
