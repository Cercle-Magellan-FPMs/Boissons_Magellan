import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import type { AdminProduct } from "../lib/types";

type Line = { product_id: number; qty: number };

export default function RestockPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [lines, setLines] = useState<Line[]>([{ product_id: 0, qty: 1 }]);
  const [comment, setComment] = useState("");
  const [msg, setMsg] = useState("");

  async function loadProducts() {
    const data = await api<{ products: AdminProduct[] }>("/api/admin/products");
    setProducts(data.products);
  }

  useEffect(() => { loadProducts(); }, []);

  const validLines = useMemo(
    () => lines.filter(l => l.product_id > 0 && l.qty > 0),
    [lines]
  );

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }

  function addLine() {
    setLines((prev) => [...prev, { product_id: 0, qty: 1 }]);
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setMsg("");
    if (validLines.length === 0) return setMsg("Ajoute au moins une ligne valide.");

    try {
      const res = await api<{ ok: true; move_id: string }>("/api/admin/restock", {
        method: "POST",
        body: JSON.stringify({ items: validLines, comment }),
      });

      setMsg(`Restock OK ✅ move_id=${res.move_id}`);
      setLines([{ product_id: 0, qty: 1 }]);
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
          {lines.map((l, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8 }}>
              <select
                value={l.product_id}
                onChange={(e) => updateLine(i, { product_id: Number(e.target.value) })}
                style={{ padding: 8 }}
              >
                <option value={0}>Choisir un produit…</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name} (stock: {p.qty})
                  </option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                value={l.qty}
                onChange={(e) => updateLine(i, { qty: Number(e.target.value) })}
                style={{ padding: 8 }}
              />

              <button onClick={() => removeLine(i)} disabled={lines.length === 1}>
                Supprimer
              </button>
            </div>
          ))}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={addLine}>+ Ajouter ligne</button>
            <button onClick={loadProducts}>Rafraîchir produits</button>
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
