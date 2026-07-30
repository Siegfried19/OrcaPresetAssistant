import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  HELPER_HTTP_MAX_BODY_BYTES,
  HELPER_HTTP_NATIVE_BRIDGE_HEADER,
  HELPER_HTTP_NATIVE_BRIDGE_VALUE,
  HELPER_HTTP_ROUTES,
} from '@shared/helper-http'

import type { DashboardService } from './application/dashboard-service'
import { startHelperHttpServer } from './helper-http-server'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('helper HTTP server', () => {
  it('serves only built static files and authenticates fixed API routes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'orca-helper-http-'))
    roots.push(root)
    await mkdir(join(root, 'assets'))
    await writeFile(join(root, 'index.html'), '<!doctype html><div id="root"></div>', 'utf8')
    await writeFile(join(root, 'assets', 'app.js'), 'export {}', 'utf8')
    const getSnapshot = vi.fn(async () => ({ marker: 'snapshot' }))
    const completeChangeProposal = vi.fn(async () => ({ status: 'applied' }))
    const service = {
      getSnapshot,
      completeChangeProposal,
    } as unknown as DashboardService
    const token = '12345678901234567890123456789012'
    const server = await startHelperHttpServer({
      service,
      rendererRoot: root,
      token,
      port: 0,
      dialogs: {
        chooseRoot: async () => null,
        chooseCodexFile: async () => null,
        chooseProject3mf: async () => null,
      },
    })

    try {
      expect(server.origin).toMatch(/^http:\/\/127\.0\.0\.1:[0-9]+$/u)
      await expect(fetch(`${server.origin}/`).then((response) => response.status)).resolves.toBe(
        200,
      )
      await expect(
        fetch(`${server.origin}/not-built.txt`).then((response) => response.status),
      ).resolves.toBe(404)

      const unauthorized = await post(
        server.origin,
        HELPER_HTTP_ROUTES.snapshot,
        token,
        {},
        {
          origin: 'http://127.0.0.1:1',
        },
      )
      expect(unauthorized.status).toBe(403)

      const snapshot = await post(server.origin, HELPER_HTTP_ROUTES.snapshot, token, {})
      expect(snapshot.status).toBe(200)
      await expect(snapshot.json()).resolves.toEqual({
        ok: true,
        data: { marker: 'snapshot' },
      })
      expect(getSnapshot).toHaveBeenCalledOnce()

      const oversized = await fetch(`${server.origin}${HELPER_HTTP_ROUTES.snapshot}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          Origin: server.origin,
        },
        body: JSON.stringify({ value: 'x'.repeat(HELPER_HTTP_MAX_BODY_BYTES) }),
      })
      expect(oversized.status).toBe(413)

      const blockedInternal = await post(
        server.origin,
        HELPER_HTTP_ROUTES.completeChangeProposal,
        token,
        {},
      )
      expect(blockedInternal.status).toBe(403)

      const allowedInternal = await post(
        server.origin,
        HELPER_HTTP_ROUTES.completeChangeProposal,
        token,
        { id: 'proposal', receipt: {} },
        {
          [HELPER_HTTP_NATIVE_BRIDGE_HEADER]: HELPER_HTTP_NATIVE_BRIDGE_VALUE,
        },
      )
      expect(allowedInternal.status).toBe(200)
      expect(completeChangeProposal).toHaveBeenCalledOnce()
    } finally {
      await server.close()
    }
  })
})

function post(
  origin: string,
  path: string,
  token: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      Origin: origin,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}
