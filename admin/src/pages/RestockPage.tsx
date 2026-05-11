import { useEffect, useMemo, useState } from "react";
import { api, getAdminToken } from "../lib/api";
import type { AdminProduct } from "../lib/types";

type Line = { product_id: number; qty: number };

type StockMove = {
    id: number;
    move_id: string;
    ts: string;
    product_id: number;
    product_name: string;
    delta_qty: number;
    reason: string;
    comment: string | null;
    user_name: string | null;
};

function toBrusselsTime(sqliteTs: string): string {
    const normalized =
        sqliteTs.replace(" ", "T") + (sqliteTs.includes("Z") ? "" : "Z");
    const date = new Date(normalized);
    if (isNaN(date.getTime())) return sqliteTs;
    return date.toLocaleString("fr-BE", {
        timeZone: "Europe/Brussels",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function RestockPage() {
    const [products, setProducts] = useState<AdminProduct[]>([]);
    const [lines, setLines] = useState<Line[]>([{ product_id: 0, qty: 1 }]);
    const [searches, setSearches] = useState<string[]>([""]);
    const [comment, setComment] = useState("");
    const [msg, setMsg] = useState("");
    const [csvBusy, setCsvBusy] = useState(false);
    const [moves, setMoves] = useState<StockMove[]>([]);
    const [movesError, setMovesError] = useState("");
    const [reasonFilter, setReasonFilter] = useState<string>("");

    async function loadProducts() {
        const data = await api<{ products: AdminProduct[] }>(
            "/api/admin/products",
        );
        setProducts(data.products);
    }

    async function undoMove(move: StockMove) {
        if (!confirm(`Annuler la vente de ${move.product_name} (${move.delta_qty} unites) ?`)) return;
        if (!confirm("Confirmer l'annulation ? Cette action est irreversible.")) return;
        try {
            await api(`/api/admin/stock-moves/${move.id}/undo`, { method: "POST" });
            await loadMoves();
            await loadProducts();
        } catch (e: any) {
            alert(e.message);
        }
    }

    async function loadMoves(reason?: string) {
        setMovesError("");
        try {
            const filter = reason ?? reasonFilter;
            const qs = filter ? `?reason=${encodeURIComponent(filter)}` : "";
            const data = await api<{ moves: StockMove[] }>(
                `/api/admin/stock-moves${qs}`,
            );
            setMoves(data.moves);
        } catch (e: any) {
            setMovesError(e.message);
        }
    }

    function applyReasonFilter(reason: string) {
        const next = reasonFilter === reason ? "" : reason;
        setReasonFilter(next);
        loadMoves(next);
    }

    useEffect(() => {
        loadProducts();
        loadMoves();
    }, []);

    const validLines = useMemo(
        () =>
            lines.filter(
                (l) =>
                    l.product_id > 0 && l.qty !== 0 && Number.isFinite(l.qty),
            ),
        [lines],
    );

    function updateLine(i: number, patch: Partial<Line>) {
        setLines((prev) =>
            prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)),
        );
    }

    function updateSearch(i: number, value: string) {
        setSearches((prev) => prev.map((s, idx) => (idx === i ? value : s)));
        const q = value.trim().toLowerCase();
        if (!q) return;
        const matches = products.filter((p) =>
            p.name.toLowerCase().includes(q),
        );
        if (matches.length === 1) {
            selectProduct(i, matches[0]);
        }
    }

    function selectProduct(i: number, product: AdminProduct) {
        updateLine(i, { product_id: product.id });
        setSearches((prev) =>
            prev.map((s, idx) => (idx === i ? product.name : s)),
        );
    }

    function addLine() {
        setLines((prev) => [...prev, { product_id: 0, qty: 1 }]);
        setSearches((prev) => [...prev, ""]);
    }

    function removeLine(i: number) {
        setLines((prev) => prev.filter((_, idx) => idx !== i));
        setSearches((prev) => prev.filter((_, idx) => idx !== i));
    }

    async function submit() {
        setMsg("");
        if (validLines.length === 0)
            return setMsg("Ajoute au moins une ligne valide.");

        let freshProducts: AdminProduct[] = [];
        try {
            const data = await api<{ products: AdminProduct[] }>(
                "/api/admin/products",
            );
            freshProducts = data.products;
            setProducts(freshProducts);
        } catch (e: any) {
            return setMsg("Impossible de rafraîchir le stock: " + e.message);
        }

        for (const l of validLines) {
            const p = freshProducts.find((pp) => pp.id === l.product_id);
            const stock = p?.qty ?? 0;
            if (l.qty < 0 && Math.abs(l.qty) > stock) {
                return setMsg(
                    `Correction impossible: "${p?.name ?? "Produit"}" stock=${stock}, tu veux retirer ${Math.abs(l.qty)}.`,
                );
            }
        }

        try {
            const res = await api<{ ok: true; move_id: string }>(
                "/api/admin/restock",
                {
                    method: "POST",
                    body: JSON.stringify({
                        items: validLines,
                        comment /*, reason: "correction"*/,
                    }),
                },
            );

            setMsg(`OK ✅ move_id=${res.move_id}`);
            setLines([{ product_id: 0, qty: 1 }]);
            setSearches([""]);
            setComment("");
            await loadProducts();
            await loadMoves();
        } catch (e: any) {
            setMsg("Erreur: " + e.message);
        }
    }

    async function exportStocksCsv() {
        setCsvBusy(true);
        try {
            const res = await fetch("/api/admin/stocks/export.csv", {
                headers: {
                    "x-admin-token": getAdminToken(),
                },
            });
            if (!res.ok) {
                let errorMsg = `Erreur (${res.status})`;
                try {
                    const body = await res.json();
                    errorMsg = body?.error || body?.message || errorMsg;
                } catch {}
                throw new Error(errorMsg);
            }

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `stocks-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (e: any) {
            setMsg("Erreur export CSV: " + e.message);
        } finally {
            setCsvBusy(false);
        }
    }

    async function importStocksCsv(file: File) {
        setCsvBusy(true);
        setMsg("");
        try {
            const csv = await file.text();
            const result = await api<{
                ok: true;
                updated: number;
                unchanged: number;
                failed: number;
                errors: Array<{ line: number; error: string }>;
            }>("/api/admin/stocks/import", {
                method: "POST",
                body: JSON.stringify({
                    csv,
                    comment: comment.trim() || "import csv stocks",
                }),
            });

            await loadProducts();
            const firstErrors = result.errors
                .slice(0, 5)
                .map((item) => `Ligne ${item.line}: ${item.error}`)
                .join(" | ");
            setMsg(
                [
                    `Import stocks terminé.`,
                    `MAJ: ${result.updated}`,
                    `inchangés: ${result.unchanged}`,
                    `erreurs: ${result.failed}`,
                    firstErrors ? `Détails: ${firstErrors}` : "",
                ]
                    .filter(Boolean)
                    .join(" "),
            );
        } catch (e: any) {
            setMsg("Erreur import CSV: " + e.message);
        } finally {
            setCsvBusy(false);
        }
    }

    return (
        <section style={{ display: "grid", gap: 12 }}>
            <h2 style={{ margin: 0 }}>Restock</h2>

            <div
                style={{
                    padding: 12,
                    border: "1px solid #333",
                    borderRadius: 12,
                }}
            >
                <div style={{ display: "grid", gap: 10 }}>
                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                        }}
                    >
                        <button onClick={exportStocksCsv} disabled={csvBusy}>
                            Exporter stocks CSV
                        </button>
                        <label
                            style={{
                                display: "inline-flex",
                                gap: 8,
                                alignItems: "center",
                            }}
                        >
                            <span>Importer CSV :</span>
                            <input
                                type="file"
                                accept=".csv,text/csv"
                                disabled={csvBusy}
                                onChange={async (e) => {
                                    const file = e.currentTarget.files?.[0];
                                    e.currentTarget.value = "";
                                    if (!file) return;
                                    await importStocksCsv(file);
                                }}
                            />
                        </label>
                    </div>

                    {lines.map((l, i) => {
                        const product = products.find(
                            (p) => p.id === l.product_id,
                        );
                        const stockQty = product?.qty ?? 0;
                        const search = searches[i] ?? "";
                        const filteredProducts = search.trim()
                            ? products.filter((p) =>
                                  p.name
                                      .toLowerCase()
                                      .includes(search.trim().toLowerCase()),
                              )
                            : products;
                        const selectedName = product?.name ?? "";
                        const showSuggestions =
                            search.trim().length > 0 &&
                            search.trim().toLowerCase() !==
                                selectedName.toLowerCase();

                        return (
                            <div
                                key={i}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "2fr 1fr auto",
                                    gap: 8,
                                }}
                            >
                                <div style={{ position: "relative" }}>
                                    <input
                                        value={search}
                                        onChange={(e) =>
                                            updateSearch(i, e.target.value)
                                        }
                                        placeholder="Choisir un produit..."
                                        style={{ padding: 8, width: "100%" }}
                                    />
                                    {showSuggestions && (
                                        <div
                                            style={{
                                                position: "absolute",
                                                top: "100%",
                                                left: 0,
                                                right: 0,
                                                zIndex: 3,
                                                marginTop: 6,
                                                background: "#121a1f",
                                                border: "1px solid #2a3a44",
                                                borderRadius: 10,
                                                padding: 6,
                                                maxHeight: 220,
                                                overflowY: "auto",
                                            }}
                                        >
                                            {filteredProducts.length === 0 && (
                                                <div
                                                    style={{
                                                        padding: "8px 10px",
                                                        opacity: 0.7,
                                                    }}
                                                >
                                                    Aucun resultat.
                                                </div>
                                            )}
                                            {filteredProducts.map((p) => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() =>
                                                        selectProduct(i, p)
                                                    }
                                                    style={{
                                                        width: "100%",
                                                        textAlign: "left",
                                                        padding: "8px 10px",
                                                        borderRadius: 8,
                                                        border: "1px solid transparent",
                                                        background:
                                                            "transparent",
                                                        cursor: "pointer",
                                                        color: "inherit",
                                                        display: "flex",
                                                        justifyContent:
                                                            "space-between",
                                                        gap: 8,
                                                    }}
                                                >
                                                    <span>{p.name}</span>
                                                    <span
                                                        style={{ opacity: 0.7 }}
                                                    >
                                                        stock: {p.qty}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <input
                                    type="number"
                                    min={-stockQty}
                                    value={l.qty}
                                    onChange={(e) =>
                                        updateLine(i, {
                                            qty: Number(e.target.value),
                                        })
                                    }
                                    style={{ padding: 8 }}
                                />

                                <button
                                    onClick={() => removeLine(i)}
                                    disabled={lines.length === 1}
                                >
                                    Supprimer
                                </button>
                            </div>
                        );
                    })}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button onClick={addLine}>+ Ajouter ligne</button>
                    </div>

                    <textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Commentaire (ex: Courses Colruyt 11 Jan 2026)"
                        rows={3}
                        style={{ padding: 10, width: "100%" }}
                    />

                    <button
                        onClick={submit}
                        style={{
                            padding: 12,
                            fontWeight: 900,
                            borderRadius: 10,
                        }}
                    >
                        Valider le restock
                    </button>

                    {msg && <p style={{ opacity: 0.8 }}>{msg}</p>}
                </div>
            </div>

            {/* --- HISTORIQUE DES MOUVEMENTS DE STOCK --- */}
            <div
                style={{
                    padding: 12,
                    border: "1px solid #333",
                    borderRadius: 12,
                }}
            >
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 10,
                    }}
                >
                    <h3 style={{ margin: 0 }}>
                        📋 Historique des mouvements de stock
                    </h3>
                    <div
                        style={{
                            display: "flex",
                            gap: 6,
                            alignItems: "center",
                        }}
                    >
                        <button
                            onClick={() => applyReasonFilter("sale")}
                            style={{
                                ...filterBtnStyle,
                                background:
                                    reasonFilter === "sale"
                                        ? "#2a5a3a"
                                        : "#1a2a34",
                                borderColor:
                                    reasonFilter === "sale"
                                        ? "#4a4"
                                        : "#3a4a54",
                            }}
                        >
                            🛒 Ventes
                        </button>
                        <button
                            onClick={() => applyReasonFilter("restock")}
                            style={{
                                ...filterBtnStyle,
                                background:
                                    reasonFilter === "restock"
                                        ? "#2a4a5a"
                                        : "#1a2a34",
                                borderColor:
                                    reasonFilter === "restock"
                                        ? "#48a"
                                        : "#3a4a54",
                            }}
                        >
                            📥 Restocks
                        </button>
                        <button
                            onClick={() => applyReasonFilter("correction")}
                            style={{
                                ...filterBtnStyle,
                                background:
                                    reasonFilter === "correction"
                                        ? "#5a3a2a"
                                        : "#1a2a34",
                                borderColor:
                                    reasonFilter === "correction"
                                        ? "#a84"
                                        : "#3a4a54",
                            }}
                        >
                            🔧 Corrections
                        </button>
                        <button onClick={() => loadMoves()}>
                            🔄 Rafraîchir
                        </button>
                    </div>
                </div>

                {movesError && (
                    <div
                        style={{
                            padding: 10,
                            border: "1px solid #a33",
                            borderRadius: 10,
                            marginBottom: 10,
                        }}
                    >
                        <b>Erreur :</b> {movesError}
                    </div>
                )}

                {moves.length === 0 && !movesError && (
                    <p style={{ opacity: 0.7 }}>Aucun mouvement enregistré.</p>
                )}

                {moves.length > 0 && (
                    <div
                        style={{
                            maxHeight: 450,
                            overflowY: "auto",
                            borderRadius: 8,
                        }}
                    >
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                fontSize: "0.9em",
                            }}
                        >
                            <thead>
                                <tr
                                    style={{
                                        position: "sticky",
                                        top: 0,
                                        background: "#1a2a34",
                                        zIndex: 1,
                                    }}
                                >
                                    <th style={thStyle}>Date</th>
                                    <th style={thStyle}>Produit</th>
                                    <th style={thStyle}>Delta</th>
                                    <th style={thStyle}>Raison</th>
                                    <th style={thStyle}>User</th>
                                    <th style={thStyle}>Commentaire</th>
                                </tr>
                            </thead>
                            <tbody>
                                {moves.map((m) => {
                                    const isReset =
                                        m.comment === "reset complet du stock";
                                    return (
                                        <tr
                                            key={m.id}
                                            style={{
                                                background: isReset
                                                    ? "rgba(170, 51, 51, 0.25)"
                                                    : "transparent",
                                                borderBottom:
                                                    "1px solid #2a3a44",
                                            }}
                                        >
                                            <td style={tdStyle}>
                                                {toBrusselsTime(m.ts)}
                                            </td>
                                            <td style={tdStyle}>
                                                {m.product_name}
                                            </td>
                                            <td
                                                style={{
                                                    ...tdStyle,
                                                    color:
                                                        m.delta_qty > 0
                                                            ? "#4a4"
                                                            : m.delta_qty < 0
                                                              ? "#e44"
                                                              : "inherit",
                                                    fontWeight: 700,
                                                }}
                                            >
                                                {m.delta_qty > 0
                                                    ? `+${m.delta_qty}`
                                                    : m.delta_qty}
                                            </td>
                                            <td style={tdStyle}>
                                                {m.reason === "restock"
                                                    ? "📥 Restock"
                                                    : m.reason === "sale"
                                                      ? "🛒 Vente"
                                                      : m.reason ===
                                                          "correction"
                                                        ? "🔧 Correction"
                                                        : m.reason}
                                            </td>
                                            <td style={tdStyle}>
                                                {m.user_name ?? "admin"}
                                            </td>
                                            <td style={tdStyle}>
                                                {isReset
                                                    ? "⚠️ RESET COMPLET"
                                                    : (m.comment ?? "—")}
                                            </td>
                                            <td style={tdStyle}>
                                                {m.reason === "sale" && (
                                                    <button
                                                        onClick={() => undoMove(m)}
                                                        style={{
                                                            padding: "2px 8px",
                                                            fontSize: "0.8em",
                                                            background: "#a33",
                                                            color: "#fff",
                                                            border: "none",
                                                            borderRadius: 4,
                                                            cursor: "pointer",
                                                        }}
                                                    >
                                                        ↩ Annuler
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 10px",
    borderBottom: "2px solid #3a4a54",
    whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
    padding: "8px 10px",
    verticalAlign: "top",
};

const filterBtnStyle: React.CSSProperties = {
    padding: "5px 12px",
    fontWeight: 700,
    fontSize: "0.85em",
    borderRadius: 6,
    border: "1px solid #3a4a54",
    cursor: "pointer",
    color: "#ccc",
};
