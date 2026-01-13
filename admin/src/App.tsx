import { useMemo, useState } from "react";
import "./App.css";
import { getAdminToken, setAdminToken } from "./lib/api";
import ProductsPage from "./pages/ProductsPage";
import RestockPage from "./pages/RestockPage";
import DebtsPage from "./pages/DebtsPage";
import DebtSummaryPage from "./pages/DebtSummaryPage";
import UsersPage from "./pages/UsersPage";

type Page = "products" | "restock" | "debts" | "summary" | "users";

export default function App() {
  const [page, setPage] = useState<Page>("products");
  const [tokenInput, setTokenInput] = useState(getAdminToken());
  const tokenSaved = useMemo(() => getAdminToken(), [tokenInput]);

  return (
    <div className="admin-app">
      <div className="app-shell">
        <header className="admin-header">
          <div className="brand">
            <div className="brand-title">
              <h1>Admin Boissons</h1>
              <span className="badge">VPN only</span>
            </div>
            <p className="brand-subtitle">
              Gestion des produits, stocks et dettes depuis un seul espace.
            </p>
          </div>

          <nav className="admin-nav">
            <button
              className={`nav-button ${page === "products" ? "active" : ""}`}
              onClick={() => setPage("products")}
            >
              Produits
            </button>
            <button
              className={`nav-button ${page === "restock" ? "active" : ""}`}
              onClick={() => setPage("restock")}
            >
              Restock
            </button>
            <button
              className={`nav-button ${page === "debts" ? "active" : ""}`}
              onClick={() => setPage("debts")}
            >
              Dettes
            </button>
            <button
              className={`nav-button ${page === "summary" ? "active" : ""}`}
              onClick={() => setPage("summary")}
            >
              Resume
            </button>
            <button
              className={`nav-button ${page === "users" ? "active" : ""}`}
              onClick={() => setPage("users")}
            >
              Utilisateurs
            </button>
          </nav>
        </header>

        <section className="token-card">
          <div className="token-row">
            <div className="token-field">
              <label>Token admin</label>
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="x-admin-token"
              />
            </div>
            <button
              className="primary-button"
              onClick={() => {
                setAdminToken(tokenInput.trim());
              }}
            >
              Enregistrer
            </button>
            <span className={`token-status ${tokenSaved ? "ok" : "warn"}`}>
              {tokenSaved ? "Token present" : "Aucun token"}
            </span>
          </div>
        </section>

        <main className="page-main">
          {page === "products" && <ProductsPage />}
          {page === "restock" && <RestockPage />}
          {page === "debts" && <DebtsPage />}
          {page === "summary" && <DebtSummaryPage />}
          {page === "users" && <UsersPage />}
        </main>
      </div>
    </div>
  );
}
