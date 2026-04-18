'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeTheme = mounted ? theme ?? 'system' : 'system'
  const options = [
    { value: 'light', icon: '☀️', label: 'Light theme' },
    { value: 'dark', icon: '🌙', label: 'Dark theme' },
    { value: 'system', icon: '💻', label: 'System theme' },
  ] as const

  return (
    <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-[#020617]">
      {options.map((option) => {
        const isActive = activeTheme === option.value

        return (
          <Button
            key={option.value}
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setTheme(option.value)}
            className={`h-8 w-8 rounded-full text-sm transition-colors ${
              isActive
                ? 'bg-gray-200 text-black dark:bg-gray-800 dark:text-white'
                : 'text-gray-500 hover:bg-gray-100 hover:text-black dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
            }`}
            aria-label={option.label}
            title={option.label}
          >
            <span aria-hidden="true">{option.icon}</span>
          </Button>
        )
      })}
    </div>
  )
}
