#!/usr/bin/env bash
set -euo pipefail

DB_PATH="${1:-/var/lib/boissons/app.db}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "[ERREUR] Base SQLite introuvable: $DB_PATH" >&2
  exit 1
fi

echo "[INFO] Reset partiel sur: $DB_PATH"

echo "[INFO] Comptage avant reset..."
sqlite3 "$DB_PATH" <<'SQL'
SELECT 'stock_current_rows', COUNT(*) FROM stock_current;
SELECT 'stock_moves_rows', COUNT(*) FROM stock_moves;
SELECT 'topup_rows', COUNT(*) FROM account_transactions WHERE reason = 'topup';
SELECT 'billing_periods_rows', COUNT(*) FROM billing_periods;
SELECT 'period_debts_rows', COUNT(*) FROM period_debts;
SELECT 'monthly_debts_rows', COUNT(*) FROM monthly_debts;
SELECT 'debt_mail_log_rows', COUNT(*) FROM debt_mail_log;
SQL

sqlite3 "$DB_PATH" <<'SQL'
PRAGMA foreign_keys = ON;
BEGIN IMMEDIATE;

-- 1) RESET STOCKS
UPDATE stock_current
SET qty = 0;
DELETE FROM stock_moves;

-- 2) RESET TOP-UPS
-- On retire l'effet des top-ups du solde courant, puis on supprime les lignes top-up.
UPDATE users
SET balance_cents = balance_cents - COALESCE((
  SELECT SUM(at.delta_cents)
  FROM account_transactions at
  WHERE at.user_id = users.id
    AND at.reason = 'topup'
), 0);

DELETE FROM account_transactions
WHERE reason = 'topup';

-- 3) RESET PÉRIODES / DETTES CLOTURÉES
DELETE FROM period_debts;
DELETE FROM billing_periods;
DELETE FROM monthly_debts;
DELETE FROM debt_mail_log;

COMMIT;
SQL

echo "[INFO] Comptage après reset..."
sqlite3 "$DB_PATH" <<'SQL'
SELECT 'stock_current_non_zero_qty', COUNT(*) FROM stock_current WHERE qty <> 0;
SELECT 'stock_moves_rows', COUNT(*) FROM stock_moves;
SELECT 'topup_rows', COUNT(*) FROM account_transactions WHERE reason = 'topup';
SELECT 'billing_periods_rows', COUNT(*) FROM billing_periods;
SELECT 'period_debts_rows', COUNT(*) FROM period_debts;
SELECT 'monthly_debts_rows', COUNT(*) FROM monthly_debts;
SELECT 'debt_mail_log_rows', COUNT(*) FROM debt_mail_log;
SQL

echo "[OK] Reset terminé."
