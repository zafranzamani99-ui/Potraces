-- ============================================================
-- Potraces — Personal Mode Sync Schema
-- ============================================================
-- Opt-in cloud sync for personal mode. Users authenticate with
-- phone+OTP (reusing business auth). All personal data scoped to
-- auth.uid(). Mirrors seller_* table conventions:
--   - local_id: client-generated identifier (text)
--   - (user_id, local_id) unique index for upsert conflict target
--   - updated_at triggers for last-write-wins merge
--   - RLS: owner full access (auth.uid() = user_id)
-- ============================================================

create extension if not exists "pgcrypto";

-- Reuse existing updated_at handler from seller schema if present
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── TRANSACTIONS ─────────────────────────────────────────────
create table if not exists public.personal_transactions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_id          text not null,
  amount            numeric(14,2) not null default 0,
  category          text,
  description       text,
  date              timestamptz not null,
  type              text not null check (type in ('income','expense')),
  wallet_local_id   text,
  edit_log          jsonb not null default '[]',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─── WALLETS ──────────────────────────────────────────────────
create table if not exists public.personal_wallets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  local_id        text not null,
  name            text not null,
  type            text not null default 'bank',
  balance         numeric(14,2) not null default 0,
  is_default      boolean not null default false,
  used_credit     numeric(14,2),
  credit_limit    numeric(14,2),
  color           text,
  icon            text,
  bank_name       text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── WALLET TRANSFERS ─────────────────────────────────────────
