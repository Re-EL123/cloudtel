-- 013: subscriptions (plan and entitlements; one row per organisation)
CREATE TABLE subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL UNIQUE REFERENCES organisations (id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'trial' CHECK (char_length(plan) <= 40),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'past_due', 'cancelled', 'trialing')),
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_customer_id text,
  period_start timestamptz,
  period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_status ON subscriptions (status);
