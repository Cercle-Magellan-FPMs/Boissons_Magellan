import { useEffect, useRef, useState } from "react";
import "./App.css";

type User = { id: number; name: string; email: string | null; is_active: number; balance_cents: number };
type Product = { id: number; name: string; price_cents: number | null; qty: number; available: boolean; image_slug?: string | null };
type Cart = Record<number, number>;
type DebtItem = { product_id: number; product_name: string; qty: number };
type DebtSummary = {
  balance_cents: number;
  unpaid_closed_cents: number;
  open_cents: number;
  total_cents: number;
  items: DebtItem[];
};
type BadgeRequestForm = { name: string; email: string; uid: string };

const insufficientBalanceMessage =
  "Solde insuffisant, merci de faire un virement au compte suivant : BE70 7512 1182 7125";

const badgeCharMap: Record<string, string> = {
  "à": "0",
  "&": "1",
  "!": "1",
  "é": "2",
  "\"": "3",
  "'": "4",
  "(": "5",
  "-": "6",
  "è": "7",
  "_": "8",
  "ç": "9",
};

function euros(cents: number) {
  return (cents / 100).toFixed(2) + " EUR";
}

function normalizeBadgeUid(value: string) {
  const compact = value.replace(/\s+/g, "").trim();
  const translated = Array.from(compact).map((char) => badgeCharMap[char] ?? char).join("");
  return translated.replace(/[^0-9A-Z]/gi, "").toUpperCase();
}

