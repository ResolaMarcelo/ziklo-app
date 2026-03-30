-- Titular personalizado del widget de suscripción por shop
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "widgetTitle" TEXT;
