-- CreateTable
CREATE TABLE "ProductRecommendation" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "targetProductId" TEXT NOT NULL,
    "targetTitle" TEXT,
    "targetImage" TEXT,
    "targetPrice" DOUBLE PRECISION,
    "targetVariantId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecommendation_shopDomain_sourceProductId_targetProdu_key" ON "ProductRecommendation"("shopDomain", "sourceProductId", "targetProductId");

-- CreateIndex
CREATE INDEX "ProductRecommendation_shopDomain_sourceProductId_idx" ON "ProductRecommendation"("shopDomain", "sourceProductId");

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN "pendingUpsells" TEXT;
