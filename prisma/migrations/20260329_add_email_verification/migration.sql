ALTER TABLE "User" ADD COLUMN "emailVerified"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "verificationCode"   TEXT;
ALTER TABLE "User" ADD COLUMN "verificationExpiry" TIMESTAMP(3);

-- Usuarios existentes (superadmins creados manualmente) quedan verificados
UPDATE "User" SET "emailVerified" = true WHERE "role" = 'superadmin';
