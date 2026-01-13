import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

type UserRow = {
  id: number;
  name: string;
  email: string | null;
  rfid_uid: string | null;
  is_active: number;
  created_at: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState("");
  const [nameFilter, setNameFilter] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rfid, setRfid] = useState("");
  const [active, setActive] = useState(true);

  const [badgeModalUser, setBadgeModalUser] = useState<UserRow | null>(null);
  const [badgeInput, setBadgeInput] = useState("");
  const badgeInputRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    setError("");
    try {
      const data = await api<{ users: UserRow[] }>("/api/admin/users");
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

  async function addUser() {
    if (!name.trim()) return;
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
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

  async function toggleActive(u: UserRow) {
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

  async function submitBadge() {
    if (!badgeModalUser) return;
    const uid = badgeInput.trim();
    if (!uid) return;
    try {
      await api(`/api/admin/users/${badgeModalUser.id}/badge`, {
        method: "POST",
        body: JSON.stringify({ rfid_uid: uid }),
      });
      setBadgeModalUser(null);
      setBadgeInput("");
      await load();
    } catch (e: any) {
      alert(e.message);
    }
  }

  function openBadgeModal(u: UserRow) {
    setBadgeInput(u.rfid_uid || "");
    setBadgeModalUser(u);
  }

  async function rename(u: UserRow) {
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
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optionnel)" style={{ padding: 8, minWidth: 220 }} />
          <input value={rfid} onChange={(e) => setRfid(e.target.value)} placeholder="UID badge" style={{ padding: 8, minWidth: 200 }} />
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
            Rechercher : {""}
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
                gridTemplateColumns: "2fr 2fr 2fr auto",
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
              </div>

              <div style={{ opacity: 0.85 }}>{u.email || "--"}</div>

              <div style={{ opacity: 0.85 }}>
                Badge: <b>{u.rfid_uid || "--"}</b>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={() => rename(u)}>Renommer</button>
                <button onClick={() => openBadgeModal(u)}>{u.rfid_uid ? "Changer badge" : "Lier badge"}</button>
                <button onClick={() => toggleActive(u)}>{u.is_active === 1 ? "Desactiver" : "Activer"}</button>
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
              width: "min(420px, 92vw)",
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
              <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>Scanner un badge</div>
              <div style={{ opacity: 0.7 }}>
                Scannez le badge RFID ou entrez le code manuellement.
              </div>
            </div>

            <input
              ref={badgeInputRef}
              value={badgeInput}
              onChange={(e) => setBadgeInput(e.target.value)}
              placeholder="UID badge"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitBadge();
              }}
            />

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setBadgeModalUser(null)}>Annuler</button>
              <button onClick={submitBadge} disabled={!badgeInput.trim()} style={{ fontWeight: 700 }}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
