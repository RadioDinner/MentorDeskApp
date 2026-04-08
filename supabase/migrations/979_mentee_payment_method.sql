-- ============================================================================
-- MIGRATION 979: Add payment_method column to mentees
-- ============================================================================
-- Stores masked payment method info (card brand, last 4, expiry).
-- In production, actual card data is handled by Stripe/payment processor.
-- ============================================================================

ALTER TABLE public.mentees
  ADD COLUMN IF NOT EXISTS payment_method jsonb;
