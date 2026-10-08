import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { api, postComment, RETRY_DELAYS_MS } from './github'

// A fake GitHub: answers each request with the next response in the list.
function github(...responses: (number | Error | { status: number; body: unknown })[]) {
  const calls: { method: string; url: string }[] = []
  const fetch = vi.fn(async (url: string, init: { method: string }) => {
    calls.push({ method: init.method, url })
    const next = responses.shift()
    if (next === undefined) throw new Error('unexpected request')
    if (next instanceof Error) throw next
    const { status, body } = typeof next === 'number' ? { status: next, body: {} } : next
    return new Response(JSON.stringify(body), { status })
  })
  vi.stubGlobal('fetch', fetch)
  return calls
}

beforeAll(() => {
  RETRY_DELAYS_MS.splice(0, RETRY_DELAYS_MS.length, 0, 0, 0) // no waiting in tests
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.unstubAllGlobals())

describe('api', () => {
  it('retries when GitHub fails for a moment', async () => {
    const calls = github(502, 503, { status: 201, body: { ok: true } })
    expect(await api('t', 'POST', '/repos/o/r/issues/1/assignees', { assignees: ['ana'] })).toEqual({ ok: true })
    expect(calls).toHaveLength(3)
  })

  it('retries a dropped connection and a rate limit', async () => {
    const calls = github(new TypeError('network'), 429, { status: 200, body: [] })
    expect(await api('t', 'GET', '/x')).toEqual([])
    expect(calls).toHaveLength(3)
  })

  it('gives up after the last retry', async () => {
    const calls = github(502, 502, 502, 502)
    await expect(api('t', 'GET', '/x')).rejects.toThrow('502')
    expect(calls).toHaveLength(4)
  })

  it('does not retry a real error', async () => {
    const calls = github(403)
    await expect(api('t', 'GET', '/x')).rejects.toThrow('403')
    expect(calls).toHaveLength(1)
  })
})

describe('postComment', () => {
  const issue = '/repos/o/r/issues/1'

  it('does not post twice when GitHub created the comment but answered 502', async () => {
    const calls = github(502, { status: 200, body: [{ body: 'Code done', user: { login: 'bot[bot]' } }] })
    await postComment('t', issue, 'Code done', 'bot[bot]')
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET'])
  })

  it('posts again when the comment really did not land', async () => {
    const calls = github(502, { status: 200, body: [] }, { status: 201, body: { id: 1 } })
    expect(await postComment('t', issue, 'Code done', 'bot[bot]')).toEqual({ id: 1 })
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET', 'POST'])
  })

  it('does not count a comment by someone else with the same text', async () => {
    const calls = github(502, { status: 200, body: [{ body: 'Code done', user: { login: 'ana' } }] }, { status: 201, body: { id: 2 } })
    await postComment('t', issue, 'Code done', 'bot[bot]')
    expect(calls.map((c) => c.method)).toEqual(['POST', 'GET', 'POST'])
  })
})
