import { useState } from "react";
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
  const [showTokenModal, setShowTokenModal] = useState(!getAdminToken());

  return (
    <div className="admin-app">
      <div className="app-shell">
        <header className="admin-header">
          <div className="brand">
            <div className="brand-title">
              <img className="brand-logo" src="/magellan-logo.png" alt="Magellan" />
              <h1>Admin Boissons</h1>
              <span className="badge">Cercle Magellan</span>
            </div>
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
              Clôturer
            </button>
            <button
              className={`nav-button ${page === "summary" ? "active" : ""}`}
              onClick={() => setPage("summary")}
            >
              Résumé des dettes
            </button>
            <button
              className={`nav-button ${page === "users" ? "active" : ""}`}
              onClick={() => setPage("users")}
            >
              Utilisateurs
            </button>
          </nav>
        </header>

        <main className="page-main">
          {page === "products" && <ProductsPage />}
          {page === "restock" && <RestockPage />}
          {page === "debts" && <DebtsPage />}
          {page === "summary" && <DebtSummaryPage />}
          {page === "users" && <UsersPage />}
        </main>
      </div>
      <footer className="app-footer">Développé par Delens Raphaël</footer>

      {showTokenModal && (
        <div className="token-modal-backdrop">
          <div className="token-modal">
            <h2>Token admin</h2>
            <p>Entrez le token pour acceder a l'interface admin.</p>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="x-admin-token"
            />
            <div className="token-modal-actions">
              <button
                className="primary-button"
                onClick={() => {
                  const token = tokenInput.trim();
                  if (!token) return;
                  setAdminToken(token);
                  setShowTokenModal(false);
                }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
