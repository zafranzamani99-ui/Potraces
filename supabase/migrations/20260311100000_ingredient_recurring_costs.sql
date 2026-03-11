-- Ingredient costs
CREATE TABLE IF NOT EXISTS public.seller_ingredient_costs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id        text,
  description     text NOT NULL,
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  date            timestamptz NOT NULL DEFAULT now(),
  season_local_id text,
  product_id      text,
  synced_to_personal boolean NOT NULL DEFAULT false,
  personal_transaction_id text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_ingredient_costs_user_id_idx ON public.seller_ingredient_costs(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS seller_ingredient_costs_user_local_idx ON public.seller_ingredient_costs(user_id, local_id);

ALTER TABLE public.seller_ingredient_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller_ingredient_costs_owner" ON public.seller_ingredient_costs FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER seller_ingredient_costs_updated_at BEFORE UPDATE ON public.seller_ingredient_costs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Recurring costs
CREATE TABLE IF NOT EXISTS public.seller_recurring_costs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id        text,
  description     text NOT NULL,
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  frequency       text NOT NULL DEFAULT 'monthly',
  next_due        timestamptz NOT NULL DEFAULT now(),
  season_local_id text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_recurring_costs_user_id_idx ON public.seller_recurring_costs(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS seller_recurring_costs_user_local_idx ON public.seller_recurring_costs(user_id, local_id);

ALTER TABLE public.seller_recurring_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller_recurring_costs_owner" ON public.seller_recurring_costs FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER seller_recurring_costs_updated_at BEFORE UPDATE ON public.seller_recurring_costs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Cost templates
CREATE TABLE IF NOT EXISTS public.seller_cost_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id    text,
  description text NOT NULL,
  amount      numeric(12,2) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seller_cost_templates_user_id_idx ON public.seller_cost_templates(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS seller_cost_templates_user_local_idx ON public.seller_cost_templates(user_id, local_id);

ALTER TABLE public.seller_cost_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seller_cost_templates_owner" ON public.seller_cost_templates FOR ALL USING (auth.uid() = user_id);

CREATE TRIGGER seller_cost_templates_updated_at BEFORE UPDATE ON public.seller_cost_templates FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Add updated_at to seller_seasons and seller_customers (missing from original schema)
ALTER TABLE public.seller_seasons ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.seller_customers ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER seller_seasons_updated_at BEFORE UPDATE ON public.seller_seasons FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER seller_customers_updated_at BEFORE UPDATE ON public.seller_customers FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
