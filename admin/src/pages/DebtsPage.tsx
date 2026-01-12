import { useEffect, useState } from "react";
import { api } from "../lib/api";

type DebtRow = {
  month_key: string;
  user_id: number;
  user_name: string;
  user_email: string | null;
  amount_cents: number;
  status: "invoiced" | "paid";
  generated_at: string;
  paid_at: string | null;
};

function euros(cents: number) {
  return (cents / 100).toFixed(2) + " €";
}

export default function DebtsPage() {
  const [statusFilter, setStatusFilter] = useState<"invoiced" | "paid">("invoiced");
  const [month, setMonth] = useState<string>("");
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [msg, setMsg] = useState<string>("");

  async function load() {
    setMsg("");
    const qs = new URLSearchParams();
    qs.set("status", statusFilter);
    if (month.trim()) qs.set("month_key", month.trim());

    try {
      const data = await api<{ debts: DebtRow[] }>(`/api/admin/debts?${qs.toString()}`);
      setDebts(data.debts);
    } catch (e: any) {
      setMsg("Erreur: " + e.message);
      setDebts([]);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  async function pay(d: DebtRow) {
    if (!confirm(`Marquer payé: ${d.user_name} (${d.month_key}) = ${euros(d.amount_cents)} ?`)) return;
    try {
      await api("/api/admin/debts/pay", {
        method: "POST",
        body: JSON.stringify({ month_key: d.month_key, user_id: d.user_id }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function unpay(d: DebtRow) {
    if (!confirm(`Annuler paiement: ${d.user_name} (${d.month_key}) ?`)) return;
    try {
      await api("/api/admin/debts/unpay", {
        method: "POST",
        body: JSON.stringify({ month_key: d.month_key, user_id: d.user_id }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const total = debts.reduce((s, d) => s + d.amount_cents, 0);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Dettes</h2>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Statut{" "}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="invoiced">Impayées</option>
            <option value="paid">Payées</option>
          </select>
        </label>

        <label>
          Mois (YYYY-MM){" "}
          <input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="2026-01" />
        </label>

        <button onClick={load}>Rafraîchir</button>

        <span style={{ opacity: 0.7 }}>
          Total affiché : <b>{euros(total)}</b>
        </span>
      </div>

      {msg && (
        <div style={{ padding: 10, border: "1px solid #a33", borderRadius: 10 }}>
          {msg}
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {debts.map((d) => (
          <div
            key={`${d.month_key}-${d.user_id}`}
            style={{
              border: "1px solid #444",
              borderRadius: 10,
              padding: 10,
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 900 }}>{d.user_name}</div>
              <div style={{ opacity: 0.7 }}>{d.user_email || "—"}</div>
            </div>

            <div>
              <div style={{ fontWeight: 800 }}>{d.month_key}</div>
              <div style={{ opacity: 0.7 }}>{d.status === "paid" ? "Payée" : "Impayée"}</div>
            </div>

            <div>
              <div style={{ fontWeight: 900 }}>{euros(d.amount_cents)}</div>
              <div style={{ opacity: 0.7 }}>{d.paid_at ? `Payé: ${d.paid_at}` : ""}</div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {d.status === "invoiced" ? (
                <button onClick={() => pay(d)} style={{ fontWeight: 900 }}>Marquer payé</button>
              ) : (
                <button onClick={() => unpay(d)}>Annuler</button>
              )}
            </div>
          </div>
        ))}

        {debts.length === 0 && <p style={{ opacity: 0.7 }}>Aucune dette trouvée.</p>}
      </div>
    </section>
  );
}
