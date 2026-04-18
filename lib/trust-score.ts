export type TrustBadge = 'top' | 'trusted' | 'warning'

type SellerTrustInput = {
  rating?: number | null
  completed_orders?: number | null
  dispute_count?: number | null
}

export type SellerTrustSummary = {
  trust_score: number
  trust_badge: TrustBadge
  is_risky: boolean
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toNumber(value: number | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function calculateTrustScore(input: SellerTrustInput): number {
  const rating = toNumber(input.rating)
  const completedOrders = Math.max(0, toNumber(input.completed_orders))
  const disputeCount = toNumber(input.dispute_count)

  const score =
    rating * 0.7 +
    Math.min(completedOrders / 100, 1) * 0.2 -
    disputeCount * 0.1

  return clamp(Number(score.toFixed(2)), 0, 5)
}

export function getSellerBadge(input: SellerTrustInput): TrustBadge {
  const score = calculateTrustScore(input)
  const completedOrders = Math.max(0, toNumber(input.completed_orders))

  if (score >= 4.5 && completedOrders > 50) {
    return 'top'
  }

  if (score >= 3.5) {
    return 'trusted'
  }

  return 'warning'
}

export function isSellerRisky(input: SellerTrustInput): boolean {
  const rating = toNumber(input.rating)
  const disputeCount = toNumber(input.dispute_count)
  return rating < 3.5 || disputeCount > 5
}

export function buildTrustSummary(input: SellerTrustInput): SellerTrustSummary {
  return {
    trust_score: calculateTrustScore(input),
    trust_badge: getSellerBadge(input),
    is_risky: isSellerRisky(input),
  }
}

// Backward-compatible aliases used in existing code.
export const getTrustBadge = getSellerBadge
export const isRiskySeller = isSellerRisky
