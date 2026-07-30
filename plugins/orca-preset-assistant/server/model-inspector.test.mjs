import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { inspectModelFile } from './model-inspector.mjs'

test('STL inspection returns exact geometry statistics and a PNG preview', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orca-model-inspector-'))
  try {
    const filePath = path.join(directory, 'triangle.stl')
    const buffer = Buffer.alloc(84 + 50)
    buffer.writeUInt32LE(1, 80)
    const vertices = [
      [0, 0, 0],
      [10, 0, 0],
      [0, 20, 5],
    ]
    vertices.forEach((point, vertex) => {
      const offset = 84 + 12 + vertex * 12
      point.forEach((value, axis) => buffer.writeFloatLE(value, offset + axis * 4))
    })
    fs.writeFileSync(filePath, buffer)

    const inspected = inspectModelFile(filePath)

    assert.equal(inspected.summary.kind, 'stl')
    assert.equal(inspected.summary.triangleCount, 1)
    assert.deepEqual(inspected.summary.bounds.size, { x: 10, y: 20, z: 5 })
    assert.equal(inspected.preview.mimeType, 'image/png')
    assert.equal(
      Buffer.from(inspected.preview.data, 'base64').subarray(1, 4).toString('ascii'),
      'PNG',
    )
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
