-- CreateEnum
CREATE TYPE "InternalTransferState" AS ENUM ('PREPARED', 'SUBMITTED', 'CONFIRMED', 'FAILED');

-- CreateTable
CREATE TABLE "internal_transfers" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "source_user_id" TEXT,
    "source_address" TEXT NOT NULL,
    "destination_address" TEXT NOT NULL,
    "lamports" BIGINT NOT NULL,
    "memo" TEXT,
    "signature" TEXT,
    "state" "InternalTransferState" NOT NULL DEFAULT 'PREPARED',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "internal_transfers_batch_id_key" ON "internal_transfers"("batch_id");

-- CreateIndex
CREATE INDEX "internal_transfers_admin_user_id_idx" ON "internal_transfers"("admin_user_id");

-- CreateIndex
CREATE INDEX "internal_transfers_source_user_id_idx" ON "internal_transfers"("source_user_id");

-- CreateIndex
CREATE INDEX "internal_transfers_state_idx" ON "internal_transfers"("state");

-- CreateIndex
CREATE INDEX "internal_transfers_created_at_idx" ON "internal_transfers"("created_at");

-- AddPrimaryKey
ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_pkey" PRIMARY KEY ("id");

-- AddForeignKey
ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_transfers" ADD CONSTRAINT "internal_transfers_source_user_id_fkey" FOREIGN KEY ("source_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

