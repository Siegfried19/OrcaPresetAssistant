import { describe, expect, it, vi } from 'vitest'

import { consumeHelperSession, createHelperHttpClient, HelperHttpError } from './helper-http-client'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('helper HTTP client', () => {
  it('consumes the session fragment and immediately removes it from the address bar', () => {
    const replaceState = vi.fn()
    const storage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    const token = consumeHelperSession(
      {
        origin: 'http://127.0.0.1:47123',
        pathname: '/index.html',
        search: '?lang=zh_CN',
        hash: '#session=secret-token&view=presets',
      },
      { replaceState },
      storage,
    )

    expect(token).toBe('secret-token')
    expect(storage.setItem).toHaveBeenCalledWith(
      'orca-preset-assistant.helper-session',
      'secret-token',
    )
    expect(replaceState).toHaveBeenCalledWith(null, '', '/index.html?lang=zh_CN#view=presets')
  })

  it('restores the session from tab storage after a WebView reload', () => {
    const replaceState = vi.fn()
    const token = consumeHelperSession(
      {
        origin: 'http://127.0.0.1:47123',
        pathname: '/index.html',
        search: '',
        hash: '',
      },
      { replaceState },
      {
        getItem: vi.fn().mockReturnValue('stored-session'),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    )

    expect(token).toBe('stored-session')
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('posts public requests only to the configured same origin', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ok: true, data: null }))
    const client = createHelperHttpClient({
      fetchImpl,
      origin: 'http://127.0.0.1:47123',
      sessionToken: 'session-token',
    })

    await client.request('chooseProject3mf', { language: 'zh-CN' })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe('http://127.0.0.1:47123/api/v1/project-3mf/choose')
    expect(init?.method).toBe('POST')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer session-token')
    expect(new Headers(init?.headers).has('x-orca-native-bridge')).toBe(false)
  })

  it('marks internal calls as originating from a successful native bridge flow', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ok: true, data: null }))
    const client = createHelperHttpClient({
      fetchImpl,
      origin: 'http://localhost:47123',
      sessionToken: 'session-token',
    })

    await client.request(
      'completeChangeProposal',
      {
        id: 'proposal-1',
        receipt: {
          authority: 'orca',
          status: 'failed',
          revision: '9',
          before: { layer_height: '0.20' },
          after: { layer_height: '0.24' },
          error: 'native failure',
        },
      },
      { nativeBridge: true },
    )

    const [, init] = fetchImpl.mock.calls[0]!
    expect(new Headers(init?.headers).get('x-orca-native-bridge')).toBe('1')
  })

  it('fails closed when the session token or helper response is missing', async () => {
    const missingSession = createHelperHttpClient({
      fetchImpl: vi.fn<typeof fetch>(),
      origin: 'http://localhost:47123',
      sessionToken: null,
    })
    await expect(missingSession.request('snapshot', {})).rejects.toMatchObject({
      code: 'helper-session-missing',
    })

    const rejected = createHelperHttpClient({
      fetchImpl: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse({ ok: false, error: { code: 'invalid-change-proposal' } }, 400),
        ),
      origin: 'http://localhost:47123',
      sessionToken: 'session-token',
    })
    await expect(rejected.request('snapshot', {})).rejects.toEqual(
      new HelperHttpError('invalid-change-proposal'),
    )
  })
})
