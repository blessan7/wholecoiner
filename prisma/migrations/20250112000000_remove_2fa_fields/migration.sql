-- AlterTable
ALTER TABLE "users" 
  DROP COLUMN IF EXISTS "2fa_enabled",
  DROP COLUMN IF EXISTS "2fa_hash",
  DROP COLUMN IF EXISTS "2fa_failed_attempts",
  DROP COLUMN IF EXISTS "2fa_locked_until",
  DROP COLUMN IF EXISTS "2fa_pin_hash",
  DROP COLUMN IF EXISTS "2fa_verified_at";

