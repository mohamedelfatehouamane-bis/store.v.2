-- Add product_id to orders for direct product linkage.
-- This migration enables reliable product name resolution without requiring
-- the offer → product chain, which fails for exclusive-offer and fallback orders.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products(id);

-- Backfill product_id for existing orders that were placed through the offers
-- table (offer_id IS NOT NULL) but do not yet have a product_id.
UPDATE public.orders o
SET product_id = of.product_id
FROM public.offers of
WHERE o.offer_id = of.id
  AND o.product_id IS NULL
  AND of.product_id IS NOT NULL;
