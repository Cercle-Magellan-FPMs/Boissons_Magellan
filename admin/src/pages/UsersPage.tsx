import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { AdminUser } from "../lib/types";
import { eurosFromCents } from "../lib/types";

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");
  const [nameFilter, setNameFilter] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rfid, setRfid] = useState("");
  const [active, setActive] = useState(true);

  const [badgeModalUser, setBadgeModalUser] = useState<AdminUser | null>(null);
  const [badgeInput, setBadgeInput] = useState("");
  const badgeInputRef = useRef<HTMLInputElement | null>(null);
  const [topUpModalUser, setTopUpModalUser] = useState<AdminUser | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("10");
  const [topUpComment, setTopUpComment] = useState("");
  const [topUpPaymentDate, setTopUpPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [topUpPaymentMethod, setTopUpPaymentMethod] = useState<"bank_transfer" | "cash">("bank_transfer");

  async function load() {
    setError("");
    try {
      const data = await api<{ users: AdminUser[] }>("/api/admin/users");
      setUsers(data.users);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!badgeModalUser) return;
    const t = window.setTimeout(() => badgeInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [badgeModalUser]);

  useEffect(() => {
    if (!badgeModalUser) return;
    const freshUser = users.find((user) => user.id === badgeModalUser.id) || null;
    setBadgeModalUser(freshUser);
  }, [users, badgeModalUser]);

  useEffect(() => {
    if (!topUpModalUser) return;
    const freshUser = users.find((user) => user.id === topUpModalUser.id) || null;
    setTopUpModalUser(freshUser);
  }, [users, topUpModalUser]);

  async function addUser() {
    if (!name.trim()) return;
    if (!email.trim()) {
      alert("L'email est obligatoire.");
      return;
    }
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          rfid_uid: rfid.trim() || undefined,
          is_active: active,
        }),
      });
      setName("");
      setEmail("");
      setRfid("");
      setActive(true);
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function toggleActive(u: AdminUser) {
    try {
      await api(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: u.is_active !== 1 }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function addBadge() {
    if (!badgeModalUser) return;
    const uid = badgeInput.trim();
    if (!uid) return;
    try {
      await api(`/api/admin/users/${badgeModalUser.id}/badge`, {
        method: "POST",
        body: JSON.stringify({ rfid_uid: uid }),
      });
      setBadgeInput("");
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function removeBadge(user: AdminUser, uid: string) {
    if (!confirm(`Supprimer le badge "${uid}" de ${user.name} ?`)) return;
    try {
      await api(`/api/admin/users/${user.id}/badge`, {
        method: "DELETE",
        body: JSON.stringify({ rfid_uid: uid }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function openBadgeModal(u: AdminUser) {
    setBadgeInput("");
    setBadgeModalUser(u);
  }

  async function rename(u: AdminUser) {
    const n = prompt("Nouveau nom", u.name);
    if (!n) return;
    try {
      await api(`/api/admin/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: n }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function openTopUpModal(user: AdminUser) {
    setTopUpModalUser(user);
    setTopUpAmount("10");
    setTopUpComment("");
    setTopUpPaymentDate(new Date().toISOString().slice(0, 10));
    setTopUpPaymentMethod("bank_transfer");
  }

  async function submitTopUp() {
    if (!topUpModalUser) return;

    const value = Math.round(Number(topUpAmount.replace(",", ".")) * 100);
    if (!Number.isFinite(value) || value === 0) {
      alert("Montant invalide");
      return;
    }
    if (!topUpComment.trim()) {
      alert("Le commentaire est obligatoire.");
      return;
    }
    if (value > 0 && !/^\d{4}-\d{2}-\d{2}$/.test(topUpPaymentDate)) {
      alert("Date de paiement invalide.");
      return;
    }

    try {
      await api(`/api/admin/users/${topUpModalUser.id}/topup`, {
        method: "POST",
        body: JSON.stringify({
          amount_cents: value,
          comment: topUpComment.trim(),
          payment_date: topUpPaymentDate,
          payment_method: topUpPaymentMethod,
        }),
      });
      setTopUpModalUser(null);
      setTopUpAmount("10");
      setTopUpComment("");
      setTopUpPaymentDate(new Date().toISOString().slice(0, 10));
      setTopUpPaymentMethod("bank_transfer");
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function removeUser(user: AdminUser) {
    if (!confirm(`Supprimer ${user.name} de la liste des utilisateurs ?`)) return;
    try {
      await api(`/api/admin/users/${user.id}/delete`, {
        method: "POST",
      });
      if (badgeModalUser?.id === user.id) {
        setBadgeModalUser(null);
        setBadgeInput("");
      }
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(nameFilter.trim().toLowerCase())
  );

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Utilisateurs</h2>

      <div style={{ padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Ajouter un utilisateur</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" style={{ padding: 8, minWidth: 180 }} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (obligatoire)" style={{ padding: 8, minWidth: 220 }} />
          <input value={rfid} onChange={(e) => setRfid(e.target.value)} placeholder="UID badge initial" style={{ padding: 8, minWidth: 200 }} />
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Actif
          </label>
          <button onClick={addUser} style={{ fontWeight: 900 }}>Ajouter</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, border: "1px solid #a33", borderRadius: 10 }}>
          Erreur: {error}
        </div>
      )}

      <div style={{ padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Liste</h3>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <label>
            Rechercher :{" "}
            <input
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              placeholder="Raphaël aka best admin"
            />
          </label>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {filteredUsers.map((u) => (
            <div
              key={u.id}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1.3fr 2fr auto",
                gap: 8,
                alignItems: "center",
                padding: 10,
                border: "1px solid #444",
                borderRadius: 10,
                opacity: u.is_active === 1 ? 1 : 0.55,
              }}
            >
              <div>
                <div style={{ fontWeight: 900 }}>{u.name}</div>
                <div style={{ opacity: 0.7 }}>ID: {u.id}</div>
                <div style={{ opacity: 0.85 }}>{u.email || "--"}</div>
              </div>

              <div>
                <div style={{ fontWeight: 900 }}>{eurosFromCents(u.balance_cents)}</div>
                <div style={{ opacity: 0.7 }}>Solde disponible</div>
              </div>

              <div style={{ opacity: 0.85 }}>
                Badges:{" "}
                <b>{u.badge_uids.length > 0 ? u.badge_uids.join(", ") : "--"}</b>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={() => rename(u)}>Renommer</button>
                <button onClick={() => openBadgeModal(u)}>
                  {u.badge_uids.length > 0 ? "Gerer badges" : "Lier badge"}
                </button>
                <button onClick={() => openTopUpModal(u)}>Recharger</button>
                <button onClick={() => toggleActive(u)}>{u.is_active === 1 ? "Desactiver" : "Activer"}</button>
                <button onClick={() => removeUser(u)}>Supprimer</button>
              </div>
            </div>
          ))}
          {filteredUsers.length === 0 && <p style={{ opacity: 0.7 }}>Aucun utilisateur.</p>}
        </div>
      </div>

      {badgeModalUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(7, 10, 12, 0.7)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 1000,
          }}
          onClick={() => setBadgeModalUser(null)}
        >
          <div
            style={{
              width: "min(560px, 92vw)",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 20,
              boxShadow: "var(--shadow)",
              display: "grid",
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>Badges utilisateur</div>
              <div style={{ opacity: 0.7 }}>
                {badgeModalUser.name}
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {badgeModalUser.badge_uids.length === 0 ? (
                <div style={{ opacity: 0.7 }}>Aucun badge lie.</div>
              ) : (
                badgeModalUser.badge_uids.map((uid) => (
                  <div
                    key={uid}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      alignItems: "center",
                      border: "1px solid var(--border)",
                      borderRadius: 10,
                      padding: "10px 12px",
                    }}
                  >
                    <strong>{uid}</strong>
                    <button onClick={() => removeBadge(badgeModalUser, uid)}>Supprimer</button>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <input
                ref={badgeInputRef}
                value={badgeInput}
                onChange={(e) => setBadgeInput(e.target.value)}
                placeholder="Scanner ou saisir un nouveau badge"
                onKeyDown={(e) => {
                  if (e.key === "Enter") addBadge();
                }}
                style={{ flex: 1 }}
              />
              <button onClick={addBadge} disabled={!badgeInput.trim()} style={{ fontWeight: 700 }}>
                Ajouter
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setBadgeModalUser(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {topUpModalUser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(7, 10, 12, 0.7)",
            display: "grid",
            placeItems: "center",
            padding: 16,
            zIndex: 1000,
          }}
          onClick={() => setTopUpModalUser(null)}
        >
          <div
            style={{
              width: "min(520px, 92vw)",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 20,
              boxShadow: "var(--shadow)",
              display: "grid",
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>Recharger un utilisateur</div>
              <div style={{ opacity: 0.7 }}>{topUpModalUser.name}</div>
              <div style={{ opacity: 0.7 }}>
                Solde actuel: {eurosFromCents(topUpModalUser.balance_cents)}
              </div>
            </div>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Montant en EUR</span>
              <input
                value={topUpAmount}
                onChange={(e) => setTopUpAmount(e.target.value)}
                placeholder="10"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitTopUp();
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Commentaire</span>
              <input
                value={topUpComment}
                onChange={(e) => setTopUpComment(e.target.value)}
                placeholder="Obligatoire (reference, motif...)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitTopUp();
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Date du virement/paiement liquide</span>
              <input
                type="date"
                value={topUpPaymentDate}
                onChange={(e) => setTopUpPaymentDate(e.target.value)}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <span>Méthode</span>
              <select
                value={topUpPaymentMethod}
                onChange={(e) => setTopUpPaymentMethod(e.target.value as "bank_transfer" | "cash")}
              >
                <option value="bank_transfer">Virement</option>
                <option value="cash">Paiement liquide</option>
              </select>
            </label>

            <div style={{ opacity: 0.75, fontSize: "0.95rem" }}>
              Utilisez une valeur negative uniquement pour une correction manuelle.
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setTopUpModalUser(null)}>Annuler</button>
              <button onClick={submitTopUp} style={{ fontWeight: 700 }}>
                Valider
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
