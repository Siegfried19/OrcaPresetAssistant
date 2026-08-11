import type { ParameterSnapshot, ParameterValue } from './contracts'

const NUMBER_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?%?$/u

function numericValue(value: ParameterValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!NUMBER_TEXT.test(text)) return null
  const number = Number(text.endsWith('%') ? text.slice(0, -1) : text)
  return Number.isFinite(number) ? number : null
}

function booleanValue(value: ParameterValue): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (text === '1') return true
  if (text === '0') return false
  return null
}

function vectorValue(value: ParameterValue): readonly ParameterValue[] | null {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string' || !value.includes(',')) return null
  const parts = value.split(',').map((part) => part.trim())
  if (
    parts.length < 2 ||
    parts.some(
      (part) => part.length === 0 || (numericValue(part) === null && booleanValue(part) === null),
    )
  ) {
    return null
  }
  return parts
}

export function parameterValuesEqual(left: ParameterValue, right: ParameterValue): boolean {
  if (Object.is(left, right)) return true
  const leftVector = vectorValue(left)
  const rightVector = vectorValue(right)
  if (leftVector || rightVector) {
    if (leftVector && rightVector) {
      return (
        leftVector.length === rightVector.length &&
        leftVector.every((value, index) => parameterValuesEqual(value, rightVector[index]!))
      )
    }
    const vector = leftVector ?? rightVector!
    const scalar = leftVector ? right : left
    return vector.length > 0 && vector.every((value) => parameterValuesEqual(value, scalar))
  }
  if (left === null || right === null) return false

  if (typeof left === 'boolean' || typeof right === 'boolean') {
    const normalizedLeft = booleanValue(left)
    const normalizedRight = booleanValue(right)
    return normalizedLeft !== null && normalizedLeft === normalizedRight
  }

  const normalizedLeft = numericValue(left)
  const normalizedRight = numericValue(right)
  if (normalizedLeft !== null && normalizedRight !== null) {
    return Object.is(normalizedLeft, normalizedRight)
  }
  return false
}

export function parameterSnapshotsEqual(
  left: ParameterSnapshot,
  right: ParameterSnapshot,
): boolean {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index]) &&
    leftKeys.every((key) => parameterValuesEqual(left[key]!, right[key]!))
  )
}
