import { useEffect, useRef, useState } from "react";
import "./App.css";

type User = {
    id: number;
    name: string;
    email: string | null;
    is_active: number;
    balance_cents: number;
    topup_access: number;
};
type Product = {
    id: number;
    name: string;
    price_cents: number | null;
    qty: number;
    available: boolean;
    image_slug?: string | null;
};
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
type BadgeRequestField = keyof BadgeRequestForm;
type AccountDetailDialog = "confirm" | "success" | null;
type QrPaymentData = {
    unique_id: string;
    amount_cents: number;
    recipient_name: string;
    iban: string;
    bic: string;
    remittance: string;
    qr_code_data_url: string;
    intent_token: string;
    expires_at: string;
};

const insufficientBalanceMessage =
    "Solde insuffisant, merci de faire un virement au compte suivant : BE70 7512 1182 7125";

const badgeCharMap: Record<string, string> = {
    à: "0",
    "&": "1",
    "!": "1",
    é: "2",
    '"': "3",
    "'": "4",
    "(": "5",
    "-": "6",
    è: "7",
    _: "8",
    ç: "9",
};

function euros(cents: number) {
    return (cents / 100).toFixed(2) + " EUR";
}

function normalizeBadgeUid(value: string) {
    const compact = value.replace(/\s+/g, "").trim();
    const translated = Array.from(compact)
        .map((char) => badgeCharMap[char] ?? char)
        .join("");
    return translated.replace(/[^0-9A-Z]/gi, "").toUpperCase();
}

