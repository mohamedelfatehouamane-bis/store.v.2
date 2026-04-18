'use client'

import { AlertTriangle, Clock, Package, CheckCircle2, XCircle, ChevronRight } from 'lucide-react'

type OrderEvent = {
  id: string
  type: string
  message: string
  created_at: string
}

interface OrderEventTimelineProps {
  events: OrderEvent[]
}

const ICONS: Record<string, typeof Package> = {
  created: Package,
  accepted: ChevronRight,
  delivered: Clock,
  completed: CheckCircle2,
  cancelled: XCircle,
  dispute_reported: AlertTriangle,
  dispute_resolved: CheckCircle2,
  dispute_rejected: XCircle,
}

const eventLabels: Record<string, string> = {
  created: 'Order created',
  accepted: 'Seller accepted order',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  dispute_reported: 'Dispute reported',
  dispute_resolved: 'Dispute resolved',
  dispute_rejected: 'Dispute rejected',
}

export function OrderEventTimeline({ events }: OrderEventTimelineProps) {
  return (
    <div className="space-y-3">
      {events.map((event) => {
        const Icon = ICONS[event.type] ?? ChevronRight
        return (
          <div key={event.id} className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">{eventLabels[event.type] ?? event.message}</p>
                <span className="text-xs text-slate-500">{new Date(event.created_at).toLocaleString()}</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">{event.message}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
