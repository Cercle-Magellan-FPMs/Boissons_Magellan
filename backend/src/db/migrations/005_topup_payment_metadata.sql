ALTER TABLE account_transactions ADD COLUMN payment_date TEXT;
ALTER TABLE account_transactions ADD COLUMN payment_method TEXT CHECK(payment_method IN ('bank_transfer', 'cash'));

CREATE INDEX IF NOT EXISTS idx_account_transactions_reason_created
ON account_transactions(reason, created_at DESC);
