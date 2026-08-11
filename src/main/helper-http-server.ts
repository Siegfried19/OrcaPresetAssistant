import { timingSafeEqual } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { extname, join, relative } from 'node:path'

import type { Language } from '@shared/contracts'
import {
  HELPER_HTTP_MAX_BODY_BYTES,
  HELPER_HTTP_NATIVE_BRIDGE_HEADER,
  HELPER_HTTP_NATIVE_BRIDGE_VALUE,
  HELPER_HTTP_ROUTES,
  type HelperHttpResponse,
} from '@shared/helper-http'

import type { DashboardService } from './application/dashboard-service'

const LOOPBACK_HOST = '127.0.0.1'
const INTERNAL_ROUTES = new Set<string>([
  HELPER_HTTP_ROUTES.publishNativeState,
  HELPER_HTTP_ROUTES.prepareProjectExport,
  HELPER_HTTP_ROUTES.completeChangeProposal,
  HELPER_HTTP_ROUTES.recordOrcaPrint,
])

export interface HelperDialogHandlers {
  chooseRoot(language: Language): Promise<string | null>
  chooseCodexFile(language: Language): Promise<string | null>
  chooseProject3mf(language: Language): Promise<string | null>
}

export interface StartHelperHttpServerOptions {
  readonly service: DashboardService
  readonly rendererRoot: string
  readonly token: string
  readonly port: number
  readonly dialogs: HelperDialogHandlers
}

export interface RunningHelperHttpServer {
  readonly origin: string
  close(): Promise<void>
}

function mimeType(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

async function staticFiles(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const path = join(directory, entry.name)
      const value = await lstat(path)
      if (value.isSymbolicLink()) continue
      if (value.isDirectory()) {
        await walk(path)
      } else if (value.isFile()) {
        const key = `/${relative(root, path).replaceAll('\\', '/')}`
        files.set(key, path)
      }
    }
  }
  await walk(root)
  if (!files.has('/index.html')) throw new Error('helper-renderer-not-built')
  files.set('/', files.get('/index.html') as string)
  return files
}

function commonHeaders(response: ServerResponse): void {
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'",
  )
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
}

function sendJson<T>(response: ServerResponse, status: number, value: HelperHttpResponse<T>): void {
  commonHeaders(response)
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(`${JSON.stringify(value)}\n`)
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && /^[a-z0-9-]{1,80}$/u.test(error.message)) {
    return error.message
  }
  return 'internal-error'
}

function tokenMatches(request: IncomingMessage, expected: string): boolean {
  const value = request.headers.authorization
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return false
  const actual = Buffer.from(value.slice('Bearer '.length))
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  if (!String(request.headers['content-type'] ?? '').startsWith('application/json')) {
    throw new Error('invalid-content-type')
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > HELPER_HTTP_MAX_BODY_BYTES) throw new Error('request-too-large')
    chunks.push(buffer)
  }
  if (size === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  } catch {
    throw new Error('invalid-json')
  }
}

function objectBody(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid-request')
  }
  const record = value as Record<string, unknown>
  if (Object.keys(record).some((key) => !keys.includes(key))) {
    throw new Error('invalid-request')
  }
  return record
}

function languageBody(value: unknown): Language {
  const body = objectBody(value, ['language'])
  if (body.language !== 'zh-CN' && body.language !== 'en') {
    throw new Error('invalid-request')
  }
  return body.language
}

