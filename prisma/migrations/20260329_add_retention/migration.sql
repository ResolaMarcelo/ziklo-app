-- Campos de retención en Shop
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "retentionPauseEnabled"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "retentionDiscountEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "retentionDiscountPct"     INTEGER;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "retentionSurveyEnabled"   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "retentionMessage"         TEXT;

-- Campo descuento aplicado en Subscription
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "retentionDiscountApplied" BOOLEAN NOT NULL DEFAULT false;

-- Tabla para almacenar motivos de cancelación
CREATE TABLE IF NOT EXISTS "CancelReason" (
  "id"             TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "reason"         TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CancelReason_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CancelReason" ADD CONSTRAINT "CancelReason_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE;
