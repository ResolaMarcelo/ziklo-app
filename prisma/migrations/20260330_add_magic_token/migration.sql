-- Magic link tokens para autenticación del portal /cliente
CREATE TABLE IF NOT EXISTS "MagicToken" (
  "id"         TEXT         NOT NULL,
  "email"      TEXT         NOT NULL,
  "shopDomain" TEXT         NOT NULL,
  "token"      TEXT         NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "usedAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MagicToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MagicToken_token_key" ON "MagicToken"("token");
CREATE INDEX IF NOT EXISTS "MagicToken_email_shopDomain_idx" ON "MagicToken"("email", "shopDomain");
