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

  it('keeps the Orca product pages bilingual', () => {
    expect(createTranslator('zh-CN')('sidebar.userPresets')).toBe('用户自定义预设')
    expect(createTranslator('zh-CN')('sidebar.printHistory')).toBe('打印历史')
    expect(createTranslator('en')('sidebar.userPresets')).toBe('User Presets')
    expect(createTranslator('en')('sidebar.printHistory')).toBe('Print History')
  })

  it('explains permissions and write destinations in both languages', () => {
    expect(createTranslator('zh-CN')('settings.scope.general')).toBe('通用建议')
    expect(createTranslator('en')('settings.scope.general')).toBe('General Advice')
    expect(createTranslator('zh-CN')('settings.scope.current-project.body')).toContain(
      '模型的几何形状',
    )
    expect(createTranslator('en')('settings.scope.current-project.body')).toContain(
      'model geometry',
    )
    expect(createTranslator('zh-CN')('proposal.destination.save-as-new-preset')).toBe(
      '另存为新永久预设',
    )
    expect(createTranslator('en')('proposal.destination.save-as-new-preset')).toBe(
      'Save as New Permanent Preset',
    )
  })

  it('explains the LAN-only printing prerequisite in both languages', () => {
    expect(createTranslator('zh-CN')('settings.developerModeBody')).toContain('-26')
    expect(createTranslator('zh-CN')('settings.developerModeSafety')).toContain('可信')
    expect(createTranslator('en')('settings.developerModeBody')).toContain('Developer Mode')
    expect(createTranslator('en')('settings.developerModeSafety')).toContain('trusted LAN')
  })
})
