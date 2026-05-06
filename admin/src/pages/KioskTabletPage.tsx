import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

type TabletProxyResult = {
  ok: boolean;
  status: number;
  content_type?: string;
  data?: unknown;
  image_data_url?: string;
  timestamp?: number;
};

type HttpMethod = "GET" | "POST";

type ActionButton = {
  label: string;
  endpoint: string;
  method?: HttpMethod;
  confirm?: string;
  body?: unknown;
};

const STORAGE_BASE_URL = "freekiosk_base_url";
const STORAGE_API_KEY = "freekiosk_api_key";
const DEFAULT_BASE_URL = "http://172.19.0.9:8080";
const DEFAULT_KIOSK_URL = "http://172.17.0.7/kiosk/";

function readStorage(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback; }
  catch { return fallback; }
}

function field(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value ? "oui" : "non";
  return String(value);
}

function getNestedData(result: TabletProxyResult | null): any | null {
  const outer = result?.data as any;
  return outer?.data ?? null;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 16, border: "1px solid #333", borderRadius: 14, display: "grid", gap: 12 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>
      {children}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: unknown }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 6 }}>
      <span style={{ opacity: 0.72 }}>{label}</span>
      <strong style={{ textAlign: "right" }}>{field(value)}</strong>
    </div>
  );
}

