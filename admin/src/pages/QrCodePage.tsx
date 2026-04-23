import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type QrRow = {
  id: number;
  unique_id: string;
  user_id: number;
  user_name: string;
  user_email: string | null;
  amount_cents: number;
  created_at: string;
  status: "verified" | "unverified";
  verified_at: string | null;
};

type QrSettings = {
  recipient_name: string;
  iban: string;
  bic: string;
  remittance_prefix: string;
};

function euros(cents: number) {
  return (cents / 100).toFixed(2) + " EUR";
}

export default function QrCodePage() {
  const [rows, setRows] = useState<QrRow[]>([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "verified" | "unverified">("");
  const [nameFilter, setNameFilter] = useState("");

  const [settings, setSettings] = useState<QrSettings>({
    recipient_name: "",
    iban: "",
    bic: "",
    remittance_prefix: "",
  });
  const [settingsMsg, setSettingsMsg] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  async function loadRows() {
    setError("");
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (nameFilter.trim()) qs.set("name", nameFilter.trim());
      const data = await api<{ rows: QrRow[] }>(`/api/admin/qr-code?${qs.toString()}`);
      setRows(data.rows);
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    }
  }

  async function loadSettings() {
    setSettingsMsg("");
    try {
      const data = await api<QrSettings>("/api/admin/qr-code/settings");
      setSettings(data);
    } catch (e: any) {
      setSettingsMsg(`Erreur paramètres: ${e.message}`);
    }
  }

  useEffect(() => {
    loadRows();
  }, [statusFilter, nameFilter]);

  useEffect(() => {
    loadSettings();
  }, []);

  async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMsg("");

    try {
      const data = await api<QrSettings & { ok: true }>("/api/admin/qr-code/settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      });
      setSettings({
        recipient_name: data.recipient_name,
        iban: data.iban,
        bic: data.bic,
        remittance_prefix: data.remittance_prefix,
      });
      setSettingsMsg("Infos bancaires mises à jour.");
    } catch (e: any) {
      setSettingsMsg(`Erreur: ${e.message}`);
    } finally {
      setSavingSettings(false);
    }
  }

  async function toggleStatus(row: QrRow) {
    const nextStatus = row.status === "verified" ? "unverified" : "verified";
    try {
      await api<{ ok: true }>(`/api/admin/qr-code/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
      await loadRows();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + Number(row.amount_cents ?? 0), 0),
    [rows]
  );

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>QR Code</h2>

      <form onSubmit={saveSettings} style={{ padding: 12, border: "1px solid #333", borderRadius: 12, display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Modifier les infos bancaires</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Nom bénéficiaire</span>
            <input
              value={settings.recipient_name}
              onChange={(e) => setSettings((current) => ({ ...current, recipient_name: e.target.value }))}
              placeholder="Cercle Magellan"
              required
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>IBAN</span>
            <input
              value={settings.iban}
              onChange={(e) => setSettings((current) => ({ ...current, iban: e.target.value }))}
              placeholder="BE70751211827125"
              required
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>BIC</span>
            <input
              value={settings.bic}
              onChange={(e) => setSettings((current) => ({ ...current, bic: e.target.value }))}
              placeholder="NICABEBBXXX"
              required
            />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Texte avant UNIQUE_ID</span>
            <input
              value={settings.remittance_prefix}
              onChange={(e) => setSettings((current) => ({ ...current, remittance_prefix: e.target.value }))}
              placeholder="Boisson"
              required
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button type="submit" disabled={savingSettings}>
            {savingSettings ? "Sauvegarde..." : "Enregistrer"}
          </button>
          {settingsMsg && <span style={{ opacity: 0.85 }}>{settingsMsg}</span>}
        </div>
      </form>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <label>
          Statut :{" "}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="">Tous</option>
            <option value="unverified">Pas vérifié</option>
            <option value="verified">Vérifié</option>
          </select>
        </label>

        <label>
          Utilisateur :{" "}
          <input
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Nom utilisateur"
          />
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
              gridTemplateColumns: "1.6fr 1.5fr 1fr auto",
              gap: 8,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 900 }}>{row.unique_id}</div>
              <div style={{ opacity: 0.7 }}>#{row.id}</div>
            </div>
            <div>
              <div style={{ fontWeight: 800 }}>{row.user_name}</div>
              <div style={{ opacity: 0.7 }}>{row.user_email || "--"}</div>
            </div>
            <div>
              <div style={{ fontWeight: 900 }}>{euros(Number(row.amount_cents ?? 0))}</div>
              <div style={{ opacity: 0.7 }}>{row.created_at}</div>
            </div>
            <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
              <span style={{ opacity: 0.9 }}>{row.status === "verified" ? "Vérifié" : "Pas vérifié"}</span>
              <button onClick={() => toggleStatus(row)}>
                {row.status === "verified" ? "Marquer pas vérifié" : "Marquer vérifié"}
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p style={{ opacity: 0.7 }}>Aucun paiement QR Code trouvé.</p>}
      </div>
    </section>
  );
}
