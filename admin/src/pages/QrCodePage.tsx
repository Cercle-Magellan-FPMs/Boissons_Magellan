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
    qr_type: "payment" | "topup";
    confirmed_by_user: number;
};

type QrSettings = {
    recipient_name: string;
    iban: string;
    bic: string;
    remittance_prefix: string;
    topup_blocked_message: string;
};

function euros(cents: number) {
    return (cents / 100).toFixed(2) + " EUR";
}

export default function QrCodePage() {
    const [rows, setRows] = useState<QrRow[]>([]);
    const [error, setError] = useState("");
    const [statusFilter, setStatusFilter] = useState<
        "" | "verified" | "unverified"
    >("");
    const [nameFilter, setNameFilter] = useState("");
    const [typeFilter, setTypeFilter] = useState<"" | "payment" | "topup">(
        "",
    );
    const [confirmedFilter, setConfirmedFilter] = useState<string>("");

    const [settings, setSettings] = useState<QrSettings>({
        recipient_name: "",
        iban: "",
        bic: "",
        remittance_prefix: "",
        topup_blocked_message: "Demander le droit au top-up au comité.",
    });
    const [settingsMsg, setSettingsMsg] = useState("");
    const [savingSettings, setSavingSettings] = useState(false);

    async function loadRows() {
        setError("");
        try {
            const qs = new URLSearchParams();
            if (statusFilter) qs.set("status", statusFilter);
            if (nameFilter.trim()) qs.set("name", nameFilter.trim());
            if (typeFilter) qs.set("type", typeFilter);
            if (confirmedFilter) qs.set("confirmed", confirmedFilter);
            const data = await api<{ rows: QrRow[] }>(
                `/api/admin/qr-code?${qs.toString()}`,
            );
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
    }, [statusFilter, nameFilter, typeFilter, confirmedFilter]);

    useEffect(() => {
        loadSettings();
    }, []);

    async function saveSettings(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setSavingSettings(true);
        setSettingsMsg("");

        try {
            const data = await api<QrSettings & { ok: true }>(
                "/api/admin/qr-code/settings",
                {
                    method: "PUT",
                    body: JSON.stringify(settings),
                },
            );
            setSettings({
                recipient_name: data.recipient_name,
                iban: data.iban,
                bic: data.bic,
                remittance_prefix: data.remittance_prefix,
                topup_blocked_message:
                    data.topup_blocked_message ??
                    settings.topup_blocked_message,
            });
            setSettingsMsg("Infos bancaires mises à jour.");
        } catch (e: any) {
            setSettingsMsg(`Erreur: ${e.message}`);
        } finally {
            setSavingSettings(false);
        }
    }

    async function deleteRow(row: QrRow) {
        const label = row.qr_type === "topup" ? "top-up" : "paiement";
        if (!confirm(`Supprimer ce ${label} de ${row.user_name} (${euros(Number(row.amount_cents ?? 0))}) ?`)) return;
        try {
            await api(`/api/admin/qr-code/${row.id}`, { method: "DELETE" });
            await loadRows();
        } catch (e: any) {
            alert(e.message);
        }
    }

    async function toggleStatus(row: QrRow) {
        const nextStatus =
            row.status === "verified" ? "unverified" : "verified";

        // Double confirmation quand on passe en "vérifié"
        if (nextStatus === "verified") {
            const typeLabel = row.qr_type === "topup" ? "top-up" : "paiement";
            if (!confirm(
                `Confirmer le ${typeLabel} de ${row.user_name} pour ${euros(Number(row.amount_cents ?? 0))} ?`
            )) return;
            if (!confirm(
                `ATTENTION : ${row.qr_type === "topup" ? "Le solde sera crédité sur le compte." : "Cette action est irréversible."}\n\nConfirmer ?`
            )) return;
        }

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
        [rows],
    );

    return (
        <section style={{ display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0 }}>QR Code</h2>

            <form
                onSubmit={saveSettings}
                style={{
                    padding: 12,
                    border: "1px solid #333",
                    borderRadius: 12,
                    display: "grid",
                    gap: 10,
                }}
            >
                <h3 style={{ margin: 0 }}>Modifier les infos bancaires</h3>
                <div
                    style={{
                        display: "grid",
                        gap: 8,
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(220px, 1fr))",
                    }}
                >
                    <label style={{ display: "grid", gap: 6 }}>
                        <span>Nom bénéficiaire</span>
                        <input
                            value={settings.recipient_name}
                            onChange={(e) =>
                                setSettings((current) => ({
                                    ...current,
                                    recipient_name: e.target.value,
                                }))
                            }
                            placeholder="Cercle Magellan"
                            required
                        />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                        <span>IBAN</span>
                        <input
                            value={settings.iban}
                            onChange={(e) =>
                                setSettings((current) => ({
                                    ...current,
                                    iban: e.target.value,
                                }))
                            }
                            placeholder="BE70751211827125"
                            required
                        />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                        <span>BIC</span>
                        <input
                            value={settings.bic}
                            onChange={(e) =>
                                setSettings((current) => ({
                                    ...current,
                                    bic: e.target.value,
                                }))
                            }
                            placeholder="NICABEBBXXX"
                            required
                        />
                    </label>
                    <label style={{ display: "grid", gap: 6 }}>
                        <span>Texte avant UNIQUE_ID</span>
                        <input
                            value={settings.remittance_prefix}
                            onChange={(e) =>
                                setSettings((current) => ({
                                    ...current,
                                    remittance_prefix: e.target.value,
                                }))
                            }
                            placeholder="Boisson"
                            required
                        />
                    </label>
                    <label
                        style={{
                            display: "grid",
                            gap: 6,
                            gridColumn: "1 / -1",
                        }}
                    >
                        <span>Message blocage top-up</span>
                        <input
                            value={settings.topup_blocked_message}
                            onChange={(e) =>
                                setSettings((current) => ({
                                    ...current,
                                    topup_blocked_message: e.target.value,
                                }))
                            }
                            placeholder="Demander le droit au top-up au comité."
                            required
                        />
                    </label>
                </div>
                <div
                    style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "center",
                        flexWrap: "wrap",
                    }}
                >
                    <button type="submit" disabled={savingSettings}>
                        {savingSettings ? "Sauvegarde..." : "Enregistrer"}
                    </button>
                    {settingsMsg && (
                        <span style={{ opacity: 0.85 }}>{settingsMsg}</span>
                    )}
                </div>
            </form>

            <div
                style={{
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                }}
            >
                <label>
                    Statut :{" "}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                    >
                        <option value="">Tous</option>
                        <option value="unverified">Pas vérifié</option>
                        <option value="verified">Vérifié</option>
                    </select>
                </label>

                <label>
                    Confirmé user :{" "}
                    <select
                        value={confirmedFilter}
                        onChange={(e) =>
                            setConfirmedFilter(e.target.value)
                        }
                    >
                        <option value="1">Marqué payé</option>
                        <option value="0">Pas marqué payé</option>
                        <option value="">Tous</option>
                    </select>
                </label>

                <label>
                    Type :{" "}
                    <select
                        value={typeFilter}
                        onChange={(e) =>
                            setTypeFilter(e.target.value as any)
                        }
                    >
                        <option value="">Tous</option>
                        <option value="payment">Paiement commande</option>
                        <option value="topup">Top-up</option>
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
                <div
                    style={{
                        padding: 10,
                        border: "1px solid #a33",
                        borderRadius: 10,
                    }}
                >
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
                            gridTemplateColumns: "1.1fr 1fr 0.7fr 0.7fr 0.7fr auto",
                            gap: 8,
                            alignItems: "center",
                        }}
                    >
                        <div>
                            <div style={{ fontWeight: 900 }}>
                                {row.unique_id}
                            </div>
                            <div style={{ opacity: 0.7 }}>#{row.id}</div>
                        </div>
                        <div>
                            <div style={{ fontWeight: 800 }}>
                                {row.user_name}
                            </div>
                            <div style={{ opacity: 0.7 }}>
                                {row.user_email || "--"}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontWeight: 900 }}>
                                {euros(Number(row.amount_cents ?? 0))}
                            </div>
                            <div style={{ opacity: 0.7 }}>{row.created_at}</div>
                        </div>
                        <div>
                            <span
                                style={{
                                    padding: "2px 8px",
                                    borderRadius: 4,
                                    fontSize: "0.85em",
                                    fontWeight: 700,
                                    background:
                                        row.qr_type === "topup"
                                            ? "#51dfb1"
                                            : "#42e1dc",
                                    color: "#1a2a34",
                                }}
                            >
                                {row.qr_type === "topup"
                                    ? "Top-up"
                                    : "Commande"}
                            </span>
                        </div>
                        <div style={{ textAlign: "center" }}>
                            {row.confirmed_by_user === 1 ? (
                                <span style={{ color: "#8c8", fontWeight: 700, fontSize: "0.9em" }}>
                                    ✅ Payé
                                </span>
                            ) : (
                                <span style={{ color: "#c88", fontSize: "0.85em" }}>
                                    Non confirmé
                                </span>
                            )}
                        </div>
                        <div
                            style={{
                                display: "grid",
                                gap: 6,
                                justifyItems: "end",
                            }}
                        >
                            <span style={{ opacity: 0.9 }}>
                                {row.status === "verified"
                                    ? "Vérifié"
                                    : "Pas vérifié"}
                            </span>
                            <button onClick={() => toggleStatus(row)}>
                                {row.status === "verified"
                                    ? "Marquer pas vérifié"
                                    : "Marquer vérifié"}
                            </button>
                            <button
                                onClick={() => deleteRow(row)}
                                style={{
                                    background: "#a33",
                                    color: "#fff",
                                    border: "none",
                                }}
                            >
                                🗑️
                            </button>
                        </div>
                    </div>
                ))}
                {rows.length === 0 && (
                    <p style={{ opacity: 0.7 }}>
                        Aucun paiement QR Code trouvé.
                    </p>
                )}
            </div>
        </section>
    );
}
