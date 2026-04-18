'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { translations, type AppLanguage, type TranslationKey } from '@/lib/translations'

type LanguageContextValue = {
  lang: AppLanguage
  setLang: (lang: AppLanguage) => void
  toggleLang: () => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined)

const STORAGE_KEY = 'lang'

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AppLanguage>('en')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'en' || stored === 'ar') {
      setLangState(stored)
      return
    }

    const browserLang = navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en'
    setLangState(browserLang)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)

    const html = document.documentElement
    html.setAttribute('lang', lang)
    html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
  }, [lang])

  const value = useMemo<LanguageContextValue>(() => {
    return {
      lang,
      setLang: (nextLang) => setLangState(nextLang),
      toggleLang: () => setLangState((current) => (current === 'en' ? 'ar' : 'en')),
      t: (key) => {
        const localized = (translations[lang] as Record<string, string>)[key]
        if (!localized && process.env.NODE_ENV === 'development') {
          console.warn('Missing translation:', key)
        }
        return localized ?? key
      },
    }
  }, [lang])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
