/*
  Warnings:

  - A unique constraint covering the columns `[batch_id,type]` on the table `transactions` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "transactions_batch_id_type_key" ON "transactions"("batch_id", "type");
