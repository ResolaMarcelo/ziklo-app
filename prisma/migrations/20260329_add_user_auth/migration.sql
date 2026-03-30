-- CreateTable User
CREATE TABLE "User" (
  "id"           TEXT NOT NULL,
  "email"        TEXT NOT NULL,
  "passwordHash" TEXT,
  "googleId"     TEXT,
  "name"         TEXT,
  "role"         TEXT NOT NULL DEFAULT 'merchant',
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key"    ON "User"("email");
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

-- CreateTable UserShop
CREATE TABLE "UserShop" (
  "userId"     TEXT NOT NULL,
  "shopDomain" TEXT NOT NULL,
  CONSTRAINT "UserShop_pkey" PRIMARY KEY ("userId", "shopDomain")
);

ALTER TABLE "UserShop"
  ADD CONSTRAINT "UserShop_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserShop"
  ADD CONSTRAINT "UserShop_shopDomain_fkey"
  FOREIGN KEY ("shopDomain") REFERENCES "Shop"("domain") ON DELETE CASCADE ON UPDATE CASCADE;
