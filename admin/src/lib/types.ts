export type AdminProduct = {
  id: number;
  name: string;
  is_active: number;     // 1/0
  qty: number;
  price_cents: number | null;
  image_slug?: string | null;
};

export type AdminUser = {
  id: number;
  name: string;
  email: string | null;
  rfid_uid: string | null;
  badge_uids: string[];
  is_active: number;
  created_at: string;
  balance_cents: number;
};

export function eurosFromCents(cents: number | null) {
  if (cents == null) return "—";
  return (cents / 100).toFixed(2) + " €";
}
