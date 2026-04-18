-- Seller reputation system: users-based stats + review endpoint compatibility

-- 1) Extend users with seller reputation metrics.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS rating numeric(3,2) DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS total_reviews integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_orders integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dispute_count integer DEFAULT 0;

-- Backfill nulls safely.
UPDATE public.users
SET
  rating = COALESCE(rating, 5.0),
  total_reviews = COALESCE(total_reviews, 0),
  completed_orders = COALESCE(completed_orders, 0),
  dispute_count = COALESCE(dispute_count, 0)
WHERE rating IS NULL
   OR total_reviews IS NULL
   OR completed_orders IS NULL
   OR dispute_count IS NULL;

-- 2) Ensure reviews table supports reviewer_id naming used by newer API/UI.
-- Existing schema already has customer_id and unique(order_id).
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS reviewer_id uuid;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reviews'
      AND column_name = 'customer_id'
  ) THEN
    UPDATE public.reviews
    SET reviewer_id = customer_id
    WHERE reviewer_id IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'reviews'
      AND constraint_name = 'reviews_reviewer_id_fkey'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_reviewer_id_fkey
      FOREIGN KEY (reviewer_id) REFERENCES public.users(id);
  END IF;
END $$;

-- Keep one review per order constraint if missing.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reviews_order_id_unique'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_order_id_unique UNIQUE (order_id);
  END IF;
END $$;
