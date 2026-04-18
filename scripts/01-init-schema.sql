-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.admin_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  admin_telegram_id text NOT NULL,
  action text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT admin_actions_pkey PRIMARY KEY (id)
);
CREATE TABLE public.categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  position integer DEFAULT 0,
  icon text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT categories_pkey PRIMARY KEY (id),
  CONSTRAINT categories_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id)
);
CREATE TABLE public.disputes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  opened_by uuid,
  reason text NOT NULL,
  status character varying NOT NULL DEFAULT 'open'::character varying,
  previous_status character varying,
  admin_note text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  CONSTRAINT disputes_pkey PRIMARY KEY (id),
  CONSTRAINT disputes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT disputes_opened_by_fkey FOREIGN KEY (opened_by) REFERENCES public.users(id)
);
CREATE TABLE public.game_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  game_id uuid,
  account_identifier text NOT NULL,
  account_password_encrypted text,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  account_email text,
  CONSTRAINT game_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT game_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT game_accounts_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id)
);
CREATE TABLE public.games (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  platform text,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  slug character varying UNIQUE,
  image_url text,
  CONSTRAINT games_pkey PRIMARY KEY (id)
);
CREATE TABLE public.order_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  type character varying NOT NULL,
  message text NOT NULL,
  created_by uuid,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT order_events_pkey PRIMARY KEY (id),
  CONSTRAINT order_events_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id)
);
CREATE TABLE public.order_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  action text NOT NULL CHECK (action = ANY (ARRAY['accept'::text, 'reject'::text])),
  result text NOT NULL,
  details jsonb,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT order_logs_pkey PRIMARY KEY (id),
  CONSTRAINT order_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_logs_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id)
);
CREATE TABLE public.order_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  sender_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT order_messages_pkey PRIMARY KEY (id),
  CONSTRAINT order_messages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT order_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id)
);
CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  customer_id uuid,
  offer_id uuid,
  game_account_id uuid,
  assigned_seller_id uuid,
  status USER-DEFINED DEFAULT 'open'::order_status,
  points_amount integer NOT NULL,
  seller_earnings integer,
  locked_at timestamp without time zone,
  picked_at timestamp without time zone,
  completed_at timestamp without time zone,
  approved_at timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  assigned_at timestamp without time zone,
  CONSTRAINT orders_pkey PRIMARY KEY (id),
  CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id),
  CONSTRAINT orders_game_account_id_fkey FOREIGN KEY (game_account_id) REFERENCES public.game_accounts(id),
  CONSTRAINT orders_assigned_seller_id_fkey FOREIGN KEY (assigned_seller_id) REFERENCES public.users(id)
);
CREATE TABLE public.payment_method_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_method_id uuid NOT NULL,
  account_number text NOT NULL,
  account_name text NOT NULL,
  is_active boolean DEFAULT true,
  usage_count bigint DEFAULT 0,
  priority integer DEFAULT 1,
  last_used timestamp without time zone,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT payment_method_accounts_pkey PRIMARY KEY (id),
  CONSTRAINT payment_method_accounts_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id)
);
CREATE TABLE public.payment_methods (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  display_name text NOT NULL,
  instructions text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT payment_methods_pkey PRIMARY KEY (id)
);
CREATE TABLE public.point_topups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  amount_points integer,
  proof_image text,
  status USER-DEFINED DEFAULT 'pending'::request_status,
  created_at timestamp without time zone DEFAULT now(),
  rejection_reason text,
  payment_method text,
  payment_method_id uuid,
  payment_account_id uuid,
  payment_account_number text,
  payment_account_name text,
  transaction_reference text,
  CONSTRAINT point_topups_pkey PRIMARY KEY (id),
  CONSTRAINT point_topups_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id),
  CONSTRAINT point_topups_payment_method_id_fkey FOREIGN KEY (payment_method_id) REFERENCES public.payment_methods(id),
  CONSTRAINT point_topups_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.payment_method_accounts(id)
);
CREATE TABLE public.point_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  amount integer NOT NULL,
  type USER-DEFINED,
  reference_id uuid,
  created_at timestamp without time zone DEFAULT now(),
  status text DEFAULT 'pending'::text,
  CONSTRAINT point_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT point_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_id uuid,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  image_url text NOT NULL DEFAULT ''::text,
  points_price integer NOT NULL DEFAULT 0,
  category_id uuid,
  seller_id uuid,
  status text NOT NULL DEFAULT 'approved'::text,
  type text NOT NULL DEFAULT 'admin'::text,
  approved_by uuid,
  approved_at timestamp without time zone,
  CONSTRAINT products_pkey PRIMARY KEY (id),
  CONSTRAINT products_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id),
  CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id),
  CONSTRAINT products_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id),
  CONSTRAINT products_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id)
);
CREATE TABLE public.rate_limit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  endpoint character varying NOT NULL,
  ip_address character varying NOT NULL,
  request_count integer NOT NULL DEFAULT 1,
  window_start timestamp without time zone NOT NULL,
  window_end timestamp without time zone NOT NULL,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rate_limit_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE,
  seller_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT reviews_pkey PRIMARY KEY (id),
  CONSTRAINT reviews_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id),
  CONSTRAINT reviews_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id),
  CONSTRAINT reviews_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id)
);
CREATE TABLE public.seller_games (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  seller_id uuid,
  game_id uuid,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT seller_games_pkey PRIMARY KEY (id),
  CONSTRAINT seller_games_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.sellers(id),
  CONSTRAINT seller_games_game_id_fkey FOREIGN KEY (game_id) REFERENCES public.games(id)
);
CREATE TABLE public.sellers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  fee_percentage integer DEFAULT 10,
  verification_status USER-DEFINED DEFAULT 'pending'::verification_status,
  total_tasks_completed integer DEFAULT 0,
  average_rating numeric DEFAULT 0,
  is_suspended boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  business_name text,
  business_description text,
  rejection_reason text,
  total_reviews integer DEFAULT 0,
  telegram_chat_id text,
  CONSTRAINT sellers_pkey PRIMARY KEY (id),
  CONSTRAINT sellers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id)
);
CREATE TABLE public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  username text NOT NULL UNIQUE,
  full_name text,
  role USER-DEFINED DEFAULT 'customer'::user_role,
  avatar_url text,
  bio text,
  points bigint DEFAULT 0,
  fee_percentage integer DEFAULT 10,
  is_active boolean DEFAULT true,
  is_verified boolean DEFAULT false,
  created_at timestamp without time zone DEFAULT now(),
  updated_at timestamp without time zone DEFAULT now(),
  telegram_id bigint,
  telegram_username character varying,
  telegram_link_token character varying,
  CONSTRAINT users_pkey PRIMARY KEY (id)
);
CREATE TABLE public.withdrawals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  seller_id uuid,
  amount_requested integer,
  fee_percentage integer,
  final_amount integer,
  status USER-DEFINED DEFAULT 'pending'::request_status,
  created_at timestamp without time zone DEFAULT now(),
  CONSTRAINT withdrawals_pkey PRIMARY KEY (id),
  CONSTRAINT withdrawals_seller_id_fkey FOREIGN KEY (seller_id) REFERENCES public.users(id)
);