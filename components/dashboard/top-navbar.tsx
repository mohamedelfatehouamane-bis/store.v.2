'use client'

import Link from 'next/link'
import { Menu } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useLanguage } from '@/lib/language-context'
import ThemeToggle from '@/components/theme-toggle'
import LanguageSwitcher from '@/components/language-switcher'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'

type TopNavbarProps = {
  onMenuClick?: () => void;
};

export default function TopNavbar({ onMenuClick }: TopNavbarProps) {
  const { user } = useAuth()
  const { t } = useLanguage()

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-gray-200 bg-white px-3 text-black dark:border-gray-800 dark:bg-[#020617] dark:text-white sm:px-4 md:px-6">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full text-gray-600 transition-colors hover:bg-gray-100 hover:text-black dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white lg:hidden"
          aria-label={t('openNavigation')}
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div>
          <Link href="/dashboard" className="text-xs font-semibold tracking-[0.16em] text-black dark:text-white sm:text-sm sm:tracking-[0.2em]">
            MOHSTORE
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <LanguageSwitcher />
        <ThemeToggle />
        <Avatar className="h-9 w-9 border border-gray-200 dark:border-gray-800">
          <AvatarFallback className="bg-gray-100 text-sm font-semibold text-black dark:bg-gray-800 dark:text-white">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  )
}
