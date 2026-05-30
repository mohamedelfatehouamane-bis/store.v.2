"use client"

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

type OrderCompleteAnimationProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLeaveReview?: () => void
  onBackToOrders?: () => void
  autoHideDurationMs?: number
}

const CONFETTI_PARTICLES = [
  { x: -68, y: -54, color: 'bg-emerald-300', delay: 0 },
  { x: -46, y: -74, color: 'bg-lime-300', delay: 60 },
  { x: -20, y: -84, color: 'bg-teal-300', delay: 90 },
  { x: 22, y: -82, color: 'bg-emerald-200', delay: 120 },
  { x: 48, y: -70, color: 'bg-green-300', delay: 160 },
  { x: 68, y: -52, color: 'bg-teal-200', delay: 190 },
  { x: -56, y: -28, color: 'bg-lime-200', delay: 220 },
  { x: 56, y: -26, color: 'bg-emerald-400', delay: 260 },
]

export function OrderCompleteAnimation({
  open,
  onOpenChange,
  onLeaveReview = () => {},
  onBackToOrders = () => {},
  autoHideDurationMs = 3000,
}: OrderCompleteAnimationProps) {
  const [isMounted, setIsMounted] = useState(open)
  const [isVisible, setIsVisible] = useState(open)
  const closeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  const unmountTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

  useEffect(() => {
    if (open) {
      setIsMounted(true)
      requestAnimationFrame(() => setIsVisible(true))
      return
    }

    setIsVisible(false)
    if (unmountTimerRef.current) {
      window.clearTimeout(unmountTimerRef.current)
    }

    unmountTimerRef.current = window.setTimeout(() => {
      setIsMounted(false)
      unmountTimerRef.current = null
    }, 320)
  }, [open])

  useEffect(() => {
    if (!open) return

    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current)
    }

    closeTimerRef.current = window.setTimeout(() => {
      onOpenChange(false)
      closeTimerRef.current = null
    }, autoHideDurationMs)

    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = null
      }
    }
  }, [autoHideDurationMs, onOpenChange, open])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current)
      }
      if (unmountTimerRef.current) {
        window.clearTimeout(unmountTimerRef.current)
      }
    }
  }, [])

  if (!isMounted) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Order Completed Successfully"
      className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <button
        type="button"
        aria-label="Close success modal"
        onClick={() => onOpenChange(false)}
        className={`absolute inset-0 bg-slate-950/75 backdrop-blur-md transition-opacity duration-300 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        className={`relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-emerald-400/30 bg-gradient-to-b from-slate-900 via-slate-950 to-black p-7 shadow-[0_0_45px_rgba(16,185,129,0.22)] transition-all duration-300 ${
          isVisible ? 'translate-y-0 scale-100' : 'translate-y-3 scale-95'
        }`}
      >
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-14 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="absolute inset-x-0 -bottom-8 mx-auto h-24 w-80 rounded-full bg-emerald-500/10 blur-3xl" />
        </div>

        <div className="relative mb-7 flex justify-center">
          <div className="absolute h-24 w-24 rounded-full bg-emerald-400/25 blur-2xl" />
          <div className="absolute h-20 w-20 rounded-full border border-emerald-300/40 animate-ping [animation-duration:1.8s]" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-emerald-300/60 bg-emerald-400/20 shadow-[0_0_30px_rgba(16,185,129,0.45)]">
            <Check
              className={`h-10 w-10 text-emerald-200 transition-all duration-500 ${
                isVisible ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-1 scale-75 opacity-0'
              }`}
              strokeWidth={3}
            />
          </div>

          {CONFETTI_PARTICLES.map((particle, index) => (
            <span
              key={`${particle.x}-${particle.y}-${index}`}
              className={`absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-sm ${particle.color}`}
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible
                  ? `translate(${particle.x}px, ${particle.y}px) rotate(${particle.x}deg)`
                  : 'translate(0px, 0px) scale(0.3)',
                transition: `transform 700ms cubic-bezier(0.2, 0.9, 0.2, 1), opacity 500ms ease`,
                transitionDelay: `${particle.delay}ms`,
              }}
            />
          ))}
        </div>

        <div className="relative space-y-2 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-emerald-100">Order Completed Successfully</h2>
          <p className="text-sm text-slate-300">Thank you for using MOHSTORE</p>
        </div>

        <div className="relative mt-7 grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            onClick={onLeaveReview}
            className="border border-emerald-400/30 bg-emerald-400/15 text-emerald-100 hover:bg-emerald-400/25"
          >
            Leave Review
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onBackToOrders}
            className="border-emerald-400/30 bg-slate-900/80 text-emerald-100 hover:bg-slate-800/80"
          >
            Back to Orders
          </Button>
        </div>
      </div>
    </div>
  )
}
