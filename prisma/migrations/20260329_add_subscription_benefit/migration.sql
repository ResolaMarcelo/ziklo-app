-- Add subscription benefit config fields to Shop
ALTER TABLE "Shop" ADD COLUMN "subBenefitType" TEXT;
ALTER TABLE "Shop" ADD COLUMN "subBenefitValue" TEXT;

-- Add per-product benefit override fields to ProductSubscription
ALTER TABLE "ProductSubscription" ADD COLUMN "benefitType" TEXT;
ALTER TABLE "ProductSubscription" ADD COLUMN "benefitValue" TEXT;
