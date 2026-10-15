ALTER TABLE "token_refunds"
  ADD CONSTRAINT "token_refunds_external_reference_pair"
  CHECK (("status" = 'external_refund_confirmed') = ("external_refund_reference" IS NOT NULL));
