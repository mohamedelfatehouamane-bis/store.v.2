export type LevelThreshold = {
  level: string
  minCompletedOrders: number
  minEarnings: number
}

export const SELLER_LEVEL_THRESHOLDS: LevelThreshold[] = [
  { level: 'Elite', minCompletedOrders: 150, minEarnings: 50000 },
  { level: 'Pro', minCompletedOrders: 50, minEarnings: 20000 },
  { level: 'Intermediate', minCompletedOrders: 10, minEarnings: 5000 },
  { level: 'Beginner', minCompletedOrders: 0, minEarnings: 0 },
]

export function getSellerLevel(completedOrders: number, totalEarnings: number) {
  return (
    SELLER_LEVEL_THRESHOLDS.find(
      (threshold) =>
        completedOrders >= threshold.minCompletedOrders &&
        totalEarnings >= threshold.minEarnings
    )?.level ?? 'Beginner'
  )
}

export function getNextLevelInfo(completedOrders: number, totalEarnings: number) {
  const currentIndex = SELLER_LEVEL_THRESHOLDS.findIndex(
    (threshold) =>
      completedOrders >= threshold.minCompletedOrders &&
      totalEarnings >= threshold.minEarnings
  )

  const nextIndex = currentIndex > 0 ? currentIndex - 1 : -1
  if (nextIndex < 0) {
    return {
      nextLevel: null,
      progressPercent: 100,
      progressLabel: 'Elite level reached',
      remainingOrders: 0,
      remainingEarnings: 0,
    }
  }

  const nextThreshold = SELLER_LEVEL_THRESHOLDS[nextIndex]
  const orderProgress = nextThreshold.minCompletedOrders
    ? Math.min(completedOrders / nextThreshold.minCompletedOrders, 1)
    : 1
  const earningProgress = nextThreshold.minEarnings
    ? Math.min(totalEarnings / nextThreshold.minEarnings, 1)
    : 1

  const progressPercent = Math.round(Math.min(orderProgress, earningProgress) * 100)
  const remainingOrders = Math.max(nextThreshold.minCompletedOrders - completedOrders, 0)
  const remainingEarnings = Math.max(nextThreshold.minEarnings - totalEarnings, 0)

  return {
    nextLevel: nextThreshold.level,
    progressPercent,
    progressLabel: `${progressPercent}% to ${nextThreshold.level}`,
    remainingOrders,
    remainingEarnings,
  }
}

export const BADGE_STYLES: Record<string, string> = {
  'Top Seller': 'bg-amber-100 text-amber-800 border-amber-200',
  'Fast Delivery': 'bg-sky-100 text-sky-800 border-sky-200',
  Trusted: 'bg-emerald-100 text-emerald-800 border-emerald-200',
}
