-- Wrap auth.uid() in (select ...) so PostgreSQL evaluates it once per query
-- instead of once per row. ~10x improvement on bulk inserts/selects.
-- See: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ── Seller schema ────────────────────────────────────────────
drop policy if exists "seller_profiles_owner" on public.seller_profiles;
create policy "seller_profiles_owner" on public.seller_profiles
  for all using ((select auth.uid()) = user_id);

drop policy if exists "seller_products_owner" on public.seller_products;
create policy "seller_products_owner" on public.seller_products
  for all using ((select auth.uid()) = user_id);

drop policy if exists "seller_seasons_owner" on public.seller_seasons;
create policy "seller_seasons_owner" on public.seller_seasons
  for all using ((select auth.uid()) = user_id);

drop policy if exists "seller_orders_owner" on public.seller_orders;
create policy "seller_orders_owner" on public.seller_orders
  for all using ((select auth.uid()) = user_id);

drop policy if exists "seller_customers_owner" on public.seller_customers;
create policy "seller_customers_owner" on public.seller_customers
  for all using ((select auth.uid()) = user_id);

-- ── Ingredient / recurring costs ─────────────────────────────
drop policy if exists "seller_ingredient_costs_owner" on public.seller_ingredient_costs;
create policy "seller_ingredient_costs_owner" on public.seller_ingredient_costs
  for all using ((select auth.uid()) = user_id);

drop policy if exists "seller_recurring_costs_owner" on public.seller_recurring_costs;
create policy "seller_recurring_costs_owner" on public.seller_recurring_costs
  for all using ((select auth.uid()) = user_id);

drop policy if exists "seller_cost_templates_owner" on public.seller_cost_templates;
create policy "seller_cost_templates_owner" on public.seller_cost_templates
  for all using ((select auth.uid()) = user_id);

-- ── Personal sync ────────────────────────────────────────────
drop policy if exists "personal_transactions_owner" on public.personal_transactions;
create policy "personal_transactions_owner" on public.personal_transactions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "personal_wallets_owner" on public.personal_wallets;
create policy "personal_wallets_owner" on public.personal_wallets
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "personal_wallet_transfers_owner" on public.personal_wallet_transfers;
create policy "personal_wallet_transfers_owner" on public.personal_wallet_transfers
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "personal_subscriptions_owner" on public.personal_subscriptions;
create policy "personal_subscriptions_owner" on public.personal_subscriptions
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "personal_budgets_owner" on public.personal_budgets;
create policy "personal_budgets_owner" on public.personal_budgets
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "personal_goals_owner" on public.personal_goals;
create policy "personal_goals_owner" on public.personal_goals
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "personal_debts_owner" on public.personal_debts;
create policy "personal_debts_owner" on public.personal_debts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "personal_splits_owner" on public.personal_splits;
create policy "personal_splits_owner" on public.personal_splits
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "personal_contacts_owner" on public.personal_contacts;
create policy "personal_contacts_owner" on public.personal_contacts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "personal_savings_accounts_owner" on public.personal_savings_accounts;
create policy "personal_savings_accounts_owner" on public.personal_savings_accounts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "personal_receipts_owner" on public.personal_receipts;
create policy "personal_receipts_owner" on public.personal_receipts
  for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ── User profiles (referrals) ────────────────────────────────
drop policy if exists "user_profiles_owner_read" on public.user_profiles;
create policy "user_profiles_owner_read" on public.user_profiles
  for select using ((select auth.uid()) = user_id);

drop policy if exists "user_profiles_owner_insert" on public.user_profiles;
create policy "user_profiles_owner_insert" on public.user_profiles
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "user_profiles_owner_update" on public.user_profiles;
create policy "user_profiles_owner_update" on public.user_profiles
  for update using ((select auth.uid()) = user_id);

-- ── Referrals party read ─────────────────────────────────────
drop policy if exists "referrals_party_read" on public.referrals;
create policy "referrals_party_read" on public.referrals
  for select using ((select auth.uid()) = referrer_user_id or (select auth.uid()) = referred_user_id);

-- ── OTP verifications ────────────────────────────────────────
drop policy if exists "otp_own_read" on public.otp_verifications;
create policy "otp_own_read" on public.otp_verifications
  for select using ((select auth.uid()) = user_id);

-- ── AI usage ─────────────────────────────────────────────────
drop policy if exists "ai_usage_owner_read" on public.ai_usage;
create policy "ai_usage_owner_read" on public.ai_usage
  for select using ((select auth.uid()) = user_id);
