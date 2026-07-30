import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import type { Language } from '@shared/contracts'

import { resolveHostLanguage, resolveInitialPanelLanguage } from './language'
import { createTranslator, type Translator } from './messages'

const STORAGE_KEY = 'orca-preset-assistant.language'

interface I18nContextValue {
  readonly hostLanguage: Language
  readonly language: Language
  readonly setLanguage: (language: Language) => void
  readonly t: Translator
}

const I18nContext = createContext<I18nContextValue | null>(null)

function initialLanguage(): Language {
  return resolveInitialPanelLanguage(
    window.location.search,
    window.localStorage.getItem(STORAGE_KEY),
    window.navigator.language,
  )
}

export function I18nProvider({
  children,
}: {
  readonly children: React.ReactNode
}): React.JSX.Element {
  const [hostLanguage] = useState<Language>(() =>
    resolveHostLanguage(window.location.search, window.navigator.language),
  )
  const [language, setLanguageState] = useState<Language>(initialLanguage)

  useEffect(() => {
    document.documentElement.lang = language
    document.title = hostLanguage === 'zh-CN' ? 'Orca 预设助手' : 'Orca Preset Assistant'
    window.localStorage.setItem(STORAGE_KEY, language)
  }, [hostLanguage, language])

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next)
  }, [])
  const t = useMemo(() => createTranslator(language), [language])

  return (
    <I18nContext.Provider value={{ hostLanguage, language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n must be used inside I18nProvider')
  return value
}