export default function App() {
  const [screen, setScreen] = useState<"badge" | "products" | "thanks">("badge");
  const [status, setStatus] = useState("Pas de badge ? Contactez le comité.");
  const [user, setUser] = useState<User | null>(null);
  const [blockedModal, setBlockedModal] = useState<{ title: string; message: string } | null>(null);
  const [paymentErrorModal, setPaymentErrorModal] = useState<string | null>(null);
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [badgeRequestOpen, setBadgeRequestOpen] = useState(false);
  const [badgeRequestForm, setBadgeRequestForm] = useState<BadgeRequestForm>({ name: "", email: "", uid: "" });
  const [badgeRequestMessage, setBadgeRequestMessage] = useState("");
  const [badgeRequestError, setBadgeRequestError] = useState("");
  const [badgeRequestSubmitting, setBadgeRequestSubmitting] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart>({});
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const [debt, setDebt] = useState<DebtSummary | null>(null);
  const [debtError, setDebtError] = useState("");
  const [imageErrors, setImageErrors] = useState<Record<string, true>>({});

  const inputRef = useRef<HTMLInputElement | null>(null);
  const scanTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (badgeRequestOpen) return;
    const focus = () => inputRef.current?.focus();
    focus();
    window.addEventListener("click", focus);
    const interval = window.setInterval(focus, 1000);
    return () => {
      window.removeEventListener("click", focus);
      window.clearInterval(interval);
    };
  }, [badgeRequestOpen]);

  function showBlockedModal(name?: string) {
    const baseMessage =
      "Votre compte est bloqué. Vous ne pouvez pas commander de boisson. Contactez le comité.";
    setBlockedModal({
      title: "Accès bloqué",
      message: name ? `${name}, ${baseMessage}` : baseMessage,
    });
    setUser(null);
    setProducts([]);
    setCart({});
    setCheckoutMessage("");
    setPaymentErrorModal(null);
    setDebtModalOpen(false);
    setScreen("badge");
    setStatus("Pas de badge ? Contactez le comité.");
  }

  async function identify(uidRaw: string) {
    const uid = normalizeBadgeUid(uidRaw);
    if (!uid) {
      setStatus("Badge vide ou invalide.");
      return;
    }
    setStatus(`Identification de ${uid}...`);

    const res = await fetch("/api/kiosk/identify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 403) {
        showBlockedModal(err.user?.name);
        return;
      }
      if (res.status === 409 && err.error === "Insufficient balance") {
        setStatus("Solde insuffisant. Rechargez votre compte avant de commander.");
        return;
      }
      if (res.status === 404) {
        setBadgeRequestForm((current) => ({ ...current, uid }));
        setBadgeRequestMessage("");
        setBadgeRequestError("");
        setBadgeRequestOpen(true);
        setStatus("Badge non reconnu. Remplissez le formulaire pour demander sa validation.");
        return;
      }
      const message = res.status === 409
        ? insufficientBalanceMessage
        : (err.error || `Erreur (${res.status})`);
      setCheckoutMessage(message);
      setStatus(message);
      return;
    }

    const data = await res.json();
    setUser(data.user);
    setStatus(`Bonjour ${data.user.name}.`);

    await loadProducts();
    setCart({});
    setCheckoutMessage("");
    setPaymentErrorModal(null);
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
      if (res.status === 403) {
        showBlockedModal(err.user?.name);
        return;
      }
      setDebtError(err.error || `Erreur (${res.status})`);
      setDebt(null);
      return;
    }

    const data = await res.json();
    setDebt(data);
    setUser((current) => current ? { ...current, balance_cents: Number(data.balance_cents ?? current.balance_cents) } : current);
  }

  function onBadgeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
      e.preventDefault();
      e.currentTarget.value = "";
      setStatus("Collage désactivé. Utilisez uniquement le lecteur badge.");
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      const uid = e.currentTarget.value;
      e.currentTarget.value = "";
      if (scanTimeoutRef.current) {
        window.clearTimeout(scanTimeoutRef.current);
        scanTimeoutRef.current = null;
      }
      if (uid) identify(uid);
      return;
    }
  }

  function onBadgeInput(e: React.FormEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const nativeEvent = e.nativeEvent as InputEvent | undefined;
    if (nativeEvent?.inputType === "insertFromPaste") {
      input.value = "";
      setStatus("Collage désactivé. Utilisez uniquement le lecteur badge.");
      return;
    }
    if (scanTimeoutRef.current) {
      window.clearTimeout(scanTimeoutRef.current);
    }
    scanTimeoutRef.current = window.setTimeout(() => {
      const uid = input.value;
      input.value = "";
      scanTimeoutRef.current = null;
      if (uid) identify(uid);
    }, 120);
  }

  function addToCart(productId: number) {
    const product = products.find((p) => p.id === productId);
    if (!product || product.price_cents == null) {
      setStatus("Produit indisponible.");
      return;
    }
    setCheckoutMessage("");
    setPaymentErrorModal(null);
    setCart((c) => ({ ...c, [productId]: (c[productId] || 0) + 1 }));
  }

  function removeFromCart(productId: number) {
    setCheckoutMessage("");
    setPaymentErrorModal(null);
    setCart((c) => {
      const next = { ...c };
      const q = next[productId] || 0;
      if (q <= 1) delete next[productId];
      else next[productId] = q - 1;
      return next;
    });
  }

  function openBadgeRequestForm(uid = "") {
    setBadgeRequestForm({ name: "", email: "", uid });
    setBadgeRequestMessage("");
    setBadgeRequestError("");
    setBadgeRequestOpen(true);
  }

  async function submitBadgeRequest(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = badgeRequestForm.name.trim();
    const email = badgeRequestForm.email.trim();
    const uid = normalizeBadgeUid(badgeRequestForm.uid);

    setBadgeRequestMessage("");
    setBadgeRequestError("");

    if (!name || !email || !uid) {
      setBadgeRequestError("Nom, email et badge sont obligatoires.");
      return;
    }

    setBadgeRequestSubmitting(true);
    try {
      const res = await fetch("/api/kiosk/badge-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, rfid_uid: uid }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setBadgeRequestError(err.error || `Erreur (${res.status})`);
        return;
      }

      setBadgeRequestForm({ name: "", email: "", uid: "" });
      setBadgeRequestMessage("Demande envoyée. Le badge fonctionnera après validation par le comité.");
      setStatus("Demande de badge envoyée. Le comité doit la valider.");
    } catch {
      setBadgeRequestError("Impossible d'envoyer la demande pour le moment.");
    } finally {
      setBadgeRequestSubmitting(false);
    }
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
      if (res.status === 403) {
        showBlockedModal(err.user?.name);
        return;
      }
      const message = res.status === 409
        ? insufficientBalanceMessage
        : (err.error || `Erreur (${res.status})`);
      setCheckoutMessage(message);
      setStatus(message);
      if (res.status === 409) setPaymentErrorModal(message);
      return;
    }

    const data = await res.json();
    setUser((current) => current ? { ...current, balance_cents: Number(data.balance_cents ?? current.balance_cents) } : current);
    setScreen("thanks");
    setStatus(`Commande enregistree. Solde restant: ${euros(Number(data.balance_cents ?? 0))}`);

    setTimeout(() => {
      setUser(null);
      setProducts([]);
      setCart({});
      setCheckoutMessage("");
      setPaymentErrorModal(null);
      setDebtModalOpen(false);
      setStatus("Pas de badge ? Contactez le comité.");
      setScreen("badge");
    }, 3000);
  }

  async function requestAccountDetail() {
    if (!user) return;
    setStatus("Envoi de votre détail par email...");

    const res = await fetch("/api/kiosk/account-detail/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: user.id }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setStatus(err.error || `Erreur (${res.status})`);
      return;
    }

    setStatus(`Détail envoyé à ${user.email ?? "votre adresse email"}.`);
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
          onInput={screen === "badge" ? onBadgeInput : undefined}
          onPaste={screen === "badge" ? (e) => {
            e.preventDefault();
            e.currentTarget.value = "";
            setStatus("Collage désactivé. Utilisez uniquement le lecteur badge.");
          } : undefined}
          onDrop={screen === "badge" ? (e) => {
            e.preventDefault();
            e.currentTarget.value = "";
            setStatus("Glisser-déposer désactivé. Utilisez uniquement le lecteur badge.");
          } : undefined}
        />

        {screen === "badge" && (
          <section className="badge-card">
            <img className="badge-logo" src={`${import.meta.env.BASE_URL}magellan-logo.png`} alt="Magellan" />


            <h1>Badgez pour commencer</h1>
            <p className="badge-status">{status}</p>
            <button className="primary-button" onClick={() => openBadgeRequestForm()}>
              Demander un compte / badge
            </button>
          </section>
        )}

        {screen === "products" && user && (
          <section className="kiosk-shell">
            <header className="kiosk-header">
              <div>
                <p className="kiosk-greeting">Bonjour</p>
                <h2>{user.name}</h2>
                <p className="badge-status">Solde: {euros(user.balance_cents)}</p>
              </div>
              <div className="header-actions">
                <button
                  className="ghost-button"
                  onClick={async () => {
                    await loadDebt(user.id);
                    setDebtModalOpen(true);
                  }}
                >
                  Mon compte
                </button>
                <button className="ghost-button" onClick={requestAccountDetail}>
                  Demander mon détail
                </button>
                <button
                  className="ghost-button"
                  onClick={() => {
                    setScreen("badge");
                    setUser(null);
                    setCart({});
                    setCheckoutMessage("");
                    setPaymentErrorModal(null);
                    setDebtModalOpen(false);
                    setStatus("Pas de badge ? Contactez le comité.");
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
                  const canAdd = p.price_cents != null;
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
                        <div className="tile-status">{canAdd ? "Disponible" : "Prix manquant"}</div>
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

                    {checkoutMessage && (
                      <p className="checkout-message" role="alert">
                        {checkoutMessage}
                      </p>
                    )}

                    <button className="primary-button" onClick={submitOrder}>
                      Valider la commande
                    </button>
                  </div>
                )}
              </aside>
            </div>
          </section>
        )}

        {debtModalOpen && user && (
          <div className="debt-modal-backdrop" role="dialog" aria-modal="true">
            <section className="debt-card debt-modal">
              <header className="debt-header">
                <div>
                  <p className="kiosk-greeting">Votre compte</p>
                  <h2>{user.name}</h2>
                </div>
                <button className="ghost-button" onClick={() => setDebtModalOpen(false)}>
                  Fermer
                </button>
              </header>

              {debtError && <p className="debt-error">{debtError}</p>}

              {!debt ? (
                <p className="empty-state">Chargement...</p>
              ) : (
                <div className="debt-grid">
                  <div className="debt-total">
                    <span>Solde disponible</span>
                    <strong>{euros(debt.balance_cents)}</strong>
                    <div className="debt-split">
                      <span>Dette totale: {euros(debt.total_cents)}</span>
                      <span>Dette impayee: {euros(debt.unpaid_closed_cents)}</span>
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
          </div>
        )}
        {screen === "thanks" && (
          <section className="thanks-card">
            <img
              className="thanks-logo"
              src={`${import.meta.env.BASE_URL}magellan-logo.png`}
              alt="Magellan"
            />
            <h1>Merci !</h1>
            <p>{status}</p>
          </section>
        )}
      </main>
      {badgeRequestOpen && (
        <div className="badge-request-backdrop" role="dialog" aria-modal="true">
          <form className="badge-request-modal" onSubmit={submitBadgeRequest}>
            <div>
              <h2>Demande de badge</h2>
              <p>
                Créez une demande avec votre nom, votre email et le badge à valider.
                Le badge ne fonctionnera qu'après validation dans l'admin.
              </p>
            </div>

            <label>
              <span>Nom</span>
              <input
                value={badgeRequestForm.name}
                onChange={(e) => setBadgeRequestForm((current) => ({ ...current, name: e.target.value }))}
                placeholder="Nom et prénom"
                autoFocus
              />
            </label>

            <label>
              <span>Email</span>
              <input
                type="email"
                value={badgeRequestForm.email}
                onChange={(e) => setBadgeRequestForm((current) => ({ ...current, email: e.target.value }))}
                placeholder="prenom.nom@example.com"
              />
            </label>

            <label>
              <span>Badge</span>
              <input
                value={badgeRequestForm.uid}
                onChange={(e) => setBadgeRequestForm((current) => ({ ...current, uid: e.target.value }))}
                placeholder="Scanner ou saisir le badge"
              />
            </label>

            {badgeRequestError && <p className="badge-request-error">{badgeRequestError}</p>}
            {badgeRequestMessage && <p className="badge-request-success">{badgeRequestMessage}</p>}

            <div className="badge-request-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => setBadgeRequestOpen(false)}
              >
                Fermer
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={badgeRequestSubmitting}
              >
                {badgeRequestSubmitting ? "Envoi..." : "Envoyer la demande"}
              </button>
            </div>
          </form>
        </div>
      )}
      {blockedModal && (
        <div className="blocked-modal-backdrop" role="dialog" aria-modal="true">
          <div className="blocked-modal">
            <h2>{blockedModal.title}</h2>
            <p>{blockedModal.message}</p>
            <div className="blocked-modal-actions">
              <button
                className="blocked-modal-button"
                onClick={() => setBlockedModal(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {paymentErrorModal && (
        <div className="payment-modal-backdrop" role="dialog" aria-modal="true">
          <div className="payment-modal">
            <h2>Solde insuffisant</h2>
            <p>{paymentErrorModal}</p>
            <div className="payment-modal-actions">
              <button
                className="payment-modal-button"
                onClick={() => setPaymentErrorModal(null)}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      <footer className="app-footer">Développé par Delens Raphaël</footer>
    </div>
  );
}
