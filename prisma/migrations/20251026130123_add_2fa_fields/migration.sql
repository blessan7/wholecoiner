-- AlterTable
ALTER TABLE "users" ADD COLUMN     "2fa_failed_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "2fa_locked_until" TIMESTAMP(3),
ADD COLUMN     "2fa_pin_hash" TEXT,
ADD COLUMN     "2fa_verified_at" TIMESTAMP(3);
