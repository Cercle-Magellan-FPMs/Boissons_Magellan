import { useEffect, useState } from "react";
import "./App.css";
import { getAdminToken, setAdminToken } from "./lib/api";
import ProductsPage from "./pages/ProductsPage";
import RestockPage from "./pages/RestockPage";
import DebtsPage from "./pages/DebtsPage";
import TopupsLogPage from "./pages/TopupsLogPage";
import UsersPage from "./pages/UsersPage";
import EmailSettingsPage from "./pages/EmailSettingsPage";

type Page = "products" | "restock" | "debts" | "topups" | "users" | "email";
const PAGES: Page[] = ["products", "restock", "debts", "topups", "users", "email"];

function normalizePage(value: string | null | undefined): Page | null {
  if (!value) return null;
  return PAGES.includes(value as Page) ? (value as Page) : null;
}

function pageFromHash(hash: string): Page | null {
  const trimmed = hash.replace(/^#\/?/, "").trim();
  return normalizePage(trimmed);
}

function pageFromPathname(pathname: string): Page | null {
  const clean = pathname.replace(/\/+$/, "");
  const parts = clean.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || last === "admin") return null;
  return normalizePage(last);
}

function adminBasePath(): string {
  const pathname = window.location.pathname;
  const idx = pathname.indexOf("/admin");
  if (idx === -1) return "/admin";
  return pathname.slice(0, idx + "/admin".length);
}

function adminUrlFor(page: Page): string {
  return `${adminBasePath()}/${page}`;
}

function readInitialPage(): Page {
  const fromPath = pageFromPathname(window.location.pathname);
  if (fromPath) return fromPath;

  const fromHash = pageFromHash(window.location.hash);
  if (fromHash) return fromHash;

  return "products";
}

export default function App() {
  const [page, setPage] = useState<Page>(readInitialPage);
  const [tokenInput, setTokenInput] = useState(getAdminToken());
  const [showTokenModal, setShowTokenModal] = useState(!getAdminToken());

  useEffect(() => {
    const expectedUrl = adminUrlFor(page);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== expectedUrl) {
      window.history.replaceState(null, "", expectedUrl);
    }
  }, [page]);

  useEffect(() => {
    const syncFromUrl = () => {
      const fromPath = pageFromPathname(window.location.pathname);
      if (fromPath) {
        setPage(fromPath);
        return;
      }
      const fromHash = pageFromHash(window.location.hash);
      setPage(fromHash ?? "products");
    };
    window.addEventListener("popstate", syncFromUrl);
    window.addEventListener("hashchange", syncFromUrl);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      window.removeEventListener("hashchange", syncFromUrl);
    };
  }, []);

  function goTo(nextPage: Page) {
    window.history.pushState(null, "", adminUrlFor(nextPage));
    setPage(nextPage);
  }

  return (
    <div className="admin-app">
      <div className="app-shell">
        <header className="admin-header">
          <div className="brand">
            <div className="brand-title">
              <img className="brand-logo" src={`${import.meta.env.BASE_URL}magellan-logo.png`} alt="Magellan" />
              <h1>Admin Boissons</h1>
              <span className="badge">Cercle Magellan</span>
            </div>
          </div>

          <nav className="admin-nav">
            <button
              className={`nav-button ${page === "products" ? "active" : ""}`}
              onClick={() => goTo("products")}
            >
              Produits
            </button>
            <button
              className={`nav-button ${page === "restock" ? "active" : ""}`}
              onClick={() => goTo("restock")}
            >
              Restock
            </button>
            <button
              className={`nav-button ${page === "debts" ? "active" : ""}`}
              onClick={() => goTo("debts")}
            >
              Clôturer
            </button>
            <button
              className={`nav-button ${page === "topups" ? "active" : ""}`}
              onClick={() => goTo("topups")}
            >
              Log des top-ups
            </button>
            <button
              className={`nav-button ${page === "users" ? "active" : ""}`}
              onClick={() => goTo("users")}
            >
              Utilisateurs
            </button>
            <button
              className={`nav-button ${page === "email" ? "active" : ""}`}
              onClick={() => goTo("email")}
            >
              Email
            </button>
          </nav>
        </header>

        <main className="page-main">
          {page === "products" && <ProductsPage />}
          {page === "restock" && <RestockPage />}
          {page === "debts" && <DebtsPage />}
          {page === "topups" && <TopupsLogPage />}
          {page === "users" && <UsersPage />}
          {page === "email" && <EmailSettingsPage />}
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
