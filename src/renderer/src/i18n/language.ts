import type { Language } from '@shared/contracts'

export function normalizeLanguage(value: string | null | undefined): Language | null {
  const code = value?.trim().replaceAll('_', '-').toLocaleLowerCase()
  if (!code) return null
  if (code === 'zh' || code.startsWith('zh-')) return 'zh-CN'
  if (code === 'en' || code.startsWith('en-')) return 'en'
  return null
}

export function resolveHostLanguage(search: string, navigatorLanguage: string): Language {
  const query = new URLSearchParams(search)
  return (
    normalizeLanguage(query.get('lang')) ??
    normalizeLanguage(query.get('language')) ??
    normalizeLanguage(navigatorLanguage) ??
    'en'
  )
}

export function resolveInitialPanelLanguage(
  search: string,
  savedLanguage: string | null,
  navigatorLanguage: string,
): Language {
  const query = new URLSearchParams(search)
  return (
    normalizeLanguage(query.get('language')) ??
    normalizeLanguage(savedLanguage) ??
    resolveHostLanguage(search, navigatorLanguage)
  )
}
