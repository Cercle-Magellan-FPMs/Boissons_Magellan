ALTER TABLE users ADD COLUMN topup_access INTEGER NOT NULL DEFAULT 0;

ALTER TABLE qr_payment_settings ADD COLUMN topup_blocked_message TEXT NOT NULL DEFAULT 'Demander le droit au top-up au comité.';
