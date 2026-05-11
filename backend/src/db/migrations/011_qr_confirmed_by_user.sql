-- 011_qr_confirmed_by_user.sql
ALTER TABLE qr_code_payments ADD COLUMN confirmed_by_user INTEGER NOT NULL DEFAULT 0;
ALTER TABLE topup_qr_requests ADD COLUMN confirmed_by_user INTEGER NOT NULL DEFAULT 0;
