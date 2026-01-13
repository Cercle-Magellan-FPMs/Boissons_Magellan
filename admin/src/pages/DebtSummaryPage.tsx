import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type SummaryRow = {
  user_id: number;
  user_name: string;
  user_email: string | null;
  unpaid_closed_cents: number;
  open_month_cents: number;
  total_cents: number;
};


type UserDebtRow = {
  period_id: string;
  start_ts: string;
  end_ts: string;
  amount_cents: number;
  status: "invoiced" | "paid";
  generated_at: string;
  paid_at: string | null;
};

function euros(cents: number) {
  return (cents / 100).toFixed(2) + " €";
}

export default function DebtSummaryPage() {
  const [statusFilter, setStatusFilter] = useState<"invoiced" | "paid">("invoiced");
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const [error, setError] = useState("");
  const [currentMonth, setCurrentMonth] = useState<string>("");

  const [selectedUser, setSelectedUser] = useState<{
    id: number; name: string; email: string | null;
  } | null>(null);
  const [detail, setDetail] = useState<UserDebtRow[]>([]);
  const [detailError, setDetailError] = useState("");

  async function load() {
    setError("");
    setSelectedUser(null);
    setDetail([]);
    try {
      const qs = new URLSearchParams();
      qs.set("status", statusFilter);
      const data = await api<{ month_key: string; summary: SummaryRow[] }>(`/api/admin/debts/summary-current?${qs.toString()}`);
      setCurrentMonth(data.month_key);
      setRows(data.summary);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function loadUser(userId: number) {
    setDetailError("");
    try {
      const data = await api<{ user: any; debts: UserDebtRow[] }>(
        `/api/admin/debts/user/${userId}?status=${statusFilter}`
      );
      setSelectedUser({ id: data.user.id, name: data.user.name, email: data.user.email });
      setDetail(data.debts);
    } catch (e: any) {
      setDetailError(e.message);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  const totalAll = useMemo(() => rows.reduce((s, r) => s + r.total_cents, 0), [rows]);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Résumé des dettes</h2>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Statut{" "}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="invoiced">Impayées</option>
            <option value="paid">Payées</option>
          </select>
        </label>
        <button onClick={load}>Rafraîchir</button>
        <span style={{ opacity: 0.7 }}>
          Total ({statusFilter === "invoiced" ? "impayé" : "payé"}) : <b>{euros(totalAll)}</b>
        </span>
      </div>

      {error && (
        <div style={{ padding: 10, border: "1px solid #a33", borderRadius: 10 }}>
          Erreur: {error}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        {/* LEFT: summary */}
        <div style={{ border: "1px solid #333", borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Par personne</h3>

          {rows.length === 0 ? (
            <p style={{ opacity: 0.7 }}>Aucune donnée.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {rows.map((r) => (
                <button
                  key={r.user_id}
                  onClick={() => loadUser(r.user_id)}
                  style={{
                    textAlign: "left",
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #444",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{r.user_name}</div>
                      <div style={{ opacity: 0.7 }}>{r.user_email || "—"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 900 }}>{euros(r.total_cents)}</div>
                      <div style={{ opacity: 0.7 }}>Clôturé impayé: {euros(r.unpaid_closed_cents)}</div>
                      <div style={{ opacity: 0.7 }}>{currentMonth}: {euros(r.open_month_cents)}</div>
                    </div>

                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: details */}
        <div style={{ border: "1px solid #333", borderRadius: 12, padding: 12 }}>
          <h3 style={{ marginTop: 0 }}>Détail</h3>

          {!selectedUser ? (
            <p style={{ opacity: 0.7 }}>Clique une personne à gauche.</p>
          ) : (
            <>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 900 }}>{selectedUser.name}</div>
                <div style={{ opacity: 0.7 }}>{selectedUser.email || "—"}</div>
              </div>

              {detailError && (
                <div style={{ padding: 10, border: "1px solid #a33", borderRadius: 10 }}>
                  Erreur: {detailError}
                </div>
              )}

              {detail.length === 0 ? (
                <p style={{ opacity: 0.7 }}>Aucun mois.</p>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {detail.map((d) => (
                    <div
                      key={d.period_id}
                      style={{
                        border: "1px solid #444",
                        borderRadius: 10,
                        padding: 10,
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 900 }}>{d.end_ts.substring(0, 7)}</div>
                        <div style={{ opacity: 0.7 }}>
                          {d.status === "paid" ? `Payé: ${d.paid_at}` : "Impayé"}
                        </div>
                      </div>
                      <div style={{ fontWeight: 900 }}>{euros(d.amount_cents)}</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
