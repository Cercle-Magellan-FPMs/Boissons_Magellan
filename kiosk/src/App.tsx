import { useEffect, useRef, useState } from "react";
import "./App.css";

type User = { id: number; name: string; is_active: number };
type Product = { id: number; name: string; price_cents: number | null; qty: number; available: boolean; image_slug?: string | null };
type Cart = Record<number, number>;
type DebtItem = { product_id: number; product_name: string; qty: number };
type DebtSummary = {
  unpaid_closed_cents: number;
  open_cents: number;
  total_cents: number;
  items: DebtItem[];
};

function euros(cents: number) {
  return (cents / 100).toFixed(2) + " EUR";
}

export default function App() {
  const [screen, setScreen] = useState<"badge" | "products" | "thanks" | "debt">("badge");
  const [status, setStatus] = useState("Pas de badge ? Contactez le comité.");
  const [user, setUser] = useState<User | null>(null);

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [debt, setDebt] = useState<DebtSummary | null>(null);
  const [debtError, setDebtError] = useState("");
  const [imageErrors, setImageErrors] = useState<Record<string, true>>({});

  const inputRef = useRef<HTMLInputElement | null>(null);
  const bufferRef = useRef("");

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    focus();
    window.addEventListener("click", focus);
    const interval = window.setInterval(focus, 1000);
    return () => {
      window.removeEventListener("click", focus);
      window.clearInterval(interval);
    };
  }, []);

  async function identify(uidRaw: string) {
    const uid = uidRaw.trim().toUpperCase();
    setStatus(`Identification de ${uid}...`);

    const res = await fetch("/api/kiosk/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(err.error || `Erreur (${res.status})`);
      return;
    }

    const data = await res.json();
    setUser(data.user);
    setStatus(`Bonjour ${data.user.name}.`);

    await loadProducts();
    setCart({});
    setScreen("products");
  }

  async function loadProducts() {
    const res = await fetch("/api/kiosk/products");
    const data = await res.json();
    setProducts(data.products);
  }

  async function loadDebt(userId: number) {
    setDebtError("");
    const res = await fetch(`/api/kiosk/debt/${userId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setDebtError(err.error || `Erreur (${res.status})`);
      setDebt(null);
      return;
    }

    const data = await res.json();
    setDebt(data);
  }

  function onBadgeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.preventDefault();

    if (e.key === "Enter") {
      const uid = bufferRef.current;
      bufferRef.current = "";
      if (uid) identify(uid);
      return;
    }

    if (e.key.length === 1) {
      bufferRef.current += e.key;
    }
  }

  function remainingQty(productId: number) {
    const product = products.find((p) => p.id === productId);
    if (!product) return 0;
    const inCart = cart[productId] || 0;
    return Math.max(0, product.qty - inCart);
  }

  function addToCart(productId: number) {
    if (remainingQty(productId) <= 0) {
      setStatus("Stock insuffisant.");
      return;
    }
    setCart((c) => ({ ...c, [productId]: (c[productId] || 0) + 1 }));
  }

  function removeFromCart(productId: number) {
    setCart((c) => {
      const next = { ...c };
      const q = next[productId] || 0;
      if (q <= 1) delete next[productId];
      else next[productId] = q - 1;
      return next;
    });
  }

  const cartLines = Object.entries(cart)
    .map(([pid, qty]) => {
      const p = products.find(x => x.id === Number(pid));
      return p ? { product: p, qty } : null;
    })
    .filter(Boolean) as Array<{ product: Product; qty: number }>;

  const totalCents = cartLines.reduce((sum, l) => sum + (l.product.price_cents ?? 0) * l.qty, 0);

  async function submitOrder() {
    if (!user) return;
    if (cartLines.length === 0) return;

    setStatus("Validation...");

    const payload = {
      user_id: user.id,
      items: cartLines.map(l => ({ product_id: l.product.id, qty: l.qty })),
    };

    const res = await fetch("/api/kiosk/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(err.error || `Erreur (${res.status})`);
      return;
    }

    setScreen("thanks");
    setStatus("Merci !");

    setTimeout(() => {
      setUser(null);
      setProducts([]);
      setCart({});
      setStatus("Badge pour commencer");
      setScreen("badge");
    }, 3000);
  }

  return (
    <div className="kiosk-root">
      <main className="kiosk-app">
        <input
          ref={inputRef}
          autoFocus
          inputMode="none"
          className="badge-input"
          onKeyDown={screen === "badge" ? onBadgeKeyDown : undefined}
        />

        {screen === "badge" && (
          <section className="badge-card">
            <img className="badge-logo" src={`${import.meta.env.BASE_URL}magellan-logo.png`} alt="Magellan" />


            <h1>Badgez pour commencer</h1>
            <p className="badge-status">{status}</p>
          </section>
        )}

        {screen === "products" && user && (
          <section className="kiosk-shell">
            <header className="kiosk-header">
              <div>
                <p className="kiosk-greeting">Bonjour</p>
                <h2>{user.name}</h2>
              </div>
              <div className="header-actions">
                <button
                  className="ghost-button"
                  onClick={async () => {
                    await loadDebt(user.id);
                    setScreen("debt");
                  }}
                >
                  Ma dette
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setScreen("badge");
                    setUser(null);
                    setCart({});
                    setStatus("Badgez pour commencer");
                  }}
                >
                  Déconnexion
                </button>
              </div>
            </header>

            <div className="kiosk-grid">
              <section className="products-card">
                <div className="section-title">
                  <h3>Boissons disponibles</h3>
                  <p>Choisissez vos produits, ils partent directement dans le panier.</p>
                </div>
                <div className="products-grid">
                {products.map(p => {
                  const remaining = Math.max(0, p.qty - (cart[p.id] || 0));
                  const canAdd = remaining > 0 && p.price_cents != null;
                  const slug = p.image_slug || "";
                  const showImage = slug && !imageErrors[slug];
                  return (
                  <button
                    key={p.id}
                    disabled={!canAdd}
                    onClick={() => addToCart(p.id)}
                    className={`product-tile ${canAdd ? "" : "is-disabled"}`}
                  >
                    <div className="tile-row">
                      {showImage && (
                        <img
                          className="tile-thumb"
                          src={`/products/${slug}.png`}
                          alt={p.name}
                          loading="lazy"
                          onError={() =>
                            setImageErrors((prev) => ({ ...prev, [slug]: true }))
                          }
                        />
                      )}
                      <div className="tile-info">
                        <div className="tile-title">{p.name}</div>
                        <div className="tile-status">{canAdd ? "Dispo" : "Indispo"}</div>
                      </div>
                      <div className="tile-price">
                        {p.price_cents == null ? "Prix manquant" : euros(p.price_cents)}
                      </div>
                    </div>
                  </button>
                );
                })}
                </div>
              </section>

              <aside className="cart-card">
                <div className="section-title">
                  <h3>Panier</h3>
                  <p>Verifiez vos choix avant de valider.</p>
                </div>

                {cartLines.length === 0 ? (
                  <p className="empty-state">Panier vide.</p>
                ) : (
                  <div className="cart-list">
                    {cartLines.map(l => (
                      <div key={l.product.id} className="cart-line">
                        <div>
                          <div className="cart-name">{l.product.name}</div>
                          <div className="cart-meta">
                            {Number(l.qty)} x {euros(l.product.price_cents!)}
                          </div>
                        </div>
                        <div className="cart-actions">
                          <button className="icon-button" onClick={() => removeFromCart(l.product.id)}>-</button>
                          <button className="icon-button" onClick={() => addToCart(l.product.id)}>+</button>
                        </div>
                      </div>
                    ))}

                    <div className="cart-total">
                      <span>Total</span>
                      <span>{euros(totalCents)}</span>
                    </div>

                    <button className="primary-button" onClick={submitOrder}>
                      Valider la commande
                    </button>
                  </div>
                )}
              </aside>
            </div>
          </section>
        )}

        {screen === "debt" && user && (
          <section className="debt-card">
            <header className="debt-header">
              <div>
                <p className="kiosk-greeting">Votre dette</p>
                <h2>{user.name}</h2>
              </div>
              <button className="ghost-button" onClick={() => setScreen("products")}>
                Retour
              </button>
            </header>

            {debtError && <p className="debt-error">{debtError}</p>}

            {!debt ? (
              <p className="empty-state">Chargement...</p>
            ) : (
              <div className="debt-grid">
                <div className="debt-total">
                  <span>Dette totale</span>
                  <strong>{euros(debt.total_cents)}</strong>
                  <div className="debt-split">
                    <span>Dette impayée: {euros(debt.unpaid_closed_cents)}</span>
                    <span>Dette en cours: {euros(debt.open_cents)}</span>
                  </div>
                </div>

                <div className="debt-items">
                  <h3>Consommations</h3>
                  {debt.items.length === 0 ? (
                    <p className="empty-state">Aucune consommation en cours.</p>
                  ) : (
                    <ul>
                      {debt.items.map((item) => (
                        <li key={item.product_id}>
                          <span>{item.product_name}</span>
                          <strong>{item.qty}</strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {screen === "thanks" && (
          <section className="thanks-card">
            <div className="thanks-icon">OK</div>
            <h1>Merci !</h1>
            <p>{status}</p>
          </section>
        )}
      </main>
      <footer className="app-footer">Développé par Delens Raphaël</footer>
    </div>
  );
}
