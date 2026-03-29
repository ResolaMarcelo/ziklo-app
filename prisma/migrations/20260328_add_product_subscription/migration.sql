-- CreateTable
CREATE TABLE "ProductSubscription" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT,
    "productImage" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSubscription_shopDomain_idx" ON "ProductSubscription"("shopDomain");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSubscription_shopDomain_productId_key" ON "ProductSubscription"("shopDomain", "productId");
