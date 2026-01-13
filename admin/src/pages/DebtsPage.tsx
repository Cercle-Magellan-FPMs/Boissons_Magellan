import { useEffect, useState } from "react";
import { api } from "../lib/api";

type DebtRow = {
  period_id: string;
  start_ts: string;
  end_ts: string;
  user_id: number;
  user_name: string;
  user_email: string | null;
  amount_cents: number;
  status: "invoiced" | "paid";
  generated_at: string;
  paid_at: string | null;
};

function euros(cents: number) {
  return (cents / 100).toFixed(2) + " EUR";
}

function periodLabel(d: DebtRow) {
  return `${d.start_ts} -> ${d.end_ts}`;
}

export default function DebtsPage() {
  const [closeMsg, setCloseMsg] = useState("");
  const [comment, setComment] = useState("");

  const [statusFilter, setStatusFilter] = useState<"invoiced" | "paid">("invoiced");
  const [nameFilter, setNameFilter] = useState("");
  const [debts, setDebts] = useState<DebtRow[]>([]);
  const [msg, setMsg] = useState("");

  async function closePeriodAction() {
    setCloseMsg("");
    try {
      const payload = comment.trim() ? { comment: comment.trim() } : {};
      const res = await api<{
        ok: true;
        period_id: string;
        start_ts: string;
        end_ts: string;
        created: number;
      }>("/api/admin/close-period", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setCloseMsg(`Cloture OK: ${res.start_ts} -> ${res.end_ts} (dettes creees: ${res.created})`);
      setComment("");
      await load();
    } catch (e: any) {
      setCloseMsg("Erreur cloture: " + e.message);
    }
  }

  async function load() {
    setMsg("");
    const qs = new URLSearchParams();
    qs.set("status", statusFilter);

    try {
      const data = await api<{ debts: DebtRow[] }>(`/api/admin/debts?${qs.toString()}`);
      setDebts(data.debts);
    } catch (e: any) {
      setMsg("Erreur: " + e.message);
      setDebts([]);
    }
  }

  useEffect(() => { load(); }, [statusFilter]);

  const filteredDebts = debts.filter(d =>
    d.user_name.toLowerCase().includes(nameFilter.trim().toLowerCase())
  );



  async function pay(d: DebtRow) {
    if (!confirm(`Marquer paye: ${d.user_name} (${periodLabel(d)}) = ${euros(d.amount_cents)} ?`)) return;
    try {
      await api("/api/admin/debts/pay", {
        method: "POST",
        body: JSON.stringify({ period_id: d.period_id, user_id: d.user_id }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function unpay(d: DebtRow) {
    if (!confirm(`Annuler paiement: ${d.user_name} (${periodLabel(d)}) ?`)) return;
    try {
      await api("/api/admin/debts/unpay", {
        method: "POST",
        body: JSON.stringify({ period_id: d.period_id, user_id: d.user_id }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const total = filteredDebts.reduce((s, d) => s + d.amount_cents, 0);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Dettes</h2>
      <div style={{ padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Clôture de période</h3>
        <p style={{ opacity: 0.7, marginTop: 0 }}>
          La clôture prend la période depuis la dernière clôture jusqu'à maintenant.
        </p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Commentaire (optionnel)"
            style={{ padding: 8, minWidth: 240 }}
          />
          <button onClick={closePeriodAction} style={{ fontWeight: 900 }}>
            Clôturer
          </button>
          {closeMsg && <span style={{ opacity: 0.85 }}>{closeMsg}</span>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Statut : {" "}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="invoiced">Impayées</option>
            <option value="paid">Payées</option>
          </select>
        </label>

        <label>
          Rechercher : {""}
          <input
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Raphaël aka best admin"
          />
        </label>

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
        {filteredDebts.map((d) => (
          <div
            key={`${d.period_id}-${d.user_id}`}
            style={{
              border: "1px solid #444",
              borderRadius: 10,
              padding: 10,
              display: "grid",
              gridTemplateColumns: "2fr 1.4fr 1fr auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 900 }}>{d.user_name}</div>
              <div style={{ opacity: 0.7 }}>{d.user_email || "--"}</div>
            </div>

            <div>
              <div style={{ fontWeight: 800 }}>{periodLabel(d)}</div>
              <div style={{ opacity: 0.7 }}>{d.status === "paid" ? "Payee" : "Impayee"}</div>
            </div>

            <div>
              <div style={{ fontWeight: 900 }}>{euros(d.amount_cents)}</div>
              <div style={{ opacity: 0.7 }}>{d.paid_at ? `Paye: ${d.paid_at}` : ""}</div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {d.status === "invoiced" ? (
                <button onClick={() => pay(d)} style={{ fontWeight: 900 }}>Marquer paye</button>
              ) : (
                <button onClick={() => unpay(d)}>Annuler</button>
              )}
            </div>
          </div>
        ))}

        {filteredDebts.length === 0 && <p style={{ opacity: 0.7 }}>Aucune dette trouvee.</p>}
      </div>
    </section>
  );
}