create table if not exists public.personal_wallet_transfers (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  local_id               text not null,
  from_wallet_local_id   text,
  to_wallet_local_id     text,
  amount                 numeric(14,2) not null default 0,
  date                   timestamptz not null,
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ─── SUBSCRIPTIONS ────────────────────────────────────────────
create table if not exists public.personal_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  local_id           text not null,
  name               text not null,
  amount             numeric(14,2) not null default 0,
  billing_cycle      text not null default 'monthly',
  start_date         timestamptz not null,
  next_billing_date  timestamptz not null,
  category           text,
  wallet_local_id    text,
  is_active          boolean not null default true,
  is_paused          boolean not null default false,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ─── BUDGETS ──────────────────────────────────────────────────
create table if not exists public.personal_budgets (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_id          text not null,
  category          text not null,
  allocated_amount  numeric(14,2) not null default 0,
  spent_amount      numeric(14,2) not null default 0,
  period            text not null default 'monthly',
  start_date        timestamptz not null,
  end_date          timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ─── GOALS ────────────────────────────────────────────────────
create table if not exists public.personal_goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  local_id         text not null,
  name             text not null,
  target_amount    numeric(14,2) not null default 0,
  current_amount   numeric(14,2) not null default 0,
  deadline         timestamptz,
  category         text,
  contributions    jsonb not null default '[]',
  milestones       jsonb not null default '[]',
  is_paused        boolean not null default false,
  is_archived      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ─── DEBTS ────────────────────────────────────────────────────
-- Payments stored as jsonb array on the debt row (mirrors local shape).
-- Edit log for payments travels with the payment object.
create table if not exists public.personal_debts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  local_id       text not null,
  contact_name   text not null,
  contact_phone  text,
  type           text not null check (type in ('i_owe','they_owe')),
  total_amount   numeric(14,2) not null default 0,
  paid_amount    numeric(14,2) not null default 0,
  status         text not null default 'pending',
  payments       jsonb not null default '[]',
  due_date       timestamptz,
  note           text,
  wallet_local_id text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─── SPLITS ───────────────────────────────────────────────────
create table if not exists public.personal_splits (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  local_id             text not null,
  title                text not null,
  total_amount         numeric(14,2) not null default 0,
  participants         jsonb not null default '[]',
  my_participant_id    text,
  category             text,
  date                 timestamptz not null,
  note                 text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ─── CONTACTS ─────────────────────────────────────────────────
create table if not exists public.personal_contacts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  local_id    text not null,
  name        text not null,
  phone       text,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── SAVINGS ACCOUNTS ─────────────────────────────────────────
create table if not exists public.personal_savings_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  local_id       text not null,
  name           text not null,
  balance        numeric(14,2) not null default 0,
  target_amount  numeric(14,2),
  note           text,
  snapshots      jsonb not null default '[]',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ─── RECEIPTS (metadata only — images deferred) ───────────────
create table if not exists public.personal_receipts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  local_id               text not null,
  vendor                 text,
  items                  jsonb not null default '[]',
  total                  numeric(14,2) not null default 0,
  date                   timestamptz not null,
  year                   int,
  my_tax_category        text,
  transaction_local_id   text,
  image_url              text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ─── UPDATED_AT TRIGGERS ──────────────────────────────────────
create trigger personal_transactions_updated_at
  before update on public.personal_transactions
  for each row execute function public.handle_updated_at();

create trigger personal_wallets_updated_at
  before update on public.personal_wallets
  for each row execute function public.handle_updated_at();

create trigger personal_wallet_transfers_updated_at
  before update on public.personal_wallet_transfers
  for each row execute function public.handle_updated_at();

create trigger personal_subscriptions_updated_at
  before update on public.personal_subscriptions
  for each row execute function public.handle_updated_at();

create trigger personal_budgets_updated_at
  before update on public.personal_budgets
  for each row execute function public.handle_updated_at();

create trigger personal_goals_updated_at
  before update on public.personal_goals
  for each row execute function public.handle_updated_at();

create trigger personal_debts_updated_at
  before update on public.personal_debts
  for each row execute function public.handle_updated_at();

create trigger personal_splits_updated_at
  before update on public.personal_splits
  for each row execute function public.handle_updated_at();

create trigger personal_contacts_updated_at
  before update on public.personal_contacts
  for each row execute function public.handle_updated_at();

create trigger personal_savings_accounts_updated_at
  before update on public.personal_savings_accounts
  for each row execute function public.handle_updated_at();

create trigger personal_receipts_updated_at
  before update on public.personal_receipts
  for each row execute function public.handle_updated_at();

-- ─── UPSERT CONFLICT INDEXES ──────────────────────────────────
-- Full (non-partial) unique indexes — PostgREST cannot use partial
-- indexes as upsert conflict targets. Same lesson as seller fix.
create unique index if not exists personal_transactions_user_local_idx
  on public.personal_transactions(user_id, local_id);

create unique index if not exists personal_wallets_user_local_idx
  on public.personal_wallets(user_id, local_id);

create unique index if not exists personal_wallet_transfers_user_local_idx
  on public.personal_wallet_transfers(user_id, local_id);

create unique index if not exists personal_subscriptions_user_local_idx
  on public.personal_subscriptions(user_id, local_id);

create unique index if not exists personal_budgets_user_local_idx
  on public.personal_budgets(user_id, local_id);

create unique index if not exists personal_goals_user_local_idx
  on public.personal_goals(user_id, local_id);

create unique index if not exists personal_debts_user_local_idx
  on public.personal_debts(user_id, local_id);

create unique index if not exists personal_splits_user_local_idx
  on public.personal_splits(user_id, local_id);

create unique index if not exists personal_contacts_user_local_idx
  on public.personal_contacts(user_id, local_id);

create unique index if not exists personal_savings_accounts_user_local_idx
  on public.personal_savings_accounts(user_id, local_id);

create unique index if not exists personal_receipts_user_local_idx
  on public.personal_receipts(user_id, local_id);

-- ─── LOOKUP INDEXES ───────────────────────────────────────────
create index if not exists personal_transactions_user_id_idx on public.personal_transactions(user_id);
create index if not exists personal_transactions_date_idx    on public.personal_transactions(date desc);
create index if not exists personal_wallets_user_id_idx      on public.personal_wallets(user_id);
create index if not exists personal_subscriptions_user_id_idx on public.personal_subscriptions(user_id);
create index if not exists personal_budgets_user_id_idx      on public.personal_budgets(user_id);
create index if not exists personal_goals_user_id_idx        on public.personal_goals(user_id);
create index if not exists personal_debts_user_id_idx        on public.personal_debts(user_id);
create index if not exists personal_splits_user_id_idx       on public.personal_splits(user_id);
create index if not exists personal_contacts_user_id_idx     on public.personal_contacts(user_id);
create index if not exists personal_savings_user_id_idx      on public.personal_savings_accounts(user_id);
create index if not exists personal_receipts_user_id_idx     on public.personal_receipts(user_id);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────
alter table public.personal_transactions       enable row level security;
alter table public.personal_wallets            enable row level security;
alter table public.personal_wallet_transfers   enable row level security;
alter table public.personal_subscriptions      enable row level security;
alter table public.personal_budgets            enable row level security;
alter table public.personal_goals              enable row level security;
alter table public.personal_debts              enable row level security;
alter table public.personal_splits             enable row level security;
alter table public.personal_contacts           enable row level security;
alter table public.personal_savings_accounts   enable row level security;
alter table public.personal_receipts           enable row level security;

-- Owner full access on every personal table
create policy "personal_transactions_owner"     on public.personal_transactions     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_wallets_owner"          on public.personal_wallets          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_wallet_transfers_owner" on public.personal_wallet_transfers for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_subscriptions_owner"    on public.personal_subscriptions    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_budgets_owner"          on public.personal_budgets          for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_goals_owner"            on public.personal_goals            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_debts_owner"            on public.personal_debts            for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_splits_owner"           on public.personal_splits           for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_contacts_owner"         on public.personal_contacts         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_savings_accounts_owner" on public.personal_savings_accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "personal_receipts_owner"         on public.personal_receipts         for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
