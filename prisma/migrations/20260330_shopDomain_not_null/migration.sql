-- Eliminar registros huérfanos sin shopDomain (no deberían existir en producción)
-- Si existen, son datos corruptos que no pueden vincularse a ningún merchant.
DELETE FROM "Subscription" WHERE "shopDomain" IS NULL;
DELETE FROM "Plan"         WHERE "shopDomain" IS NULL;

-- Hacer shopDomain NOT NULL en Plan y Subscription
ALTER TABLE "Plan"         ALTER COLUMN "shopDomain" SET NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "shopDomain" SET NOT NULL;
