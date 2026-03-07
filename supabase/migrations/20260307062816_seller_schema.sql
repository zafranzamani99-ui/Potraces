-- ============================================================
-- Potraces — Seller Mode Schema
-- ============================================================
-- Auth: Supabase anonymous auth. Each device signs in as anon
-- user on first launch. All seller data scoped to auth.uid().
-- Public order link: customers can read products + submit orders
-- for a seller identified by their public slug.
-- ============================================================

create extension if not exists "pgcrypto";

-- ─── SELLER PROFILES ──────────────────────────────────────────
create table if not exists public.seller_profiles (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  display_name text,
  slug         text unique,
  currency     text not null default 'RM',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint seller_profiles_user_id_unique unique (user_id)
);

-- ─── PRODUCTS ─────────────────────────────────────────────────
create table if not exists public.seller_products (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  local_id       text,
  name           text not null,
  price_per_unit numeric(12,2) not null default 0,
  cost_per_unit  numeric(12,2),
  unit           text not null default 'piece',
  is_active      boolean not null default true,
  total_sold     numeric(12,2) not null default 0,
  track_stock    boolean not null default false,
  stock_quantity numeric(12,2),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─── SEASONS ──────────────────────────────────────────────────
create table if not exists public.seller_seasons (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  local_id       text,
  name           text not null,
  start_date     timestamptz not null,
  end_date       timestamptz,
  is_active      boolean not null default true,
  note           text,
  cost_budget    numeric(12,2),
  revenue_target numeric(12,2),
  created_at     timestamptz not null default now()
);

-- ─── ORDERS ───────────────────────────────────────────────────
create table if not exists public.seller_orders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade,
  local_id         text,
  order_number     text,
  items            jsonb not null default '[]',
  customer_name    text,
  customer_phone   text,
  customer_address text,
  total_amount     numeric(12,2) not null default 0,
  status           text not null default 'pending',
  is_paid          boolean not null default false,
  paid_amount      numeric(12,2),
  payment_method   text,
  paid_at          timestamptz,
  note             text,
  raw_whatsapp     text,
  delivery_date    timestamptz,
  season_local_id  text,
  source           text not null default 'app',
  seller_id        uuid references public.seller_profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─── CUSTOMERS ────────────────────────────────────────────────
create table if not exists public.seller_customers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_id   text,
  name       text not null,
  phone      text,
  address    text,
  note       text,
  is_vip     boolean not null default false,
  created_at timestamptz not null default now()
);

-- ─── UPDATED_AT TRIGGER ───────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger seller_profiles_updated_at
  before update on public.seller_profiles
  for each row execute function public.handle_updated_at();

create trigger seller_products_updated_at
  before update on public.seller_products
  for each row execute function public.handle_updated_at();

create trigger seller_orders_updated_at
  before update on public.seller_orders
  for each row execute function public.handle_updated_at();

-- ─── INDEXES ──────────────────────────────────────────────────
create index if not exists seller_products_user_id_idx  on public.seller_products(user_id);
create index if not exists seller_orders_user_id_idx    on public.seller_orders(user_id);
create index if not exists seller_orders_seller_id_idx  on public.seller_orders(seller_id);
create index if not exists seller_seasons_user_id_idx   on public.seller_seasons(user_id);
create index if not exists seller_customers_user_id_idx on public.seller_customers(user_id);
create index if not exists seller_profiles_slug_idx     on public.seller_profiles(slug);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────
alter table public.seller_profiles  enable row level security;
alter table public.seller_products  enable row level security;
alter table public.seller_seasons   enable row level security;
alter table public.seller_orders    enable row level security;
alter table public.seller_customers enable row level security;

-- Seller profiles: owner full access
create policy "seller_profiles_owner" on public.seller_profiles
  for all using (auth.uid() = user_id);

-- Seller profiles: public can read slug + display_name for order link
create policy "seller_profiles_public_read" on public.seller_profiles
  for select using (slug is not null);

-- Products: owner full access
create policy "seller_products_owner" on public.seller_products
  for all using (auth.uid() = user_id);

-- Products: public can read active products (order link page)
create policy "seller_products_public_read" on public.seller_products
  for select using (is_active = true);

-- Seasons: owner full access
create policy "seller_seasons_owner" on public.seller_seasons
  for all using (auth.uid() = user_id);

-- Orders: owner full access
create policy "seller_orders_owner" on public.seller_orders
  for all using (auth.uid() = user_id);

-- Orders: customers can insert via order link (user_id null, source = order_link)
create policy "seller_orders_customer_insert" on public.seller_orders
  for insert with check (
    user_id is null
    and source = 'order_link'
    and seller_id is not null
  );

-- Customers: owner full access
create policy "seller_customers_owner" on public.seller_customers
  for all using (auth.uid() = user_id);

-- ─── REALTIME ─────────────────────────────────────────────────
alter publication supabase_realtime add table public.seller_orders;
