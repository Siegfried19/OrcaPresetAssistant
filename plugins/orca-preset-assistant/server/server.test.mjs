import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('current-project returns settings, placement, geometry summary, and an image preview', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-plugin-server-'))
  try {
    const modelPath = path.join(directory, 'part.stl')
    const buffer = Buffer.alloc(84 + 50)
    buffer.writeUInt32LE(1, 80)
    ;[
      [0, 0, 0],
      [10, 0, 0],
      [0, 10, 5],
    ].forEach((point, vertex) => {
      const offset = 84 + 12 + vertex * 12
      point.forEach((value, axis) => buffer.writeFloatLE(value, offset + axis * 4))
    })
    fs.writeFileSync(modelPath, buffer)

    const now = new Date().toISOString()
    fs.writeFileSync(
      path.join(directory, 'config.json'),
      JSON.stringify({
        schemaVersion: 1,
        workspaceRoot: directory,
        codexPermissions: { scope: 'general', fileGrants: [] },
      }),
    )
    fs.writeFileSync(
      path.join(directory, 'codex-session.json'),
      JSON.stringify({ schemaVersion: 1, scope: 'current-project', heartbeatAt: now }),
    )
    fs.writeFileSync(
      path.join(directory, 'native-state.json'),
      JSON.stringify({
        schemaVersion: 1,
        source: 'orca-native',
        generatedAt: now,
        revision: '8',
        selections: { process: { name: 'Process' } },
        settings: { layer_height: '0.2' },
        project: {
          authorization: 'project:geometry',
          placement: {
            objectCount: 1,
            objects: [{ name: 'part', sourceFiles: [modelPath], instances: [] }],
          },
        },
      }),
    )

    const input = [
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_current_project_layout', arguments: {} },
      }),
      '',
    ].join('\n')
    const result = spawnSync(process.execPath, [path.join(import.meta.dirname, 'server.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, ORCA_PRESET_ASSISTANT_USER_DATA: directory },
      input,
      timeout: 10_000,
    })

    assert.equal(result.status, 0, result.stderr)
    const response = JSON.parse(result.stdout.trim())
    const toolResult = response.result
    assert.equal(toolResult.structuredContent.settings.layer_height, '0.2')
    assert.equal(toolResult.structuredContent.modelGeometry.models[0].triangleCount, 1)
    assert.ok(
      toolResult.content.some((item) => item.type === 'image' && item.mimeType === 'image/png'),
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
