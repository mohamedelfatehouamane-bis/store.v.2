'use client'

import { getSellerBadge } from '@/lib/trust-score'
import { useLanguage } from '@/lib/language-context'

type SellerBadgeProps = {
  seller: {
    rating?: number | null
    completed_orders?: number | null
    dispute_count?: number | null
  }
}

export default function SellerBadge({ seller }: SellerBadgeProps) {
  const { t } = useLanguage()
  const badge = getSellerBadge(seller)

  if (badge === 'top') {
    return <span className="text-orange-500">{t('topSeller')}</span>
  }

  if (badge === 'trusted') {
    return <span className="text-green-500">{t('trustedSeller')}</span>
  }

  return <span className="text-yellow-500">{t('needsReview')}</span>
}
