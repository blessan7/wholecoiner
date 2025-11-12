-- Rename goal contribution column to USD-specific name
ALTER TABLE "goals"
  RENAME COLUMN "amount_inr" TO "amount_per_interval_usd";

-- Rename transaction amount column to USD
ALTER TABLE "transactions"
  RENAME COLUMN "amount_inr" TO "amount_usd";

