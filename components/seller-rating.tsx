'use client'

interface SellerRatingProps {
  avgRating: number | null | undefined
  totalReviews: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
}

export function SellerRating({ avgRating, totalReviews, size = 'md' }: SellerRatingProps) {
  if (!avgRating && avgRating !== 0) {
    return <span className="text-slate-400">No ratings</span>
  }

  const rating = Math.round(avgRating * 10) / 10
  const stars = Math.round(rating)
  const filledStars = '★'.repeat(stars)
  const emptyStars = '☆'.repeat(5 - stars)

  const sizeClasses = {
    sm: 'text-sm gap-1',
    md: 'text-base gap-2',
    lg: 'text-lg gap-3',
  }

  return (
    <div className={`flex items-center ${sizeClasses[size]}`}>
      <span className="text-yellow-500 font-semibold">
        {filledStars}
        {emptyStars}
      </span>
      <span className="font-semibold text-slate-900">{rating}</span>
      {totalReviews !== undefined && totalReviews !== null && (
        <span className="text-slate-600">({totalReviews} reviews)</span>
      )}
    </div>
  )
}
