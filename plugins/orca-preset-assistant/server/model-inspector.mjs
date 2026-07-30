import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'node:zlib'

const MAX_MODEL_BYTES = 250 * 1024 * 1024
const MAX_PREVIEW_TRIANGLES = 6_000
const PREVIEW_WIDTH = 900
const PREVIEW_HEIGHT = 300

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function updateBounds(min, max, point) {
  for (let axis = 0; axis < 3; axis += 1) {
    min[axis] = Math.min(min[axis], point[axis])
    max[axis] = Math.max(max[axis], point[axis])
  }
}

function boundsView(min, max) {
  if (![...min, ...max].every(Number.isFinite)) return null
  return {
    min: { x: min[0], y: min[1], z: min[2] },
    max: { x: max[0], y: max[1], z: max[2] },
    size: { x: max[0] - min[0], y: max[1] - min[1], z: max[2] - min[2] },
  }
}

function reservoirTriangle(sample, triangle, count) {
  if (sample.length < MAX_PREVIEW_TRIANGLES) {
    sample.push(triangle)
    return
  }
  const slot = ((count * 2_654_435_761) >>> 0) % count
  if (slot < MAX_PREVIEW_TRIANGLES) sample[slot] = triangle
}

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, checksum])
}

function setPixel(pixels, x, y, color) {
  if (x < 0 || y < 0 || x >= PREVIEW_WIDTH || y >= PREVIEW_HEIGHT) return
  const offset = (y * PREVIEW_WIDTH + x) * 3
  pixels[offset] = color[0]
  pixels[offset + 1] = color[1]
  pixels[offset + 2] = color[2]
}

function drawLine(pixels, startX, startY, endX, endY, color) {
  let x0 = Math.round(startX)
  let y0 = Math.round(startY)
  const x1 = Math.round(endX)
  const y1 = Math.round(endY)
  const deltaX = Math.abs(x1 - x0)
  const deltaY = Math.abs(y1 - y0)
  const stepX = x0 < x1 ? 1 : -1
  const stepY = y0 < y1 ? 1 : -1
  let error = deltaX - deltaY
  for (;;) {
    setPixel(pixels, x0, y0, color)
    if (x0 === x1 && y0 === y1) break
    const twice = error * 2
    if (twice > -deltaY) {
      error -= deltaY
      x0 += stepX
    }
    if (twice < deltaX) {
      error += deltaX
      y0 += stepY
    }
  }
}

