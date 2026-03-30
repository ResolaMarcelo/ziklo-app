CREATE TABLE "WaitlistEntry" (
  "id"        TEXT NOT NULL,
  "nombre"    TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "tienda"    TEXT,
  "mensaje"   TEXT,
  "status"    TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WaitlistEntry_email_key" ON "WaitlistEntry"("email");
