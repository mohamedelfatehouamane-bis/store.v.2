export const ORDER_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
} as const

export type OrderStatusValue = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS]

const LEGACY_ORDER_STATUS_MAP: Record<string, OrderStatusValue> = {
  open: ORDER_STATUS.PENDING,
  accepted: ORDER_STATUS.IN_PROGRESS,
  approved: ORDER_STATUS.COMPLETED,
}

export function normalizeStatus(status?: string | null): string {
  if (!status) return ''
  const s = String(status).trim().toLowerCase()
  return LEGACY_ORDER_STATUS_MAP[s] ?? s
}

export const ACTIVE_ORDER_STATUSES = new Set<string>([
  ORDER_STATUS.PENDING,
  ORDER_STATUS.IN_PROGRESS,
  ORDER_STATUS.DELIVERED,
])

export const TERMINAL_ORDER_STATUSES = new Set<string>([
  ORDER_STATUS.COMPLETED,
  ORDER_STATUS.CANCELLED,
  ORDER_STATUS.DISPUTED,
])

export function isActiveOrderStatus(status?: string | null) {
  return ACTIVE_ORDER_STATUSES.has(normalizeStatus(status))
}

export function isTerminalOrderStatus(status?: string | null) {
  return TERMINAL_ORDER_STATUSES.has(normalizeStatus(status))
}