const AUTO_BADGE_LOCK_THRESHOLD_MS = 1000;
const badgeRequestFieldOrder: BadgeRequestField[] = ["name", "email", "uid"];
const badgeRequestKeyboardRows = [
    ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
    ["a", "z", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["q", "s", "d", "f", "g", "h", "j", "k", "l", "m"],
    ["w", "x", "c", "v", "b", "n", "é", "è", "à", "ç"],
    ["'", "-", "_", ".", "@"],
];

function normalizeBadgeRequestFieldValue(
    field: BadgeRequestField,
    value: string,
) {
    if (field === "uid") return normalizeBadgeUid(value);
    if (field === "email") return value.replace(/\s+/g, "").toLowerCase();
    return value.replace(/\s{2,}/g, " ");
}

export default function App() {
    const [screen, setScreen] = useState<"badge" | "products" | "thanks">(
        "badge",
    );
    const [status, setStatus] = useState("Pas de badge ? Contactez le comité.");
    const [user, setUser] = useState<User | null>(null);
    const [blockedModal, setBlockedModal] = useState<{
        title: string;
        message: string;
    } | null>(null);
    const [paymentErrorModal, setPaymentErrorModal] = useState<string | null>(
        null,
    );
    const [qrModalOpen, setQrModalOpen] = useState(false);
    const [qrPaymentData, setQrPaymentData] = useState<QrPaymentData | null>(
        null,
    );
    const [qrLoading, setQrLoading] = useState(false);
    const [qrError, setQrError] = useState("");
    const [qrConfirmLoading, setQrConfirmLoading] = useState(false);
    const [topupModalOpen, setTopupModalOpen] = useState(false);
    const [topupAmount, setTopupAmount] = useState("10");
    const [topupLoading, setTopupLoading] = useState(false);
    const [topupError, setTopupError] = useState("");
    const [topupQrData, setTopupQrData] = useState<{
        unique_id: string;
        amount_cents: number;
        recipient_name: string;
        iban: string;
        bic: string;
        remittance: string;
        qr_code_data_url: string;
    } | null>(null);
    const [debtModalOpen, setDebtModalOpen] = useState(false);
    const [accountDetailDialog, setAccountDetailDialog] =
        useState<AccountDetailDialog>(null);
    const [accountDetailError, setAccountDetailError] = useState("");
    const [accountDetailSubmitting, setAccountDetailSubmitting] =
        useState(false);
    const [badgeRequestOpen, setBadgeRequestOpen] = useState(false);
    const [badgeRequestForm, setBadgeRequestForm] = useState<BadgeRequestForm>({
        name: "",
        email: "",
        uid: "",
    });
    const [badgeRequestMessage, setBadgeRequestMessage] = useState("");
    const [badgeRequestError, setBadgeRequestError] = useState("");
    const [badgeRequestSubmitting, setBadgeRequestSubmitting] = useState(false);
    const [badgeRequestActiveField, setBadgeRequestActiveField] =
        useState<BadgeRequestField>("name");
    const [badgeRequestShift, setBadgeRequestShift] = useState(false);
    const [badgeRequestUidLocked, setBadgeRequestUidLocked] = useState(false);

    const [products, setProducts] = useState<Product[]>([]);
    const [cart, setCart] = useState<Cart>({});
    const [checkoutMessage, setCheckoutMessage] = useState("");
    const [debt, setDebt] = useState<DebtSummary | null>(null);
    const [debtError, setDebtError] = useState("");
    const [imageErrors, setImageErrors] = useState<Record<string, true>>({});

    const inputRef = useRef<HTMLInputElement | null>(null);
    const scanTimeoutRef = useRef<number | null>(null);
    const scanStartedAtRef = useRef<number | null>(null);

    useEffect(() => {
        if (badgeRequestOpen || accountDetailDialog) return;
        const focus = () => inputRef.current?.focus();
        focus();
        window.addEventListener("click", focus);
        const interval = window.setInterval(focus, 1000);
        return () => {
            window.removeEventListener("click", focus);
            window.clearInterval(interval);
        };
    }, [badgeRequestOpen, accountDetailDialog]);

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
        setQrModalOpen(false);
        setQrPaymentData(null);
        setQrError("");
        setDebtModalOpen(false);
        setAccountDetailDialog(null);
        setScreen("badge");
        setStatus("Pas de badge ? Contactez le comité.");
    }

    async function identify(uidRaw: string, scanDurationMs?: number) {
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
                setStatus(
                    "Solde insuffisant. Rechargez votre compte avant de commander.",
                );
                return;
            }
            if (res.status === 404) {
                const lockScannedBadge =
                    typeof scanDurationMs === "number" &&
                    scanDurationMs <= AUTO_BADGE_LOCK_THRESHOLD_MS;
                setBadgeRequestForm((current) => ({ ...current, uid }));
                setBadgeRequestActiveField("name");
                setBadgeRequestShift(false);
                setBadgeRequestUidLocked(lockScannedBadge);
                setBadgeRequestMessage("");
                setBadgeRequestError("");
                setBadgeRequestOpen(true);
                setStatus(
                    lockScannedBadge
                        ? "Badge non reconnu. Le badge scanné est verrouillé, remplissez votre nom et email."
                        : "Badge non reconnu. Remplissez le formulaire pour demander sa validation.",
                );
                return;
            }
            const message =
                res.status === 409
                    ? insufficientBalanceMessage
                    : err.error || `Erreur (${res.status})`;
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
        setQrModalOpen(false);
        setQrPaymentData(null);
        setQrError("");
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
        setUser((current) =>
            current
                ? {
                      ...current,
                      balance_cents: Number(
                          data.balance_cents ?? current.balance_cents,
                      ),
                  }
                : current,
        );
    }

    function onBadgeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
            e.preventDefault();
            e.currentTarget.value = "";
            setStatus(
                "Collage désactivé. Utilisez uniquement le lecteur badge.",
            );
            return;
        }

        if (e.key === "Enter") {
            e.preventDefault();
            const uid = e.currentTarget.value;
            const scanDurationMs =
                scanStartedAtRef.current == null
                    ? 0
                    : performance.now() - scanStartedAtRef.current;
            e.currentTarget.value = "";
            scanStartedAtRef.current = null;
            if (scanTimeoutRef.current) {
                window.clearTimeout(scanTimeoutRef.current);
                scanTimeoutRef.current = null;
            }
            if (uid) identify(uid, scanDurationMs);
            return;
        }
    }

    function onBadgeInput(e: React.FormEvent<HTMLInputElement>) {
        const input = e.currentTarget;
        const nativeEvent = e.nativeEvent as InputEvent | undefined;
        if (nativeEvent?.inputType === "insertFromPaste") {
            input.value = "";
            setStatus(
                "Collage désactivé. Utilisez uniquement le lecteur badge.",
            );
            return;
        }
        if (scanStartedAtRef.current == null && input.value) {
            scanStartedAtRef.current = performance.now();
        }
        if (scanTimeoutRef.current) {
            window.clearTimeout(scanTimeoutRef.current);
        }
        scanTimeoutRef.current = window.setTimeout(() => {
            const uid = input.value;
            const scanDurationMs =
                scanStartedAtRef.current == null
                    ? 0
                    : performance.now() - scanStartedAtRef.current;
            input.value = "";
            scanStartedAtRef.current = null;
            scanTimeoutRef.current = null;
            if (uid) identify(uid, scanDurationMs);
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
        setBadgeRequestActiveField(uid ? "name" : "uid");
        setBadgeRequestShift(false);
        setBadgeRequestUidLocked(false);
        setBadgeRequestMessage("");
        setBadgeRequestError("");
        setBadgeRequestOpen(true);
    }

    function setBadgeRequestFieldValue(
        field: BadgeRequestField,
        value: string,
    ) {
        if (field === "uid" && badgeRequestUidLocked) return;
        setBadgeRequestForm((current) => ({
            ...current,
            [field]: normalizeBadgeRequestFieldValue(field, value),
        }));
    }

    function appendBadgeRequestText(text: string) {
        if (badgeRequestActiveField === "uid" && badgeRequestUidLocked) return;
        setBadgeRequestForm((current) => {
            const next = current[badgeRequestActiveField] + text;
            return {
                ...current,
                [badgeRequestActiveField]: normalizeBadgeRequestFieldValue(
                    badgeRequestActiveField,
                    next,
                ),
            };
        });
        if (badgeRequestShift && /^[a-zéèàç]$/i.test(text))
            setBadgeRequestShift(false);
    }

    function backspaceBadgeRequestField() {
        if (badgeRequestActiveField === "uid" && badgeRequestUidLocked) return;
        setBadgeRequestForm((current) => {
            const next = current[badgeRequestActiveField].slice(0, -1);
            return {
                ...current,
                [badgeRequestActiveField]: normalizeBadgeRequestFieldValue(
                    badgeRequestActiveField,
                    next,
                ),
            };
        });
    }

    function clearBadgeRequestField() {
        if (badgeRequestActiveField === "uid" && badgeRequestUidLocked) return;
        setBadgeRequestForm((current) => ({
            ...current,
            [badgeRequestActiveField]: "",
        }));
    }

    function focusNextBadgeRequestField() {
        const currentIndex = badgeRequestFieldOrder.indexOf(
            badgeRequestActiveField,
        );
        const nextField =
            badgeRequestFieldOrder[
                (currentIndex + 1) % badgeRequestFieldOrder.length
            ];
        setBadgeRequestActiveField(nextField);
        setBadgeRequestShift(false);
    }

    function renderBadgeRequestKeyboard() {
        return (
            <div className="onscreen-keyboard" aria-label="Clavier virtuel">
                {badgeRequestKeyboardRows.map((row, rowIndex) => (
                    <div className="keyboard-row" key={rowIndex}>
                        {row.map((key) => {
                            const label =
                                badgeRequestShift && /^[a-zéèàç]$/.test(key)
                                    ? key.toUpperCase()
                                    : key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    className="keyboard-key"
                                    onClick={() =>
                                        appendBadgeRequestText(label)
                                    }
                                >
                                    {label}
                                </button>
                            );
                        })}
                    </div>
                ))}
                <div className="keyboard-row keyboard-row-actions">
                    <button
                        type="button"
                        className={`keyboard-key keyboard-wide ${badgeRequestShift ? "is-active" : ""}`}
                        onClick={() => setBadgeRequestShift((value) => !value)}
                    >
                        Maj
                    </button>
                    <button
                        type="button"
                        className="keyboard-key keyboard-extra-wide"
                        onClick={() => appendBadgeRequestText(" ")}
                        disabled={badgeRequestActiveField !== "name"}
                    >
                        Espace
                    </button>
                    <button
                        type="button"
                        className="keyboard-key keyboard-wide"
                        onClick={backspaceBadgeRequestField}
                        disabled={
                            badgeRequestActiveField === "uid" &&
                            badgeRequestUidLocked
                        }
                    >
                        Suppr
                    </button>
                </div>
                <div className="keyboard-row keyboard-row-actions">
                    <button
                        type="button"
                        className="keyboard-key keyboard-wide"
                        onClick={() => appendBadgeRequestText(".be")}
                        disabled={badgeRequestActiveField !== "email"}
                    >
                        .be
                    </button>
                    <button
                        type="button"
                        className="keyboard-key keyboard-wide"
                        onClick={() => appendBadgeRequestText(".com")}
                        disabled={badgeRequestActiveField !== "email"}
                    >
                        .com
                    </button>
                    <button
                        type="button"
                        className="keyboard-key keyboard-wide"
                        onClick={clearBadgeRequestField}
                        disabled={
                            badgeRequestActiveField === "uid" &&
                            badgeRequestUidLocked
                        }
                    >
                        Effacer
                    </button>
                    <button
                        type="button"
                        className="keyboard-key keyboard-wide"
                        onClick={focusNextBadgeRequestField}
                    >
                        Suivant
                    </button>
                </div>
            </div>
        );
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
            setBadgeRequestMessage("");
            setStatus("Demande de badge envoyée. Le comité doit la valider.");
            setBadgeRequestOpen(false);
        } catch {
            setBadgeRequestError(
                "Impossible d'envoyer la demande pour le moment.",
            );
        } finally {
            setBadgeRequestSubmitting(false);
        }
    }

    const cartLines = Object.entries(cart)
        .map(([pid, qty]) => {
            const p = products.find((x) => x.id === Number(pid));
            return p ? { product: p, qty } : null;
        })
        .filter(Boolean) as Array<{ product: Product; qty: number }>;

    const totalCents = cartLines.reduce(
        (sum, l) => sum + (l.product.price_cents ?? 0) * l.qty,
        0,
    );

    async function prepareQrPayment() {
        if (!user || totalCents <= 0) return;

        setQrLoading(true);
        setQrError("");
        setQrPaymentData(null);
        setQrModalOpen(true);

        try {
            const res = await fetch("/api/kiosk/qr-code/prepare", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: user.id,
                    amount_cents: totalCents,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setQrError(err.error || `Erreur (${res.status})`);
                return;
            }

            const data = (await res.json()) as QrPaymentData;
            setQrPaymentData(data);
        } catch {
            setQrError("Impossible de générer le QR Code pour le moment.");
        } finally {
            setQrLoading(false);
        }
    }

    async function confirmQrPayment() {
        if (!user || !qrPaymentData) return;

        setQrConfirmLoading(true);
        setQrError("");

        try {
            const res = await fetch("/api/kiosk/qr-code/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: user.id,
                    amount_cents: qrPaymentData.amount_cents,
                    unique_id: qrPaymentData.unique_id,
                    intent_token: qrPaymentData.intent_token,
                    items: cartLines.map((line) => ({
                        product_id: line.product.id,
                        qty: Number(line.qty),
                    })),
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setQrError(err.error || `Erreur (${res.status})`);
                return;
            }

            setQrModalOpen(false);
            setPaymentErrorModal(null);
            setCheckoutMessage("");
            setQrPaymentData(null);
            setQrError("");
            setScreen("thanks");
            setStatus(
                `Paiement QR Code déclaré (${qrPaymentData.unique_id}), vérification en attente.`,
            );

            setTimeout(() => {
                setCart({});
                setUser(null);
                setProducts([]);
                setDebtModalOpen(false);
                setAccountDetailDialog(null);
                setScreen("badge");
                setStatus("Pas de badge ? Contactez le comité.");
            }, 3000);
        } catch {
            setQrError("Impossible d'enregistrer la déclaration de paiement.");
        } finally {
            setQrConfirmLoading(false);
        }
    }

    async function submitOrder() {
        if (!user) return;
        if (cartLines.length === 0) return;

        setStatus("Validation...");

        const payload = {
            user_id: user.id,
            items: cartLines.map((l) => ({
                product_id: l.product.id,
                qty: l.qty,
            })),
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
            const message =
                res.status === 409
                    ? insufficientBalanceMessage
                    : err.error || `Erreur (${res.status})`;
            setCheckoutMessage(message);
            setStatus(message);
            if (res.status === 409) setPaymentErrorModal(message);
            return;
        }

        const data = await res.json();
        setUser((current) =>
            current
                ? {
                      ...current,
                      balance_cents: Number(
                          data.balance_cents ?? current.balance_cents,
                      ),
                  }
                : current,
        );
        setScreen("thanks");
        setStatus(
            `Commande enregistree. Solde restant: ${euros(Number(data.balance_cents ?? 0))}`,
        );

        setTimeout(() => {
            setUser(null);
            setProducts([]);
            setCart({});
            setCheckoutMessage("");
            setPaymentErrorModal(null);
            setQrModalOpen(false);
            setQrPaymentData(null);
            setQrError("");
            setDebtModalOpen(false);
            setAccountDetailDialog(null);
            setStatus("Pas de badge ? Contactez le comité.");
            setScreen("badge");
        }, 3000);
    }

    async function requestAccountDetail() {
        if (!user) return;
        setAccountDetailError("");
        setAccountDetailDialog("confirm");
    }

    async function sendAccountDetail() {
        if (!user) return;
        setStatus("Envoi de votre détail par email...");
        setAccountDetailError("");
        setAccountDetailSubmitting(true);

        try {
            const res = await fetch("/api/kiosk/account-detail/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: user.id }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const message = err.error || `Erreur (${res.status})`;
                setAccountDetailError(message);
                setStatus(message);
                return;
            }

            setStatus(
                `Détail envoyé à ${user.email ?? "votre adresse email"}.`,
            );
            setAccountDetailDialog("success");
        } catch {
            const message = "Impossible d'envoyer le détail pour le moment.";
            setAccountDetailError(message);
            setStatus(message);
        } finally {
            setAccountDetailSubmitting(false);
        }
    }

    function openTopupModal() {
        setTopupAmount("10");
        setTopupError("");
        setTopupQrData(null);
        setTopupModalOpen(true);
    }

    async function generateTopupQr() {
        if (!user) return;
        const value = Math.round(Number(topupAmount.replace(",", ".")) * 100);
        if (!Number.isFinite(value) || value <= 0) {
            setTopupError("Montant invalide");
            return;
        }

        setTopupLoading(true);
        setTopupError("");
        setTopupQrData(null);

        try {
            const res = await fetch("/api/kiosk/topup-qr/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: user.id,
                    amount_cents: value,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                setTopupError(err.error || `Erreur (${res.status})`);
                return;
            }

            const data = await res.json();
            setTopupQrData(data);
        } catch {
            setTopupError("Impossible de générer le QR Code pour le moment.");
        } finally {
            setTopupLoading(false);
        }
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
                    onPaste={
                        screen === "badge"
                            ? (e) => {
                                  e.preventDefault();
                                  e.currentTarget.value = "";
                                  setStatus(
                                      "Collage désactivé. Utilisez uniquement le lecteur badge.",
                                  );
                              }
                            : undefined
                    }
                    onDrop={
                        screen === "badge"
                            ? (e) => {
                                  e.preventDefault();
                                  e.currentTarget.value = "";
                                  setStatus(
                                      "Glisser-déposer désactivé. Utilisez uniquement le lecteur badge.",
                                  );
                              }
                            : undefined
                    }
                />

                {screen === "badge" && (
                    <section className="badge-card">
                        <img
                            className="badge-logo"
                            src={`${import.meta.env.BASE_URL}magellan-logo.png`}
                            alt="Magellan"
                        />

                        <h1>Badgez pour commencer</h1>
                        <p className="badge-status">{status}</p>
                        <button
                            className="primary-button"
                            onClick={() => openBadgeRequestForm()}
                        >
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
                                <p className="badge-status">
                                    Solde: {euros(user.balance_cents)}
                                </p>
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
                                <button
                                    className="ghost-button"
                                    onClick={requestAccountDetail}
                                >
                                    Demander mon détail
                                </button>
                                {user.topup_access === 1 ? (
                                    <button
                                        className="ghost-button"
                                        onClick={openTopupModal}
                                    >
                                        💰 Recharger
                                    </button>
                                ) : (
                                    <span
                                        style={{
                                            opacity: 0.6,
                                            fontSize: "0.85rem",
                                            padding: "6px 10px",
                                        }}
                                    >
                                        🚫 Top-up bloqué
                                    </span>
                                )}
                                <button
                                    className="ghost-button"
                                    onClick={() => {
                                        setScreen("badge");
                                        setUser(null);
                                        setCart({});
                                        setCheckoutMessage("");
                                        setPaymentErrorModal(null);
                                        setQrModalOpen(false);
                                        setQrPaymentData(null);
                                        setQrError("");
                                        setDebtModalOpen(false);
                                        setAccountDetailDialog(null);
                                        setStatus(
                                            "Pas de badge ? Contactez le comité.",
                                        );
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
                                    <p>
                                        Choisissez vos produits, ils partent
                                        directement dans le panier.
                                    </p>
                                </div>
                                <div className="products-grid">
                                    {products.map((p) => {
                                        const canAdd = p.price_cents != null;
                                        const slug = p.image_slug || "";
                                        const showImage =
                                            slug && !imageErrors[slug];
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
                                                                setImageErrors(
                                                                    (prev) => ({
                                                                        ...prev,
                                                                        [slug]: true,
                                                                    }),
                                                                )
                                                            }
                                                        />
                                                    )}
                                                    <div className="tile-info">
                                                        <div className="tile-title">
                                                            {p.name}
                                                        </div>
                                                        <div className="tile-status">
                                                            {canAdd
                                                                ? "Disponible"
                                                                : "Prix manquant"}
                                                        </div>
                                                    </div>
                                                    <div className="tile-price">
                                                        {p.price_cents == null
                                                            ? "Prix manquant"
                                                            : euros(
                                                                  p.price_cents,
                                                              )}
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
                                        {cartLines.map((l) => (
                                            <div
                                                key={l.product.id}
                                                className="cart-line"
                                            >
                                                <div>
                                                    <div className="cart-name">
                                                        {l.product.name}
                                                    </div>
                                                    <div className="cart-meta">
                                                        {Number(l.qty)} x{" "}
                                                        {euros(
                                                            l.product
                                                                .price_cents!,
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="cart-actions">
                                                    <button
                                                        className="icon-button"
                                                        onClick={() =>
                                                            removeFromCart(
                                                                l.product.id,
                                                            )
                                                        }
                                                    >
                                                        -
                                                    </button>
                                                    <button
                                                        className="icon-button"
                                                        onClick={() =>
                                                            addToCart(
                                                                l.product.id,
                                                            )
                                                        }
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </div>
                                        ))}

                                        <div className="cart-total">
                                            <span>Total</span>
                                            <span>{euros(totalCents)}</span>
                                        </div>

                                        {checkoutMessage && (
                                            <p
                                                className="checkout-message"
                                                role="alert"
                                            >
                                                {checkoutMessage}
                                            </p>
                                        )}

                                        <button
                                            className="primary-button"
                                            onClick={submitOrder}
                                        >
                                            Valider la commande
                                        </button>
                                    </div>
                                )}
                            </aside>
                        </div>
                    </section>
                )}

                {debtModalOpen && user && (
                    <div
                        className="debt-modal-backdrop"
                        role="dialog"
                        aria-modal="true"
                    >
                        <section className="debt-card debt-modal">
                            <header className="debt-header">
                                <div>
                                    <p className="kiosk-greeting">
                                        Votre compte
                                    </p>
                                    <h2>{user.name}</h2>
                                </div>
                                <button
                                    className="ghost-button"
                                    onClick={() => setDebtModalOpen(false)}
                                >
                                    Fermer
                                </button>
                            </header>

                            {debtError && (
                                <p className="debt-error">{debtError}</p>
                            )}

                            {!debt ? (
                                <p className="empty-state">Chargement...</p>
                            ) : (
                                <div className="debt-grid">
                                    <div className="debt-total">
                                        <span>Solde disponible</span>
                                        <strong>
                                            {euros(debt.balance_cents)}
                                        </strong>
                                        <div className="debt-split">
                                            <span>
                                                Dette totale:{" "}
                                                {euros(debt.total_cents)}
                                            </span>
                                            <span>
                                                Dette impayee:{" "}
                                                {euros(
                                                    debt.unpaid_closed_cents,
                                                )}
                                            </span>
                                            <span>
                                                Dette en cours:{" "}
                                                {euros(debt.open_cents)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="debt-items">
                                        <h3>Consommations</h3>
                                        {debt.items.length === 0 ? (
                                            <p className="empty-state">
                                                Aucune consommation en cours.
                                            </p>
                                        ) : (
                                            <ul>
                                                {debt.items.map((item) => (
                                                    <li key={item.product_id}>
                                                        <span>
                                                            {item.product_name}
                                                        </span>
                                                        <strong>
                                                            {item.qty}
                                                        </strong>
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
            {accountDetailDialog && user && (
                <div
                    className="account-detail-backdrop"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="account-detail-modal">
                        {accountDetailDialog === "confirm" ? (
                            <>
                                <h2>Envoyer votre détail ?</h2>
                                <p>
                                    Nous allons envoyer vos top-ups et
                                    consommations à{" "}
                                    <strong>
                                        {user.email ?? "votre adresse email"}
                                    </strong>
                                    .
                                </p>
                                {accountDetailError && (
                                    <p className="account-detail-error">
                                        {accountDetailError}
                                    </p>
                                )}
                                <div className="account-detail-actions">
                                    <button
                                        type="button"
                                        className="ghost-button"
                                        onClick={() =>
                                            setAccountDetailDialog(null)
                                        }
                                        disabled={accountDetailSubmitting}
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        type="button"
                                        className="primary-button"
                                        onClick={sendAccountDetail}
                                        disabled={accountDetailSubmitting}
                                    >
                                        {accountDetailSubmitting
                                            ? "Envoi..."
                                            : "Confirmer l'envoi"}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2>Email envoyé</h2>
                                <p>
                                    Votre détail a bien été envoyé à{" "}
                                    {user.email ?? "votre adresse email"}.
                                </p>
                                <div className="account-detail-actions">
                                    <button
                                        type="button"
                                        className="primary-button"
                                        onClick={() =>
                                            setAccountDetailDialog(null)
                                        }
                                    >
                                        OK
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            {badgeRequestOpen && (
                <div
                    className="badge-request-backdrop"
                    role="dialog"
                    aria-modal="true"
                >
                    <form
                        className="badge-request-modal"
                        onSubmit={submitBadgeRequest}
                    >
                        <div>
                            <h2>Demande de badge</h2>
                            <p>
                                Créez une demande avec votre nom, votre email et
                                le badge à valider. Le badge ne fonctionnera
                                qu'après validation dans l'admin.
                            </p>
                        </div>

                        <label>
                            <span>Nom</span>
                            <input
                                value={badgeRequestForm.name}
                                onFocus={() =>
                                    setBadgeRequestActiveField("name")
                                }
                                onChange={(e) =>
                                    setBadgeRequestFieldValue(
                                        "name",
                                        e.target.value,
                                    )
                                }
                                placeholder="Nom et prénom"
                                inputMode="none"
                                autoFocus
                                className={
                                    badgeRequestActiveField === "name"
                                        ? "keyboard-target is-active"
                                        : "keyboard-target"
                                }
                            />
                        </label>

                        <label>
                            <span>Email</span>
                            <input
                                type="email"
                                value={badgeRequestForm.email}
                                onFocus={() =>
                                    setBadgeRequestActiveField("email")
                                }
                                onChange={(e) =>
                                    setBadgeRequestFieldValue(
                                        "email",
                                        e.target.value,
                                    )
                                }
                                placeholder="prenom.nom@example.com"
                                inputMode="none"
                                className={
                                    badgeRequestActiveField === "email"
                                        ? "keyboard-target is-active"
                                        : "keyboard-target"
                                }
                            />
                        </label>

                        <label>
                            <span>Badge</span>
                            <input
                                value={badgeRequestForm.uid}
                                onFocus={() =>
                                    setBadgeRequestActiveField("uid")
                                }
                                onChange={(e) =>
                                    setBadgeRequestFieldValue(
                                        "uid",
                                        e.target.value,
                                    )
                                }
                                placeholder="Scanner ou saisir le badge"
                                inputMode="none"
                                readOnly={badgeRequestUidLocked}
                                aria-readonly={badgeRequestUidLocked}
                                className={[
                                    "keyboard-target",
                                    badgeRequestActiveField === "uid"
                                        ? "is-active"
                                        : "",
                                    badgeRequestUidLocked ? "is-locked" : "",
                                ]
                                    .filter(Boolean)
                                    .join(" ")}
                            />
                            {badgeRequestUidLocked && (
                                <p className="badge-request-hint">
                                    Badge scanné automatiquement : ce champ est
                                    verrouillé.
                                </p>
                            )}
                        </label>

                        {badgeRequestError && (
                            <p className="badge-request-error">
                                {badgeRequestError}
                            </p>
                        )}
                        {badgeRequestMessage && (
                            <p className="badge-request-success">
                                {badgeRequestMessage}
                            </p>
                        )}

                        <div
                            className="keyboard-field-tabs"
                            aria-label="Champ actif du clavier"
                        >
                            <button
                                type="button"
                                className={
                                    badgeRequestActiveField === "name"
                                        ? "is-active"
                                        : ""
                                }
                                onClick={() =>
                                    setBadgeRequestActiveField("name")
                                }
                            >
                                Nom
                            </button>
                            <button
                                type="button"
                                className={
                                    badgeRequestActiveField === "email"
                                        ? "is-active"
                                        : ""
                                }
                                onClick={() =>
                                    setBadgeRequestActiveField("email")
                                }
                            >
                                Email
                            </button>
                            <button
                                type="button"
                                className={
                                    badgeRequestActiveField === "uid"
                                        ? "is-active"
                                        : ""
                                }
                                onClick={() =>
                                    setBadgeRequestActiveField("uid")
                                }
                            >
                                Badge
                            </button>
                        </div>

                        {renderBadgeRequestKeyboard()}

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
                                {badgeRequestSubmitting
                                    ? "Envoi..."
                                    : "Envoyer la demande"}
                            </button>
                        </div>
                    </form>
                </div>
            )}
            {blockedModal && (
                <div
                    className="blocked-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                >
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
                <div
                    className="payment-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="payment-modal">
                        <h2>Solde insuffisant</h2>
                        <p>{paymentErrorModal}</p>
                        <div className="payment-modal-actions">
                            <button
                                className="ghost-button"
                                onClick={prepareQrPayment}
                                disabled={qrLoading || !user || totalCents <= 0}
                            >
                                {qrLoading
                                    ? "Génération..."
                                    : "Payer par QR Code"}
                            </button>
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
            {qrModalOpen && (
                <div
                    className="payment-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="payment-modal qr-payment-modal">
                        <h2>Paiement par QR Code</h2>
                        {qrLoading && <p>Génération du QR Code...</p>}
                        {!qrLoading && qrError && <p>{qrError}</p>}
                        {!qrLoading && !qrError && qrPaymentData && (
                            <div className="qr-payment-content">
                                <img
                                    src={qrPaymentData.qr_code_data_url}
                                    alt="QR Code EPC"
                                    className="qr-code-image"
                                />
                                <div className="qr-payment-meta">
                                    <div>
                                        Montant:{" "}
                                        <strong>
                                            {euros(qrPaymentData.amount_cents)}
                                        </strong>
                                    </div>
                                    <div>
                                        Bénéficiaire:{" "}
                                        <strong>
                                            {qrPaymentData.recipient_name}
                                        </strong>
                                    </div>
                                    <div>
                                        IBAN:{" "}
                                        <strong>{qrPaymentData.iban}</strong>
                                    </div>
                                    <div>
                                        BIC:{" "}
                                        <strong>{qrPaymentData.bic}</strong>
                                    </div>
                                    <div>
                                        Communication:{" "}
                                        <strong>
                                            {qrPaymentData.remittance}
                                        </strong>
                                    </div>
                                    <div>
                                        Référence unique:{" "}
                                        <strong>
                                            {qrPaymentData.unique_id}
                                        </strong>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="payment-modal-actions">
                            <button
                                className="ghost-button"
                                onClick={() => {
                                    setQrModalOpen(false);
                                    setQrError("");
                                }}
                                disabled={qrConfirmLoading}
                            >
                                Fermer
                            </button>
                            <button
                                className="payment-modal-button"
                                onClick={confirmQrPayment}
                                disabled={
                                    qrLoading ||
                                    !qrPaymentData ||
                                    qrConfirmLoading
                                }
                            >
                                {qrConfirmLoading
                                    ? "Enregistrement..."
                                    : "J'ai payé par QR Code"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {topupModalOpen && user && (
                <div
                    className="payment-modal-backdrop"
                    role="dialog"
                    aria-modal="true"
                >
                    <div className="payment-modal qr-payment-modal">
                        <h2>💰 Recharger par virement</h2>
                        <p style={{ opacity: 0.8, fontSize: "0.9rem" }}>
                            L'argent n'est ajouté que lorsque le virement est
                            vérifié. Contactez le comité pour un traitement
                            rapide.
                        </p>
                        {!topupQrData && (
                            <>
                                <div
                                    style={{
                                        textAlign: "center",
                                        fontWeight: 900,
                                        fontSize: "2rem",
                                        padding: "12px",
                                        background: "#1a2a34",
                                        borderRadius: 10,
                                        border: "2px solid #3a4a54",
                                    }}
                                >
                                    {topupAmount || "0"} €
                                </div>
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 8,
                                        flexWrap: "wrap",
                                        justifyContent: "center",
                                    }}
                                >
                                    {[5, 10, 20].map((eur) => (
                                        <button
                                            key={eur}
                                            className="ghost-button"
                                            onClick={() =>
                                                setTopupAmount(String(eur))
                                            }
                                            style={{
                                                border:
                                                    topupAmount === String(eur)
                                                        ? "2px solid #5a8"
                                                        : undefined,
                                                padding: "10px 20px",
                                                fontSize: "1.1rem",
                                            }}
                                        >
                                            {eur}€
                                        </button>
                                    ))}
                                </div>
                                <div
                                    className="onscreen-keyboard"
                                    aria-label="Clavier numerique"
                                >
                                    {[
                                        ["1", "2", "3"],
                                        ["4", "5", "6"],
                                        ["7", "8", "9"],
                                        [".", "0", "⌫"],
                                    ].map((row, rowIndex) => (
                                        <div
                                            className="keyboard-row"
                                            key={rowIndex}
                                        >
                                            {row.map((key) => (
                                                <button
                                                    key={key}
                                                    className="keyboard-key"
                                                    onClick={() => {
                                                        if (key === "⌫") {
                                                            setTopupAmount(
                                                                (prev) =>
                                                                    prev.slice(
                                                                        0,
                                                                        -1,
                                                                    ),
                                                            );
                                                        } else if (
                                                            key === "."
                                                        ) {
                                                            setTopupAmount(
                                                                (prev) =>
                                                                    prev.includes(
                                                                        ".",
                                                                    )
                                                                        ? prev
                                                                        : prev +
                                                                              ".",
                                                            );
                                                        } else {
                                                            setTopupAmount(
                                                                (prev) => {
                                                                    const cleaned =
                                                                        prev.replace(
                                                                            ",",
                                                                            ".",
                                                                        );
                                                                    if (
                                                                        cleaned ===
                                                                        "0"
                                                                    )
                                                                        return key;
                                                                    const parts =
                                                                        cleaned.split(
                                                                            ".",
                                                                        );
                                                                    if (
                                                                        parts[1] &&
                                                                        parts[1]
                                                                            .length >=
                                                                            2
                                                                    )
                                                                        return prev;
                                                                    return (
                                                                        cleaned +
                                                                        key
                                                                    );
                                                                },
                                                            );
                                                        }
                                                    }}
                                                >
                                                    {key}
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                                {topupError && (
                                    <p
                                        style={{
                                            color: "#d44",
                                            fontWeight: 700,
                                        }}
                                    >
                                        {topupError}
                                    </p>
                                )}
                                <div
                                    className="payment-modal-actions"
                                    style={{ justifyContent: "flex-end" }}
                                >
                                    <button
                                        className="ghost-button"
                                        onClick={() => setTopupModalOpen(false)}
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        className="payment-modal-button"
                                        onClick={generateTopupQr}
                                        disabled={topupLoading}
                                    >
                                        {topupLoading
                                            ? "Génération..."
                                            : "Générer le QR Code"}
                                    </button>
                                </div>
                            </>
                        )}
                        {topupQrData && (
                            <>
                                <div className="qr-payment-content">
                                    <img
                                        src={topupQrData.qr_code_data_url}
                                        alt="QR Code Top-up"
                                        className="qr-code-image"
                                    />
                                    <div className="qr-payment-meta">
                                        <div>
                                            Montant:{" "}
                                            <strong>
                                                {euros(
                                                    topupQrData.amount_cents,
                                                )}
                                            </strong>
                                        </div>
                                        <div>
                                            Bénéficiaire:{" "}
                                            <strong>
                                                {topupQrData.recipient_name}
                                            </strong>
                                        </div>
                                        <div>
                                            IBAN:{" "}
                                            <strong>{topupQrData.iban}</strong>
                                        </div>
                                        <div>
                                            BIC:{" "}
                                            <strong>{topupQrData.bic}</strong>
                                        </div>
                                        <div>
                                            Communication:{" "}
                                            <strong>
                                                {topupQrData.remittance}
                                            </strong>
                                        </div>
                                        <div>
                                            Référence unique:{" "}
                                            <strong>
                                                {topupQrData.unique_id}
                                            </strong>
                                        </div>
                                    </div>
                                </div>
                                {topupError && (
                                    <p
                                        style={{
                                            color: "#d44",
                                            fontWeight: 700,
                                        }}
                                    >
                                        {topupError}
                                    </p>
                                )}
                                <div className="payment-modal-actions">
                                    <button
                                        className="ghost-button"
                                        onClick={() => {
                                            setTopupModalOpen(false);
                                            setTopupQrData(null);
                                            setTopupError("");
                                        }}
                                    >
                                        Fermer
                                    </button>
                                    <button
                                        className="payment-modal-button"
                                        onClick={() => {
                                            setTopupModalOpen(false);
                                            setTopupQrData(null);
                                            setTopupError("");
                                            setStatus(
                                                "Demande de top-up enregistrée. Vérification en attente par le comité.",
                                            );
                                        }}
                                    >
                                        J'ai effectué le virement
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            <footer className="app-footer">Développé par Delens Raphaël</footer>
        </div>
    );
}
