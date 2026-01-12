import { useMemo, useState } from "react";
import "./App.css";
import { getAdminToken, setAdminToken } from "./lib/api";
import ProductsPage from "./pages/ProductsPage";
import RestockPage from "./pages/RestockPage";

type Page = "products" | "restock";

export default function App() {
  const [page, setPage] = useState<Page>("products");
  const [tokenInput, setTokenInput] = useState(getAdminToken());
  const tokenSaved = useMemo(() => getAdminToken(), [tokenInput]);

  return (
    <div style={{ minHeight: "100vh", fontFamily: "system-ui", padding: 16 }}>
      <header style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
          <h1 style={{ margin: 0, fontWeight: 900 }}>Admin Boissons</h1>
          <span style={{ opacity: 0.6 }}>VPN only</span>
        </div>

        <nav style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setPage("products")} disabled={page === "products"}>Produits</button>
          <button onClick={() => setPage("restock")} disabled={page === "restock"}>Restock</button>
        </nav>
      </header>

      <section style={{ marginTop: 16, padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontWeight: 700 }}>Token admin :</label>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="x-admin-token"
            style={{ padding: 8, minWidth: 260 }}
          />
          <button
            onClick={() => {
              setAdminToken(tokenInput.trim());
              alert("Token enregistré ✅");
            }}
          >
            Enregistrer
          </button>
          <span style={{ opacity: 0.7 }}>
            {tokenSaved ? "Token présent ✅" : "Aucun token ❌"}
          </span>
        </div>
      </section>

      <main style={{ marginTop: 16 }}>
        {page === "products" && <ProductsPage />}
        {page === "restock" && <RestockPage />}
      </main>
    </div>
  );
}
