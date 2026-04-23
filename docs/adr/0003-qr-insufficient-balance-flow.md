# ADR 0003 - QR EPC v2 Flow for Insufficient Balance

## Context
Users can hit insufficient prepaid balance at checkout. The project needs a fallback payment path while keeping backend authoritative.

## Decision
- Generate EPC v2 QR via backend (`/api/kiosk/qr-code/prepare`).
- Do not persist anything on prepare.
- Use signed intent token (`user_id`, `amount_cents`, `unique_id`, expiry).
- Persist and commit order only on `/api/kiosk/qr-code/confirm`.
- Force EPC remittance in unstructured field (structured field empty).
- Store declaration in `qr_code_payments` with later admin verification.

## Consequences
- No false payment record on simple QR display.
- Reduced tampering risk from signed intent token.
- Verification remains a separate admin operation.