async function invokeRoute(
  path: string,
  body: unknown,
  service: DashboardService,
  dialogs: HelperDialogHandlers,
): Promise<unknown> {
  switch (path) {
    case HELPER_HTTP_ROUTES.snapshot:
      objectBody(body, [])
      return service.getSnapshot()
    case HELPER_HTTP_ROUTES.refresh:
      objectBody(body, [])
      return (await service.refresh()).snapshot
    case HELPER_HTTP_ROUTES.chooseRoot: {
      const selected = await dialogs.chooseRoot(languageBody(body))
      return selected ? service.setRoot(selected) : null
    }
    case HELPER_HTTP_ROUTES.updateSettings:
      return service.updateSettings(objectBody(body, ['language', 'autoArchive', 'threeMfPolicy']))
    case HELPER_HTTP_ROUTES.setCodexScope: {
      const value = objectBody(body, ['scope'])
      return service.setCodexScope(value.scope as never)
    }
    case HELPER_HTTP_ROUTES.chooseCodexFileGrant: {
      const selected = await dialogs.chooseCodexFile(languageBody(body))
      return selected ? service.grantCodexFile(selected) : null
    }
    case HELPER_HTTP_ROUTES.revokeCodexFileGrant: {
      const value = objectBody(body, ['path'])
      return service.revokeCodexFile(value.path as string)
    }
    case HELPER_HTTP_ROUTES.chooseProject3mf: {
      const selected = await dialogs.chooseProject3mf(languageBody(body))
      return selected ? service.grantProject3mf(selected) : null
    }
    case HELPER_HTTP_ROUTES.recordPrint:
      return service.recordPrint(
        objectBody(body, ['processId', 'materials', 'result', 'note', 'project3mfPath']) as never,
      )
    case HELPER_HTTP_ROUTES.updatePrintHistory:
      return service.updatePrintHistory(objectBody(body, ['id', 'result', 'note']) as never)
    case HELPER_HTTP_ROUTES.openPrintHistoryRecord: {
      const value = objectBody(body, ['id'])
      await service.openPrintHistoryRecord(value.id as string)
      return null
    }
    case HELPER_HTTP_ROUTES.deletePrintHistory: {
      const value = objectBody(body, ['id'])
      return service.deletePrintHistory(value.id as string)
    }
    case HELPER_HTTP_ROUTES.listChangeProposals:
      objectBody(body, [])
      return service.listChangeProposals()
    case HELPER_HTTP_ROUTES.queueChangeProposal:
      return service.queueChangeProposal(
        objectBody(body, [
          'destination',
          'presetKind',
          'presetId',
          'newPresetName',
          'before',
          'after',
          'reason',
          'requestedRevision',
        ]) as never,
      )
    case HELPER_HTTP_ROUTES.approveChangeProposal:
      return service.approveChangeProposal(
        objectBody(body, ['id', 'destination', 'newPresetName']) as never,
      )
    case HELPER_HTTP_ROUTES.rejectChangeProposal: {
      const value = objectBody(body, ['id'])
      return service.rejectChangeProposal(value.id as string)
    }
    case HELPER_HTTP_ROUTES.guardProposalRollback:
      return service.guardProposalRollback(
        objectBody(body, ['id', 'currentRevision', 'currentValues']) as never,
      )
    case HELPER_HTTP_ROUTES.getPresetDiff: {
      const value = objectBody(body, ['presetId'])
      return service.getPresetDiff(value.presetId as string)
    }
    case HELPER_HTTP_ROUTES.initializePresetGit:
      objectBody(body, [])
      return service.initializePresetGit()
    case HELPER_HTTP_ROUTES.savePresetVersion:
      return service.savePresetVersion(objectBody(body, ['message']) as never)
    case HELPER_HTTP_ROUTES.listPresetVersions:
      objectBody(body, [])
      return service.listPresetVersions()
    case HELPER_HTTP_ROUTES.restorePresetVersion:
      return service.restorePresetVersion(objectBody(body, ['revision']) as never)
    case HELPER_HTTP_ROUTES.openRoot:
      objectBody(body, [])
      await service.openRoot()
      return null
    case HELPER_HTTP_ROUTES.launchOrca:
      objectBody(body, [])
      await service.launchOrca()
      return null
    case HELPER_HTTP_ROUTES.publishNativeState:
      return service.publishNativeState(
        objectBody(body, [
          'revision',
          'selections',
          'writeCapabilities',
          'settings',
          'project',
        ]) as never,
      )
    case HELPER_HTTP_ROUTES.prepareProjectExport: {
      const value = objectBody(body, ['archiveId', 'explicitConsent'])
      return service.prepareProjectExport(
        value.archiveId as string,
        value.explicitConsent as boolean | undefined,
      )
    }
    case HELPER_HTTP_ROUTES.completeChangeProposal:
      return service.completeChangeProposal(objectBody(body, ['id', 'receipt']) as never)
    case HELPER_HTTP_ROUTES.recordOrcaPrint:
      return service.recordOrcaPrint(
        objectBody(body, ['archiveId', 'project3mfPath', 'effectiveSettings']) as never,
      )
    default:
      throw new Error('route-not-found')
  }
}

export async function startHelperHttpServer(
  options: StartHelperHttpServerOptions,
): Promise<RunningHelperHttpServer> {
  if (
    !/^[A-Za-z0-9._~-]{32,256}$/u.test(options.token) ||
    !Number.isInteger(options.port) ||
    options.port < 0 ||
    options.port > 65_535
  ) {
    throw new Error('invalid-helper-options')
  }
  const files = await staticFiles(options.rendererRoot)
  let origin = ''
  const server = createServer((request, response) => {
    void (async () => {
      commonHeaders(response)
      const url = new URL(request.url ?? '/', origin || 'http://127.0.0.1')
      if (request.method === 'GET' || request.method === 'HEAD') {
        const file = files.get(url.pathname)
        if (!file) {
          response.statusCode = 404
          response.end()
          return
        }
        response.statusCode = 200
        response.setHeader('Content-Type', mimeType(file))
        response.setHeader(
          'Cache-Control',
          url.pathname === '/' ? 'no-store' : 'public, max-age=31536000, immutable',
        )
        if (request.method === 'HEAD') {
          response.end()
        } else {
          createReadStream(file).pipe(response)
        }
        return
      }
      if (
        request.method !== 'POST' ||
        !Object.values(HELPER_HTTP_ROUTES).includes(url.pathname as never)
      ) {
        sendJson(response, 404, { ok: false, error: { code: 'route-not-found' } })
        return
      }
      if (request.headers.origin !== origin) {
        sendJson(response, 403, { ok: false, error: { code: 'invalid-origin' } })
        return
      }
      if (!tokenMatches(request, options.token)) {
        sendJson(response, 401, { ok: false, error: { code: 'invalid-session-token' } })
        return
      }
      if (
        INTERNAL_ROUTES.has(url.pathname) &&
        request.headers[HELPER_HTTP_NATIVE_BRIDGE_HEADER] !== HELPER_HTTP_NATIVE_BRIDGE_VALUE
      ) {
        sendJson(response, 403, { ok: false, error: { code: 'native-bridge-required' } })
        return
      }
      try {
        const data = await invokeRoute(
          url.pathname,
          await readBody(request),
          options.service,
          options.dialogs,
        )
        sendJson(response, 200, { ok: true, data })
      } catch (error) {
        const code = safeErrorCode(error)
        sendJson(response, code === 'request-too-large' ? 413 : 400, {
          ok: false,
          error: { code },
        })
      }
    })().catch(() => {
      if (!response.headersSent) {
        sendJson(response, 500, { ok: false, error: { code: 'internal-error' } })
      } else {
        response.destroy()
      }
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, LOOPBACK_HOST, () => {
      server.off('error', reject)
      resolve()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('helper-listen-failed')
  }
  origin = `http://${LOOPBACK_HOST}:${address.port}`
  return {
    origin,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
