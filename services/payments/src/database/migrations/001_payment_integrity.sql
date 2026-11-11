DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payments WHERE provider_mode NOT IN ('LEGACY','EXTERNAL_SIMULATOR')
      OR (provider_mode='EXTERNAL_SIMULATOR' AND reservation_expires_at IS NULL)
      OR (provider_status IS NOT NULL AND provider_status NOT IN ('APPROVED','DECLINED','EXPIRED'))) THEN
    RAISE EXCEPTION 'payment preflight: invalid provider state/mode or missing reservation expiry; audit before migration';
  END IF;
END $$;
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_outcome_check;
ALTER TABLE payments ADD CONSTRAINT payments_outcome_check CHECK(outcome IN ('APPROVED','DECLINED','EXPIRED'));
ALTER TABLE payments ADD CONSTRAINT payment_provider_mode CHECK(provider_mode IN ('LEGACY','EXTERNAL_SIMULATOR'));
ALTER TABLE payments ADD CONSTRAINT payment_provider_status CHECK(provider_status IS NULL OR provider_status IN ('APPROVED','DECLINED','EXPIRED'));
ALTER TABLE payments ADD CONSTRAINT payment_reservation_expiry CHECK(provider_mode<>'EXTERNAL_SIMULATOR' OR reservation_expires_at IS NOT NULL);
