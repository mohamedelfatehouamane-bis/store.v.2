'use client'

import { Languages } from 'lucide-react'
import { useLanguage } from '@/lib/language-context'
import { Button } from '@/components/ui/button'

export default function LanguageSwitcher() {
  const { lang, toggleLang, t } = useLanguage()

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggleLang}
      className="gap-2"
      aria-label={t('language')}
      title={t('language')}
    >
      <Languages className="h-4 w-4" />
      <span>{lang === 'en' ? 'EN' : 'AR'}</span>
    </Button>
  )
}
