-- ============================================================
-- Bank Statement Converter — Initial Supabase Schema
-- Run this in the Supabase SQL Editor (or via supabase db push)
-- ============================================================

-- ── users ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 VARCHAR(255) UNIQUE NOT NULL,
  first_name            VARCHAR(100)        NOT NULL,
  password_hash         VARCHAR(255)        NOT NULL,
  plan                  VARCHAR(20)         NOT NULL DEFAULT 'free', -- free | pro
  stripe_customer_id    VARCHAR(255),
  subscription_id       VARCHAR(255),
  conversions_this_month INT              NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
  last_conversion_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ── conversions ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  filename            VARCHAR(255),
  file_size           INT,
  bank_type           VARCHAR(50),   -- nab | westpac | cba | anz | generic
  conversion_time_ms  INT,
  status              VARCHAR(50)    NOT NULL DEFAULT 'success', -- success | failed
  error_message       TEXT,
  created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversions_user_id ON conversions (user_id);
CREATE INDEX IF NOT EXISTS idx_conversions_created_at ON conversions (created_at);

-- ── daily_limits ──────────────────────────────────────────────────────────────
-- Tracks per-IP (anonymous) or per-userId daily conversion counts.
CREATE TABLE IF NOT EXISTS daily_limits (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key       VARCHAR(255) NOT NULL,   -- IP address or user ID
  date      DATE         NOT NULL,
  count     INT          NOT NULL DEFAULT 0,
  unlocked  BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_limits_key_date ON daily_limits (key, date);

-- ── Helper: increment_conversion_count ───────────────────────────────────────
-- Called after a successful conversion for authenticated users.
CREATE OR REPLACE FUNCTION increment_conversion_count(uid UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE users
  SET
    conversions_this_month = conversions_this_month + 1,
    last_conversion_at     = NOW(),
    updated_at             = NOW()
  WHERE id = uid;
END;
$$;

-- ── Auto-reset monthly conversions (optional: run as a scheduled function) ───
-- Reset conversions_this_month on the 1st of each month via pg_cron or Supabase Edge Functions.
-- Example pg_cron (enable via Supabase dashboard > Database > Extensions):
--
-- SELECT cron.schedule(
--   'reset-monthly-conversions',
--   '0 0 1 * *',
--   $$ UPDATE users SET conversions_this_month = 0, updated_at = NOW() $$
-- );

-- ── RLS Policies ─────────────────────────────────────────────────────────────
-- Enable RLS (service role key bypasses these; anon key respects them)
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_limits ENABLE ROW LEVEL SECURITY;

-- Backend uses service role key, so no additional policies needed for server functions.
-- If you ever use the anon key from the frontend, add appropriate policies here.
