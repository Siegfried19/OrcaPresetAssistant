import type { DashboardApi } from '@shared/contracts'
import {
  HELPER_HTTP_NATIVE_BRIDGE_HEADER,
  HELPER_HTTP_NATIVE_BRIDGE_VALUE,
  HELPER_HTTP_ROUTES,
  HELPER_HTTP_SESSION_FRAGMENT,
  type HelperHttpRequestMap,
  type HelperHttpResponseMap,
} from '@shared/helper-http'

type HelperOperation = keyof HelperHttpRequestMap
const HELPER_SESSION_STORAGE_KEY = 'orca-preset-assistant.helper-session'

export interface HelperHttpClient {
  request<K extends HelperOperation>(
    operation: K,
    body: HelperHttpRequestMap[K],
    options?: Readonly<{ nativeBridge?: boolean }>,
  ): Promise<HelperHttpResponseMap[K]>
}

interface SessionLocation {
  readonly origin: string
  readonly pathname: string
  readonly search: string
  readonly hash: string
}

interface SessionHistory {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void
}

interface SessionStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface CreateHelperClientOptions {
  readonly fetchImpl: typeof fetch
  readonly origin: string
  readonly sessionToken: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export class HelperHttpError extends Error {
  public readonly code: string

  public constructor(code: string) {
    super(code)
    this.name = 'HelperHttpError'
    this.code = code
  }
}

export function consumeHelperSession(
  location: SessionLocation,
  history: SessionHistory,
  storage?: SessionStorage,
): string | null {
  const fragment = new URLSearchParams(location.hash.replace(/^#/u, ''))
  if (!fragment.has(HELPER_HTTP_SESSION_FRAGMENT)) {
    return storage?.getItem(HELPER_SESSION_STORAGE_KEY)?.trim() || null
  }

  const value = fragment.get(HELPER_HTTP_SESSION_FRAGMENT)?.trim() || null
  if (value) storage?.setItem(HELPER_SESSION_STORAGE_KEY, value)
  else storage?.removeItem(HELPER_SESSION_STORAGE_KEY)
  fragment.delete(HELPER_HTTP_SESSION_FRAGMENT)
  const remaining = fragment.toString()
  history.replaceState(
    null,
    '',
    `${location.pathname}${location.search}${remaining ? `#${remaining}` : ''}`,
  )
  return value
}

export function createHelperHttpClient({
  fetchImpl,
  origin,
  sessionToken,
}: CreateHelperClientOptions): HelperHttpClient {
  const expectedOrigin = new URL(origin).origin

  return {
    async request<K extends HelperOperation>(
      operation: K,
      body: HelperHttpRequestMap[K],
      options: Readonly<{ nativeBridge?: boolean }> = {},
    ): Promise<HelperHttpResponseMap[K]> {
      if (!sessionToken) throw new HelperHttpError('helper-session-missing')

      const url = new URL(HELPER_HTTP_ROUTES[operation], expectedOrigin)
      if (url.origin !== expectedOrigin) {
        throw new HelperHttpError('helper-origin-mismatch')
      }
      const headers = new Headers({
        accept: 'application/json',
        authorization: `Bearer ${sessionToken}`,
        'content-type': 'application/json',
      })
      if (options.nativeBridge) {
        headers.set(HELPER_HTTP_NATIVE_BRIDGE_HEADER, HELPER_HTTP_NATIVE_BRIDGE_VALUE)
      }

      const response = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      })
      const payload: unknown = await response.json().catch(() => null)
      if (isRecord(payload) && payload.ok === false && isRecord(payload.error)) {
        const code =
          typeof payload.error.code === 'string' && payload.error.code
            ? payload.error.code
            : `helper-http-${response.status}`
        throw new HelperHttpError(code)
      }
      if (!response.ok || !isRecord(payload) || payload.ok !== true || !('data' in payload)) {
        throw new HelperHttpError(`helper-http-${response.status || 'invalid-response'}`)
      }
      return payload.data as HelperHttpResponseMap[K]
    },
  }
}

export function createHelperDashboardApi(client: HelperHttpClient): DashboardApi {
  return {
    getSnapshot: () => client.request('snapshot', {}),
    refresh: () => client.request('refresh', {}),
    chooseRoot: (language) => client.request('chooseRoot', { language }),
    updateSettings: (request) => client.request('updateSettings', request),
    setCodexScope: (scope) => client.request('setCodexScope', { scope }),
    chooseCodexFileGrant: (language) => client.request('chooseCodexFileGrant', { language }),
    revokeCodexFileGrant: (path) => client.request('revokeCodexFileGrant', { path }),
    chooseProject3mf: (language) => client.request('chooseProject3mf', { language }),
    recordPrint: (request) => client.request('recordPrint', request),
    updatePrintHistory: (request) => client.request('updatePrintHistory', request),
    openPrintHistoryRecord: async (id) => {
      await client.request('openPrintHistoryRecord', { id })
    },
    deletePrintHistory: (id) => client.request('deletePrintHistory', { id }),
    listChangeProposals: () => client.request('listChangeProposals', {}),
    queueChangeProposal: (request) => client.request('queueChangeProposal', request),
    approveChangeProposal: (request) => client.request('approveChangeProposal', request),
    rejectChangeProposal: (id) => client.request('rejectChangeProposal', { id }),
    rollbackChangeProposal: () => Promise.reject(new Error('orca-unavailable')),
    guardProposalRollback: (request) => client.request('guardProposalRollback', request),
    getPresetDiff: (presetId) => client.request('getPresetDiff', { presetId }),
    openRoot: async () => {
      await client.request('openRoot', {})
    },
    launchOrca: async () => {
      await client.request('launchOrca', {})
    },
    onSnapshotChanged: () => () => undefined,
  }
}
