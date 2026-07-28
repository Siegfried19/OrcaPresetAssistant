import { describe, expect, it } from 'vitest'

import { createTranslator } from './messages'

describe('translations', () => {
  it('translates and interpolates both supported languages', () => {
    expect(createTranslator('zh-CN')('app.connected', { count: 14 })).toBe('已连接 14 个预设')
    expect(createTranslator('en')('app.connected', { count: 14 })).toBe('14 presets connected')
  })

  it('keeps engineering terminology distinct', () => {
    const english = createTranslator('en')
    expect(english('kind.process')).toBe('Process')
    expect(english('kind.filament')).toBe('Material')
    expect(english('materialRole.support-interface')).toBe('Support interface')
  })
})
