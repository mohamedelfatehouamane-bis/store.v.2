-- Migration: Add seller_categories table for category-based seller assignment
-- Replaces the seller_games junction table for seller routing logic.
-- seller_id references public.users(id) (the user's UUID, NOT sellers.id)

CREATE TABLE IF NOT EXISTS public.seller_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL,
  game_id uuid NOT NULL,
  category_id uuid NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT seller_categories_pkey PRIMARY KEY (id),
  CONSTRAINT seller_categories_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id) ON DELETE CASCADE,
  CONSTRAINT seller_categories_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id) ON DELETE CASCADE,
  CONSTRAINT seller_categories_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE,
  CONSTRAINT seller_categories_unique UNIQUE (seller_id, category_id)
);

CREATE INDEX IF NOT EXISTS seller_categories_seller_id_idx ON public.seller_categories(seller_id);
CREATE INDEX IF NOT EXISTS seller_categories_game_id_idx ON public.seller_categories(game_id);
CREATE INDEX IF NOT EXISTS seller_categories_category_id_idx ON public.seller_categories(category_id);