export default function KioskTabletPage() {
  const [baseUrl, setBaseUrl] = useState(() => readStorage(STORAGE_BASE_URL, DEFAULT_BASE_URL));
  const [apiKey, setApiKey] = useState(() => readStorage(STORAGE_API_KEY, ""));
  const [kioskUrl, setKioskUrl] = useState(DEFAULT_KIOSK_URL);
  const [brightness, setBrightness] = useState(75);
  const [volume, setVolume] = useState(50);
  const [ttsText, setTtsText] = useState("Boissons Magellan");
  const [toastText, setToastText] = useState("Message envoyé depuis l'admin Boissons");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lastResult, setLastResult] = useState<TabletProxyResult | null>(null);
  const [statusResult, setStatusResult] = useState<TabletProxyResult | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_BASE_URL, baseUrl);
      localStorage.setItem(STORAGE_API_KEY, apiKey);
    } catch {}
  }, [baseUrl, apiKey]);

  const status = useMemo(() => getNestedData(statusResult), [statusResult]);

  async function callTablet(label: string, endpoint: string, method: HttpMethod = "GET", body?: unknown) {
    setBusy(label);
    setMessage("");
    setError("");

    try {
      const result = await api<TabletProxyResult>("/api/admin/kiosk-tablet/proxy", {
        method: "POST",
        body: JSON.stringify({
          base_url: baseUrl.trim(),
          api_key: apiKey,
          endpoint,
          method,
          body,
        }),
      });

      setLastResult(result);
      if (endpoint === "/api/status") setStatusResult(result);
      if (result.image_data_url) setScreenshotUrl(result.image_data_url);

      if (result.ok) setMessage(`${label}: OK`);
      else setError(`${label}: FreeKiosk a répondu avec HTTP ${result.status}`);

      return result;
    } catch (e: any) {
      setError(e.message || "Erreur inconnue");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function loadStatus() {
    await callTablet("Statut complet", "/api/status");
  }

  async function sendUrl() {
    const url = kioskUrl.trim();
    if (!url) {
      setError("URL kiosk obligatoire.");
      return;
    }
    await callTablet("Changer l'URL", "/api/url", "POST", { url });
  }

  async function sendBrightness() {
    const value = Math.max(0, Math.min(100, Number(brightness) || 0));
    setBrightness(value);
    await callTablet("Luminosité", "/api/brightness", "POST", { value });
  }

  async function sendVolume() {
    const value = Math.max(0, Math.min(100, Number(volume) || 0));
    setVolume(value);
    await callTablet("Volume", "/api/volume", "POST", { value });
  }

  async function sendTts() {
    const text = ttsText.trim();
    if (!text) return;
    await callTablet("Text-to-speech", "/api/tts", "POST", { text, language: "fr" });
  }

  async function sendToast() {
    const text = toastText.trim();
    if (!text) return;
    await callTablet("Toast", "/api/toast", "POST", { text });
  }

  const quickActions: ActionButton[] = [
    { label: "Statut", endpoint: "/api/status" },
    { label: "Info", endpoint: "/api/info" },
    { label: "Batterie", endpoint: "/api/battery" },
    { label: "Wi-Fi", endpoint: "/api/wifi" },
    { label: "Capture écran", endpoint: "/api/screenshot" },
    { label: "Recharger WebView", endpoint: "/api/reload", method: "POST" },
    { label: "Vider cache WebView", endpoint: "/api/clearCache", method: "POST" },
    { label: "Redémarrer UI", endpoint: "/api/restart-ui", method: "POST" },
    { label: "Réveiller", endpoint: "/api/wake", method: "POST" },
    { label: "Écran ON", endpoint: "/api/screen/on", method: "POST" },
    { label: "Écran OFF", endpoint: "/api/screen/off", method: "POST" },
    { label: "Lock", endpoint: "/api/lock", method: "POST", confirm: "Verrouiller l'écran de la tablette ?" },
    { label: "Reboot", endpoint: "/api/reboot", method: "POST", confirm: "Redémarrer complètement la tablette ?" },
  ];

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h2 style={{ margin: 0 }}>Kiosk tablette</h2>
        <p style={{ margin: "6px 0 0", opacity: 0.75 }}>
          Contrôle distant de la tablette Samsung via l'API REST FreeKiosk. Les appels passent par le backend admin pour éviter les problèmes CORS.
        </p>
      </div>

      <Panel title="Connexion FreeKiosk">
        <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr auto", gap: 10, alignItems: "end" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>URL API tablette</span>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://172.19.0.9:8080" />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Clé API FreeKiosk</span>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="X-Api-Key" />
          </label>
          <button className="primary-button" onClick={loadStatus} disabled={Boolean(busy)}>
            Tester
          </button>
        </div>
        <p style={{ margin: 0, opacity: 0.72 }}>
          Exemple: <code>http://172.19.0.9:8080</code>. L'endpoint cache FreeKiosk est <code>/api/clearCache</code>.
        </p>
      </Panel>

      {status && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
          <Panel title="Batterie">
            <InfoLine label="Niveau" value={status.battery?.level != null ? `${status.battery.level}%` : undefined} />
            <InfoLine label="Charge" value={status.battery?.charging} />
            <InfoLine label="Température" value={status.battery?.temperature != null ? `${status.battery.temperature} °C` : undefined} />
          </Panel>
          <Panel title="Écran">
            <InfoLine label="Allumé" value={status.screen?.on} />
            <InfoLine label="Luminosité" value={status.screen?.brightness != null ? `${status.screen.brightness}%` : undefined} />
            <InfoLine label="Screensaver" value={status.screen?.screensaverActive} />
          </Panel>
          <Panel title="Réseau">
            <InfoLine label="Connecté" value={status.wifi?.connected} />
            <InfoLine label="SSID" value={status.wifi?.ssid} />
            <InfoLine label="IP" value={status.wifi?.ip} />
          </Panel>
          <Panel title="Kiosk">
            <InfoLine label="Device Owner" value={status.device?.isDeviceOwner ?? status.isDeviceOwner} />
            <InfoLine label="Kiosk mode" value={status.kiosk?.enabled ?? status.kioskMode} />
            <InfoLine label="URL" value={status.webview?.currentUrl} />
          </Panel>
        </div>
      )}

      <Panel title="Actions rapides">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {quickActions.map((action) => (
            <button
              key={`${action.method || "GET"}-${action.endpoint}`}
              onClick={() => {
                if (action.confirm && !window.confirm(action.confirm)) return;
                callTablet(action.label, action.endpoint, action.method || "GET", action.body);
              }}
              disabled={Boolean(busy)}
            >
              {busy === action.label ? "..." : action.label}
            </button>
          ))}
        </div>
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Panel title="URL affichée">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={kioskUrl}
              onChange={(e) => setKioskUrl(e.target.value)}
              placeholder="http://172.17.0.7/kiosk/"
              style={{ minWidth: 320, flex: 1 }}
            />
            <button onClick={sendUrl} disabled={Boolean(busy)}>Envoyer l'URL</button>
          </div>
        </Panel>

        <Panel title="Luminosité et volume">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span>Luminosité</span>
              <input type="number" min={0} max={100} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} style={{ width: 90 }} />
            </label>
            <button onClick={sendBrightness} disabled={Boolean(busy)}>Appliquer</button>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span>Volume</span>
              <input type="number" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{ width: 90 }} />
            </label>
            <button onClick={sendVolume} disabled={Boolean(busy)}>Appliquer</button>
          </div>
        </Panel>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Panel title="Message vocal TTS">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={ttsText} onChange={(e) => setTtsText(e.target.value)} style={{ minWidth: 260, flex: 1 }} />
            <button onClick={sendTts} disabled={Boolean(busy)}>Parler</button>
          </div>
        </Panel>

        <Panel title="Toast FreeKiosk">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input value={toastText} onChange={(e) => setToastText(e.target.value)} style={{ minWidth: 260, flex: 1 }} />
            <button onClick={sendToast} disabled={Boolean(busy)}>Afficher</button>
          </div>
        </Panel>
      </div>

      {screenshotUrl && (
        <Panel title="Dernière capture écran">
          <img src={screenshotUrl} alt="Capture écran FreeKiosk" style={{ maxWidth: "100%", borderRadius: 12, border: "1px solid #333" }} />
        </Panel>
      )}

      {message && <p style={{ margin: 0, color: "#8be3aa", fontWeight: 800 }}>{message}</p>}
      {error && <p style={{ margin: 0, color: "#ffb39a", fontWeight: 800 }}>Erreur: {error}</p>}

      {lastResult && (
        <Panel title="Dernière réponse brute">
          <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 360, overflow: "auto" }}>
            {JSON.stringify(lastResult, null, 2)}
          </pre>
        </Panel>
      )}
    </section>
  );
}
