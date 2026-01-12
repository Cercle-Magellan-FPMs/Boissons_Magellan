export type AdminProduct = {
  id: number;
  name: string;
  is_active: number;     // 1/0
  qty: number;
  price_cents: number | null;
};

export function eurosFromCents(cents: number | null) {
  if (cents == null) return "—";
  return (cents / 100).toFixed(2) + " €";
}
