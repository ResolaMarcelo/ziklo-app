-- Multi-tenancy: add shopDomain to Plan and Subscription, mpAccessToken to Shop

-- Shop: Mercado Pago token por tienda
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "mpAccessToken" TEXT;

-- Plan: a qué tienda pertenece
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "shopDomain" TEXT;

-- Subscription: a qué tienda pertenece
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "shopDomain" TEXT;

-- Indexes para performance
CREATE INDEX IF NOT EXISTS "Plan_shopDomain_idx" ON "Plan"("shopDomain");
CREATE INDEX IF NOT EXISTS "Subscription_shopDomain_idx" ON "Subscription"("shopDomain");
