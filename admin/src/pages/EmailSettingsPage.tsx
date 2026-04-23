import { useEffect, useState } from "react";
import { api } from "../lib/api";

type EmailSettings = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  password_configured: boolean;
};

const emptySettings: EmailSettings = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  from: "",
  password_configured: false,
};

export default function EmailSettingsPage() {
  const [settings, setSettings] = useState<EmailSettings>(emptySettings);
  const [password, setPassword] = useState("");
  const [testTo, setTestTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api<EmailSettings>("/api/admin/email-settings");
      setSettings(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function update(patch: Partial<EmailSettings>) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  async function save() {
    setMessage("");
    setError("");
    try {
      const data = await api<{ ok: true; settings: EmailSettings }>("/api/admin/email-settings", {
        method: "PUT",
        body: JSON.stringify({
          host: settings.host.trim(),
          port: Number(settings.port),
          secure: settings.secure,
          user: settings.user.trim(),
          password,
          from: settings.from.trim(),
        }),
      });
      setSettings(data.settings);
      setPassword("");
      setMessage("Configuration email enregistrée.");
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function sendTest() {
    setMessage("");
    setError("");
    if (!testTo.trim()) {
      setError("Indique une adresse de test.");
      return;
    }
    try {
      await api<{ ok: true }>("/api/admin/email-settings/test", {
        method: "POST",
        body: JSON.stringify({ to: testTo.trim() }),
      });
      setMessage(`Email de test envoyé à ${testTo.trim()}.`);
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0 }}>Configuration email</h2>
        <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
          Configure le compte SMTP utilisé pour envoyer le détail de compte depuis le kiosk.
        </p>
      </div>

      {loading ? (
        <p style={{ opacity: 0.75 }}>Chargement...</p>
      ) : (
        <div style={{ padding: 16, border: "1px solid #333", borderRadius: 14, display: "grid", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Serveur SMTP</span>
              <input
                value={settings.host}
                onChange={(e) => update({ host: e.target.value })}
                placeholder="smtp.example.com"
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Port</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={settings.port}
                onChange={(e) => update({ port: Number(e.target.value) })}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Sécurité</span>
              <select
                value={settings.secure ? "true" : "false"}
                onChange={(e) => update({ secure: e.target.value === "true" })}
              >
                <option value="false">STARTTLS / port 587</option>
                <option value="true">SSL / port 465</option>
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <span>Utilisateur SMTP</span>
              <input
                value={settings.user}
                onChange={(e) => update({ user: e.target.value })}
                placeholder="compte@example.com"
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Expéditeur</span>
              <input
                value={settings.from}
                onChange={(e) => update({ from: e.target.value })}
                placeholder="Boissons Magellan <compte@example.com>"
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <span>
              Mot de passe SMTP {settings.password_configured ? "(déjà configuré, laisser vide pour conserver)" : "(obligatoire)"}
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={settings.password_configured ? "Nouveau mot de passe optionnel" : "Mot de passe SMTP"}
            />
          </label>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button onClick={save} className="primary-button">
              Enregistrer la configuration
            </button>
            <span style={{ opacity: 0.75 }}>
              Stockage: <code>backend/.env</code>
            </span>
          </div>
        </div>
      )}

      <div style={{ padding: 16, border: "1px solid #333", borderRadius: 14, display: "grid", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Tester l'envoi</h3>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="adresse@test.be"
            style={{ minWidth: 260 }}
          />
          <button onClick={sendTest}>Envoyer un email de test</button>
        </div>
      </div>

      {message && <p style={{ margin: 0, color: "#8be3aa", fontWeight: 800 }}>{message}</p>}
      {error && <p style={{ margin: 0, color: "#ffb39a", fontWeight: 800 }}>Erreur: {error}</p>}
    </section>
  );
}
