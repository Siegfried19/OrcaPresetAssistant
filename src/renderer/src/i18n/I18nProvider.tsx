import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import type { Language } from '@shared/contracts'

import { createTranslator, type Translator } from './messages'

const STORAGE_KEY = 'bambu-preset-dashboard.language'

interface I18nContextValue {
  readonly language: Language
  readonly setLanguage: (language: Language) => void
  readonly t: Translator
}

const I18nContext = createContext<I18nContextValue | null>(null)

function isLanguage(value: string | null): value is Language {
  return value === 'zh-CN' || value === 'en'
}

function initialLanguage(): Language {
  const queryLanguage = new URLSearchParams(window.location.search).get('language')
  if (isLanguage(queryLanguage)) return queryLanguage

  const savedLanguage = window.localStorage.getItem(STORAGE_KEY)
  if (isLanguage(savedLanguage)) return savedLanguage

  return window.navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

export function I18nProvider({
  children,
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  const [language, setLanguageState] = useState<Language>(initialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    document.title =
      language === 'zh-CN' ? 'Bambu 预设工程面板' : 'Bambu Preset Engineering Dashboard'
    window.localStorage.setItem(STORAGE_KEY, language)
  }, [language])

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
  }, [])
  const t = useMemo(() => createTranslator(language), [language])

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>{children}</I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