function encodePng(pixels) {
  const raw = Buffer.alloc((PREVIEW_WIDTH * 3 + 1) * PREVIEW_HEIGHT)
  for (let y = 0; y < PREVIEW_HEIGHT; y += 1) {
    const target = y * (PREVIEW_WIDTH * 3 + 1)
    raw[target] = 0
    pixels.copy(raw, target + 1, y * PREVIEW_WIDTH * 3, (y + 1) * PREVIEW_WIDTH * 3)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(PREVIEW_WIDTH, 0)
  header.writeUInt32BE(PREVIEW_HEIGHT, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function geometryPreview(triangles, bounds) {
  if (!bounds || triangles.length === 0) return null
  const pixels = Buffer.alloc(PREVIEW_WIDTH * PREVIEW_HEIGHT * 3, 248)
  const views = [
    { axes: [0, 1], color: [37, 99, 235] },
    { axes: [0, 2], color: [5, 150, 105] },
    { axes: [1, 2], color: [217, 119, 6] },
  ]
  const minimum = [bounds.min.x, bounds.min.y, bounds.min.z]
  const maximum = [bounds.max.x, bounds.max.y, bounds.max.z]
  const panelWidth = PREVIEW_WIDTH / views.length

  for (let separator = 1; separator < views.length; separator += 1) {
    const x = separator * panelWidth
    for (let y = 0; y < PREVIEW_HEIGHT; y += 1) setPixel(pixels, x, y, [210, 214, 220])
  }

  views.forEach((view, viewIndex) => {
    const [horizontal, vertical] = view.axes
    const spanX = Math.max(maximum[horizontal] - minimum[horizontal], 1e-9)
    const spanY = Math.max(maximum[vertical] - minimum[vertical], 1e-9)
    const scale = Math.min((panelWidth - 24) / spanX, (PREVIEW_HEIGHT - 24) / spanY)
    const contentWidth = spanX * scale
    const contentHeight = spanY * scale
    const originX = viewIndex * panelWidth + (panelWidth - contentWidth) / 2
    const originY = (PREVIEW_HEIGHT - contentHeight) / 2
    const project = (point) => [
      originX + (point[horizontal] - minimum[horizontal]) * scale,
      PREVIEW_HEIGHT - originY - (point[vertical] - minimum[vertical]) * scale,
    ]
    for (const triangle of triangles) {
      const projected = triangle.map(project)
      drawLine(pixels, ...projected[0], ...projected[1], view.color)
      drawLine(pixels, ...projected[1], ...projected[2], view.color)
      drawLine(pixels, ...projected[2], ...projected[0], view.color)
    }
  })

  return {
    mimeType: 'image/png',
    data: encodePng(pixels).toString('base64'),
    description: 'Orthographic top, front, and side geometry preview.',
  }
}

function inspectBinaryStl(buffer) {
  assert(buffer.length >= 84, 'STL file is too short.')
  const declaredTriangles = buffer.readUInt32LE(80)
  const triangleCount = Math.min(declaredTriangles, Math.floor((buffer.length - 84) / 50))
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const previewTriangles = []
  let degenerateTriangles = 0

  for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
    const vertices = []
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const offset = 84 + triangleIndex * 50 + 12 + vertex * 12
      const point = [
        buffer.readFloatLE(offset),
        buffer.readFloatLE(offset + 4),
        buffer.readFloatLE(offset + 8),
      ]
      vertices.push(point)
      updateBounds(min, max, point)
    }
    const [a, b, c] = vertices
    const ab = b.map((value, axis) => value - a[axis])
    const ac = c.map((value, axis) => value - a[axis])
    const cross = [
      ab[1] * ac[2] - ab[2] * ac[1],
      ab[2] * ac[0] - ab[0] * ac[2],
      ab[0] * ac[1] - ab[1] * ac[0],
    ]
    if (cross.every((value) => Math.abs(value) < 1e-12)) degenerateTriangles += 1
    reservoirTriangle(previewTriangles, vertices, triangleIndex + 1)
  }

  return {
    summary: {
      encoding: 'binary',
      triangleCount,
      declaredTriangles,
      truncated: triangleCount !== declaredTriangles,
      degenerateTriangles,
      bounds: boundsView(min, max),
    },
    previewTriangles,
  }
}

function inspectAsciiStl(buffer) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const previewTriangles = []
  const triangle = []
  let vertexCount = 0
  const pattern = /\bvertex\s+([-+.\deE]+)\s+([-+.\deE]+)\s+([-+.\deE]+)/g
  for (const match of buffer.toString('utf8').matchAll(pattern)) {
    const point = [Number(match[1]), Number(match[2]), Number(match[3])]
    if (!point.every(Number.isFinite)) continue
    vertexCount += 1
    updateBounds(min, max, point)
    triangle.push(point)
    if (triangle.length === 3) {
      reservoirTriangle(previewTriangles, [...triangle], vertexCount / 3)
      triangle.length = 0
    }
  }
  return {
    summary: {
      encoding: 'ascii',
      triangleCount: Math.floor(vertexCount / 3),
      declaredTriangles: null,
      truncated: false,
      degenerateTriangles: null,
      bounds: boundsView(min, max),
    },
    previewTriangles,
  }
}

function inspectStl(filePath, stat) {
  const buffer = fs.readFileSync(filePath)
  const header = buffer.subarray(0, Math.min(buffer.length, 512)).toString('utf8').trimStart()
  const binarySize = buffer.length >= 84 ? 84 + buffer.readUInt32LE(80) * 50 : -1
  const geometry =
    /^solid\b/i.test(header) && binarySize !== buffer.length
      ? inspectAsciiStl(buffer)
      : inspectBinaryStl(buffer)
  return {
    summary: {
      fileName: path.basename(filePath),
      kind: 'stl',
      bytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      ...geometry.summary,
    },
    preview: geometryPreview(geometry.previewTriangles, geometry.summary.bounds),
  }
}

function archiveEntries(filePath) {
  return execFileSync('tar.exe', ['-tf', filePath], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 8 * 1024 * 1024,
  })
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function normalized(entry) {
  return entry.replaceAll('\\', '/').replace(/^\.\/+/, '')
}

