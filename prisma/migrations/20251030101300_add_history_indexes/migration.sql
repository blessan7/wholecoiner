-- CreateIndex
CREATE INDEX "transactions_goal_id_timestamp_idx" ON "transactions"("goal_id", "timestamp");

-- CreateIndex
CREATE INDEX "transactions_token_mint_idx" ON "transactions"("token_mint");
