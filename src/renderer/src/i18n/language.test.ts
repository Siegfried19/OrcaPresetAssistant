import { describe, expect, it } from 'vitest'

import { normalizeLanguage, resolveHostLanguage, resolveInitialPanelLanguage } from './language'

describe('language routing', () => {
  it('understands Orca locale codes', () => {
    expect(normalizeLanguage('zh_CN')).toBe('zh-CN')
    expect(normalizeLanguage('zh_TW')).toBe('zh-CN')
    expect(normalizeLanguage('en_US')).toBe('en')
    expect(normalizeLanguage('en-GB')).toBe('en')
    expect(normalizeLanguage('de_DE')).toBeNull()
  })

  it('uses Orca lang for the host chrome', () => {
    expect(resolveHostLanguage('?lang=zh_CN', 'en-US')).toBe('zh-CN')
    expect(resolveHostLanguage('?lang=en_US', 'zh-CN')).toBe('en')
  })

  it('keeps the panel choice independent from the Orca language', () => {
    expect(resolveInitialPanelLanguage('?lang=en_US', 'zh-CN', 'en-US')).toBe('zh-CN')
    expect(resolveInitialPanelLanguage('?lang=zh_CN', 'en', 'zh-CN')).toBe('en')
  })

  it('defaults the panel to Orca when no panel choice exists', () => {
    expect(resolveInitialPanelLanguage('?lang=en_US', null, 'zh-CN')).toBe('en')
    expect(resolveInitialPanelLanguage('?lang=zh_CN', null, 'en-US')).toBe('zh-CN')
  })

  it('allows an explicit standalone language override', () => {
    expect(resolveInitialPanelLanguage('?language=en', 'zh-CN', 'zh-CN')).toBe('en')
  })
})
