import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { AdminProduct } from "../lib/types";

type Line = { product_id: number; qty: number };

export default function RestockPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([{ product_id: 0, qty: 1 }]);
  const [searches, setSearches] = useState<string[]>([""]);
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");

  async function loadProducts() {
    const data = await api<{ products: AdminProduct[] }>("/api/admin/products");
    setProducts(data.products);
  }

  useEffect(() => { loadProducts(); }, []);

  const validLines = useMemo(
    () => lines.filter(l => l.product_id > 0 && l.qty !== 0 && Number.isFinite(l.qty)),
    [lines]
  );


  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }

  function updateSearch(i: number, value: string) {
    setSearches((prev) => prev.map((s, idx) => idx === i ? value : s));
    const q = value.trim().toLowerCase();
    if (!q) return;
    const matches = products.filter((p) => p.name.toLowerCase().includes(q));
    if (matches.length === 1) {
      selectProduct(i, matches[0]);
    }
  }

  function selectProduct(i: number, product: AdminProduct) {
    updateLine(i, { product_id: product.id });
    setSearches((prev) => prev.map((s, idx) => idx === i ? product.name : s));
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
    if (validLines.length === 0) return setMsg("Ajoute au moins une ligne valide.");

    let freshProducts: AdminProduct[] = [];
    try {
      const data = await api<{ products: AdminProduct[] }>("/api/admin/products");
      freshProducts = data.products;
      setProducts(freshProducts); 
    } catch (e: any) {
      return setMsg("Impossible de rafraîchir le stock: " + e.message);
    }

    for (const l of validLines) {
      const p = freshProducts.find(pp => pp.id === l.product_id);
      const stock = p?.qty ?? 0;
      if (l.qty < 0 && Math.abs(l.qty) > stock) {
        return setMsg(
          `Correction impossible: "${p?.name ?? "Produit"}" stock=${stock}, tu veux retirer ${Math.abs(l.qty)}.`
        );
      }
    }

    try {
      const res = await api<{ ok: true; move_id: string }>("/api/admin/restock", {
        method: "POST",
        body: JSON.stringify({ items: validLines, comment /*, reason: "correction"*/ }),
      });

      setMsg(`OK ✅ move_id=${res.move_id}`);
      setLines([{ product_id: 0, qty: 1 }]);
      setSearches([""]);
      setComment("");
      await loadProducts();
    } catch (e: any) {
      setMsg("Erreur: " + e.message);
    }
  }


  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Restock</h2>

      <div style={{ padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <div style={{ display: "grid", gap: 10 }}>
          {lines.map((l, i) => {
            const product = products.find(p => p.id === l.product_id);
            const stockQty = product?.qty ?? 0;
            const search = searches[i] ?? "";
            const filteredProducts = search.trim()
              ? products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
              : products;
            const selectedName = product?.name ?? "";
            const showSuggestions =
              search.trim().length > 0 &&
              search.trim().toLowerCase() !== selectedName.toLowerCase();
          
            return (
              <div
                key={i}
                style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8 }}
              >
                <div style={{ position: "relative" }}>
                  <input
                    value={search}
                    onChange={(e) => updateSearch(i, e.target.value)}
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
                        <div style={{ padding: "8px 10px", opacity: 0.7 }}>
                          Aucun resultat.
                        </div>
                      )}
                      {filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => selectProduct(i, p)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: "1px solid transparent",
                            background: "transparent",
                            cursor: "pointer",
                            color: "inherit",
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <span>{p.name}</span>
                          <span style={{ opacity: 0.7 }}>stock: {p.qty}</span>
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
                    updateLine(i, { qty: Number(e.target.value) })
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

          <button onClick={submit} style={{ padding: 12, fontWeight: 900, borderRadius: 10 }}>
            Valider le restock
          </button>

          {msg && <p style={{ opacity: 0.8 }}>{msg}</p>}
        </div>
      </div>
    </section>
  );
}

