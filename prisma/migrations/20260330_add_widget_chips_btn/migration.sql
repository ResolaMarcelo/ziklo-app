-- Chips y texto del botón personalizables en el widget
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "widgetChips"   TEXT;
ALTER TABLE "Shop" ADD COLUMN IF NOT EXISTS "widgetBtnText" TEXT;
