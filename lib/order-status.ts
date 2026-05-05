/**
 * Single source of truth for order statuses used throughout the client.
 *
 * The database stores orders with status `'open'`; every API route that
 * returns order data to the client MUST normalize that value to `PENDING`
 * before sending the response.  Use these constants in all frontend
 * comparisons so a typo or casing difference is caught at compile-time.
 */
export const ORDER_STATUS = {
  /** Newly created – waiting for a seller to pick it up (DB value: 'open') */
  PENDING: 'pending',
  /** A seller has picked the order and is working on it */
  IN_PROGRESS: 'in_progress',
  /** Seller has marked work as delivered, waiting for customer confirmation */
  DELIVERED: 'delivered',
  /** Customer confirmed delivery (or auto-released after timeout) */
  COMPLETED: 'completed',
  /** Automatically released after the auto-release window expired */
  AUTO_RELEASED: 'auto_released',
  /** Order was cancelled by customer or seller */
  CANCELLED: 'cancelled',
  /** Order is under dispute review by an admin */
  DISPUTED: 'disputed',
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

/** Statuses that mean the order is still active (chat enabled, actions available). */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.IN_PROGRESS,
  ORDER_STATUS.DELIVERED,
];

/**
 * Normalize a raw status string coming from the API to a guaranteed lowercase
 * `OrderStatus` value.  Pass-through is safe: if the value is already correct
 * nothing changes.
 *
 * Legacy DB values are mapped to their canonical client-facing equivalents:
 *   'open'     → 'pending'
 *   'accepted' → 'in_progress'
 */
export function normalizeStatus(raw: string): string {
  const s = raw?.toLowerCase();
  if (s === 'open') return ORDER_STATUS.PENDING;
  if (s === 'accepted') return ORDER_STATUS.IN_PROGRESS;
  return s;
}