function archiveText(filePath, entries, wanted) {
  const entry = entries.find(
    (candidate) => normalized(candidate).toLowerCase() === wanted.toLowerCase(),
  )
  if (!entry) return null
  try {
    return execFileSync('tar.exe', ['-xOf', filePath, entry], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15_000,
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return null
  }
}

function attribute(source, name) {
  return source.match(new RegExp(`\\b${name}=["']([^"']+)`, 'i'))?.[1] ?? null
}

function inspect3mfMeshes(filePath, entries) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  const previewTriangles = []
  let vertexCount = 0
  let triangleCount = 0

  for (const entry of entries.filter((candidate) =>
    normalized(candidate).toLowerCase().endsWith('.model'),
  )) {
    const text = archiveText(filePath, entries, normalized(entry))
    if (!text) continue
    const vertices = []
    for (const match of text.matchAll(/<vertex\b([^>]*)\/?>/gi)) {
      const point = ['x', 'y', 'z'].map((axis) => Number(attribute(match[1], axis)))
      if (!point.every(Number.isFinite)) continue
      vertices.push(point)
      vertexCount += 1
      updateBounds(min, max, point)
    }
    for (const match of text.matchAll(/<triangle\b([^>]*)\/?>/gi)) {
      const indices = ['v1', 'v2', 'v3'].map((name) => Number(attribute(match[1], name)))
      if (!indices.every(Number.isSafeInteger)) continue
      const triangle = indices.map((index) => vertices[index])
      if (triangle.some((point) => !point)) continue
      triangleCount += 1
      reservoirTriangle(previewTriangles, triangle, triangleCount)
    }
  }

  const bounds = boundsView(min, max)
  return {
    summary: { vertexCount, triangleCount, bounds },
    preview: geometryPreview(previewTriangles, bounds),
  }
}

function inspect3mf(filePath, stat) {
  const entries = archiveEntries(filePath)
  const projectText = archiveText(filePath, entries, 'metadata/project_settings.config')
  const modelText = archiveText(filePath, entries, 'metadata/model_settings.config')
  const geometry = inspect3mfMeshes(filePath, entries)
  let projectSettings = null
  try {
    projectSettings = projectText ? JSON.parse(projectText) : null
  } catch {
    // Invalid project metadata remains unavailable; geometry can still be inspected.
  }
  const objects = modelText
    ? [...modelText.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/gi)]
        .slice(0, 500)
        .map((match) => ({
          id: attribute(match[1], 'id'),
          name: match[2].match(/<metadata\s+key=["']name["']\s+value=["']([^"']*)/i)?.[1] ?? null,
        }))
    : []
  const instances = modelText
    ? [...modelText.matchAll(/<assemble_item\b([^>]*)\/?>/gi)].slice(0, 1000).map((match) => ({
        objectId: attribute(match[1], 'object_id'),
        instanceId: attribute(match[1], 'instance_id'),
        transform: attribute(match[1], 'transform')?.trim().split(/\s+/).map(Number) ?? null,
      }))
    : []
  return {
    summary: {
      fileName: path.basename(filePath),
      kind: '3mf',
      bytes: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      archive: {
        entryCount: entries.length,
        hasProjectSettings: projectText !== null,
        hasModelSettings: modelText !== null,
      },
      geometry: geometry.summary,
      selectedPresets: projectSettings
        ? {
            printer: projectSettings.printer_settings_id ?? null,
            process: projectSettings.print_settings_id ?? null,
            filaments: projectSettings.filament_settings_id ?? [],
          }
        : null,
      layout: {
        objectCount: objects.length,
        instanceCount: instances.length,
        objects,
        instances,
      },
    },
    preview: geometry.preview,
  }
}

export function inspectModelFile(inputPath) {
  const filePath = path.resolve(inputPath)
  assert(fs.existsSync(filePath), 'Model file does not exist.')
  const stat = fs.statSync(filePath)
  assert(stat.isFile(), 'Model path is not a file.')
  assert(stat.size > 0 && stat.size <= MAX_MODEL_BYTES, 'Model file is outside the 250 MB limit.')
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.stl') return inspectStl(filePath, stat)
  if (extension === '.3mf') return inspect3mf(filePath, stat)
  throw new Error('Only .stl and .3mf files are supported.')
}
