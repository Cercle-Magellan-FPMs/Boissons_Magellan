import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { AdminProduct } from "../lib/types";
import { eurosFromCents } from "../lib/types";

export default function ProductsPage() {
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [error, setError] = useState<string>("");
  const [nameFilter, setNameFilter] = useState("");

  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState<number>();
  const [newQty, setNewQty] = useState<number>();
  const [newSlug, setNewSlug] = useState("");

  async function load() {
    setError("");
    try {
      const data = await api<{ products: AdminProduct[] }>("/api/admin/products");
      setProducts(data.products);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(p: AdminProduct) {
    try {
      await api("/api/admin/products/" + p.id, {
        method: "PATCH",
        body: JSON.stringify({ is_active: p.is_active !== 1 }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function rename(p: AdminProduct) {
    const name = prompt("Nouveau nom", p.name);
    if (!name) return;
    try {
      await api("/api/admin/products/" + p.id, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function changePrice(p: AdminProduct) {
    const current = p.price_cents ?? 0;
    const euros = prompt("Nouveau prix (en EUR)", (current / 100).toString());
    if (euros == null) return;
    const value = Math.round(Number(euros.replace(",", ".")) * 100);
    if (!Number.isFinite(value) || value < 0) return alert("Prix invalide");

    try {
      await api(`/api/admin/products/${p.id}/price`, {
        method: "POST",
        body: JSON.stringify({ price_cents: value }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function changeSlug(p: AdminProduct) {
    const current = p.image_slug ?? "";
    const slug = prompt("Slug image (ex: coca-zero)", current);
    if (slug == null) return;
    try {
      await api("/api/admin/products/" + p.id, {
        method: "PATCH",
        body: JSON.stringify({ image_slug: slug.trim() }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function addProduct() {
    if (!newName.trim()) return;
    try {
      await api(`/api/admin/products`, {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          price_cents: newPrice,
          initial_qty: newQty,
          is_active: true,
          image_slug: newSlug.trim() || undefined,
        }),
      });
      setNewName("");
      setNewPrice(0);
      setNewQty(0);
      setNewSlug("");
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(nameFilter.trim().toLowerCase())
  );

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Produits</h2>

      <div style={{ padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Ajouter un produit</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom (ex: Sprite)"
            style={{ padding: 8, minWidth: 150 }}
          />
          <p>Prix (en centimes) :</p>
          <input
            type="number"
            value={newPrice}
            onChange={(e) => setNewPrice(Number(e.target.value))}
            placeholder="100 = 1€"
            style={{ padding: 8, width: 110 }}
          />
          
          <p>Quantité initiale :</p>
          <input
            type="number"
            value={newQty}
            onChange={(e) => setNewQty(Number(e.target.value))}
            placeholder="stock initial"
            style={{ padding: 8, width: 110 }}
          />
          <p>Slug image :</p> 
          <input
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="Ex: coca-zero"
            style={{ padding: 8, minWidth: 150 }}
          />
          <button onClick={addProduct} style={{ fontWeight: 800 }}>Ajouter</button>
        </div>
      </div>

      <div style={{ padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Liste</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <label>
              Rechercher : {" "}
              <input
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Ex : Red Bull"
              />
            </label>
          </div>

        {error && (
          <div style={{ padding: 10, border: "1px solid #a33", borderRadius: 10, marginBottom: 10 }}>
            <b>Erreur :</b> {error}
          </div>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          {filteredProducts.map((p) => (
            <div
              key={p.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
                gap: 8,
                alignItems: "center",
                padding: 10,
                border: "1px solid #444",
                borderRadius: 10,
                opacity: p.is_active === 1 ? 1 : 0.55,
              }}
            >
              <div>
                <div style={{ fontWeight: 900 }}>{p.name}</div>
                <div style={{ opacity: 0.7 }}>ID: {p.id}</div>
              </div>

              <div>
                <div style={{ fontWeight: 800 }}>{eurosFromCents(p.price_cents)}</div>
                <div style={{ opacity: 0.7 }}>Prix actuel</div>
              </div>

              <div>
                <div style={{ fontWeight: 800 }}>{p.qty}</div>
                <div style={{ opacity: 0.7 }}>Stock</div>
              </div>

              <div>
                <div style={{ fontWeight: 800 }}>{p.image_slug || "--"}</div>
                <div style={{ opacity: 0.7 }}>Slug image</div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={() => rename(p)}>Renommer</button>
                <button onClick={() => changePrice(p)}>Prix</button>
                <button onClick={() => changeSlug(p)}>Image</button>
                <button onClick={() => toggleActive(p)}>
                  {p.is_active === 1 ? "Desactiver" : "Activer"}
                </button>
              </div>
            </div>
          ))}

          {filteredProducts.length === 0 && <p style={{ opacity: 0.7 }}>Aucun produit.</p>}
        </div>
      </div>
    </section>
  );
}
