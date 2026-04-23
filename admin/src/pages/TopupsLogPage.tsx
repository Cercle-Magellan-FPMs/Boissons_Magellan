import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type TopupRow = {
  id: string;
  user_id: number;
  user_name: string;
  user_email: string | null;
  delta_cents: number;
  comment: string;
  payment_date: string | null;
  payment_method: "bank_transfer" | "cash" | null;
  created_at: string;
};

function euros(cents: number) {
  return (cents / 100).toFixed(2) + " EUR";
}

const today = new Date().toISOString().slice(0, 10);

export default function TopupsLogPage() {
  const [rows, setRows] = useState<TopupRow[]>([]);
  const [error, setError] = useState("");
  const [nameFilter, setNameFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(today);
  const [methodFilter, setMethodFilter] = useState<"" | "bank_transfer" | "cash">("");

  async function load() {
    setError("");
    try {
      const qs = new URLSearchParams();
      if (nameFilter.trim()) qs.set("name", nameFilter.trim());
      if (fromDate) qs.set("from", fromDate);
      if (toDate) qs.set("to", toDate);
      if (methodFilter) qs.set("method", methodFilter);
      const data = await api<{ topups: TopupRow[] }>(`/api/admin/topups?${qs.toString()}`);
      setRows(data.topups);
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    }
  }

  useEffect(() => {
    load();
  }, [nameFilter, fromDate, toDate, methodFilter]);

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.delta_cents ?? 0), 0),
    [rows]
  );

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Log des top-ups</h2>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Nom :{" "}
          <input
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Raphaël aka best admin"
          />
        </label>

        <label>
          Du :{" "}
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </label>

        <label>
          Au :{" "}
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </label>

        <label>
          Méthode :{" "}
          <select value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as any)}>
            <option value="">Toutes</option>
            <option value="bank_transfer">Virement</option>
            <option value="cash">Paiement liquide</option>
          </select>
        </label>

        <span style={{ opacity: 0.7 }}>
          Total affiché : <b>{euros(total)}</b>
        </span>
      </div>

      {error && (
        <div style={{ padding: 10, border: "1px solid #a33", borderRadius: 10 }}>
          Erreur: {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((row) => (
          <div
            key={row.id}
            style={{
              border: "1px solid #444",
              borderRadius: 10,
              padding: 10,
              display: "grid",
              gridTemplateColumns: "2fr 1.3fr 1fr 2fr",
              gap: 8,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 900 }}>{row.user_name}</div>
              <div style={{ opacity: 0.7 }}>{row.user_email || "--"}</div>
            </div>
            <div>
              <div style={{ fontWeight: 800 }}>{row.payment_date || row.created_at.slice(0, 10)}</div>
              <div style={{ opacity: 0.7 }}>
                {row.payment_method === "cash" ? "Paiement liquide" : "Virement"}
              </div>
            </div>
            <div style={{ fontWeight: 900 }}>{euros(Number(row.delta_cents ?? 0))}</div>
            <div style={{ opacity: 0.9 }}>{row.comment}</div>
          </div>
        ))}
        {rows.length === 0 && <p style={{ opacity: 0.7 }}>Aucun top-up trouvé.</p>}
      </div>
    </section>
  );
}
