'use client'

import { AlertTriangle, CheckCircle2, Circle, Clock } from 'lucide-react'
import { normalizeStatus, ORDER_STATUS } from '@/lib/order-status'

type OrderStatus =
  | 'open'
  | 'pending'
  | 'in_progress'
  | 'delivered'
  | 'completed'
  | 'auto_released'
  | 'cancelled'
  | 'disputed'

interface OrderTimelineProps {
  status: string
  deliveredAt?: string
  confirmedAt?: string
  completedAt?: string
  autoReleaseAt?: string
}

export function OrderTimeline({
  status,
  deliveredAt,
  confirmedAt,
  completedAt,
  autoReleaseAt,
}: OrderTimelineProps) {
  const normalizedStatus = normalizeStatus(status)

  const steps = [
    {
      id: ORDER_STATUS.PENDING,
      label: 'Order placed',
      description: 'Waiting for seller',
      icon: 'open',
      completed: normalizedStatus !== ORDER_STATUS.PENDING,
    },
    {
      id: ORDER_STATUS.IN_PROGRESS,
      label: 'In progress',
      description: 'Seller is working on it',
      icon: 'in_progress',
      completed: ['delivered', 'completed', 'auto_released', 'confirmed', 'disputed'].includes(normalizedStatus),
    },
    {
      id: ORDER_STATUS.DELIVERED,
      label: 'Delivered',
      description: 'Waiting for confirmation',
      icon: 'delivered',
      completed: ['completed', 'confirmed', 'auto_released', 'disputed'].includes(normalizedStatus),
      timestamp: deliveredAt,
    },
    {
      id: ORDER_STATUS.DISPUTED,
      label: 'Disputed',
      description: 'Under review by admin',
      icon: 'disputed',
      completed: ['completed', 'auto_released'].includes(normalizedStatus),
    },
    {
      id: ORDER_STATUS.COMPLETED,
      label: 'Completed',
      description: 'Order finished',
      icon: 'completed',
      completed: ['completed', 'auto_released'].includes(normalizedStatus),
      timestamp: confirmedAt || completedAt,
    },
  ]

  const currentStepIndex = steps.findIndex((s) => {
    if (normalizedStatus === ORDER_STATUS.PENDING) return s.id === ORDER_STATUS.PENDING
    if (normalizedStatus === ORDER_STATUS.IN_PROGRESS) return s.id === ORDER_STATUS.IN_PROGRESS
    if (normalizedStatus === ORDER_STATUS.DELIVERED) return s.id === ORDER_STATUS.DELIVERED
    if (normalizedStatus === ORDER_STATUS.DISPUTED) return s.id === ORDER_STATUS.DISPUTED
    if (['completed', 'auto_released', 'confirmed'].includes(normalizedStatus)) return s.id === ORDER_STATUS.COMPLETED
    return -1
  })

  const progressPercentage = ((currentStepIndex + 1) / steps.length) * 100

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Timeline steps */}
      <div className="space-y-3">
        {steps.map((step, idx) => {
          const isCompleted = step.completed
          const isCurrent = idx === currentStepIndex
          const isUpcoming = idx > currentStepIndex

          return (
            <div key={step.id} className="flex items-start gap-4">
              {/* Timeline connector */}
              <div className="flex flex-col items-center gap-2">
                {isCompleted ? (
                  <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0" />
                ) : isCurrent ? (
                  <div className="relative">
                    <Circle className="h-6 w-6 text-blue-600 flex-shrink-0 animate-pulse" />
                  </div>
                ) : (
                  <Circle className="h-6 w-6 text-slate-300 flex-shrink-0" />
                )}

                {/* Vertical line to next step */}
                {idx < steps.length - 1 && (
                  <div
                    className={`w-1 h-8 ${isCompleted ? 'bg-green-600' : isCurrent || idx < currentStepIndex ? 'bg-blue-600' : 'bg-slate-300'}`}
                  />
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 pt-1">
                <div
                  className={`text-sm font-semibold ${
                    isCurrent ? 'text-blue-600' : isCompleted ? 'text-green-600' : 'text-slate-600'
                  }`}
                >
                  {step.label}
                </div>
                <p className="text-xs text-slate-500 mt-1">{step.description}</p>
                {step.timestamp && (
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(step.timestamp).toLocaleString()}
                  </p>
                )}
                {isCurrent && autoReleaseAt && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-amber-600">
                    <Clock className="h-3 w-3" />
                    Auto-release {new Date(autoReleaseAt).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
