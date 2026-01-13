import { useEffect, useState } from "react";
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

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [rfid, setRfid] = useState("");
  const [active, setActive] = useState(true);

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
      setName(""); setEmail(""); setRfid(""); setActive(true);
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

  async function linkBadge(u: UserRow) {
    const uid = prompt("Nouveau badge (UID)", u.rfid_uid || "");
    if (!uid) return;
    try {
      await api(`/api/admin/users/${u.id}/badge`, {
        method: "POST",
        body: JSON.stringify({ rfid_uid: uid }),
      });
      await load();
    } catch (e: any) {
      alert(e.message);
    }
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

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Utilisateurs</h2>

      <div style={{ padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Ajouter un utilisateur</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom" style={{ padding: 8, minWidth: 180 }} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optionnel)" style={{ padding: 8, minWidth: 220 }} />
          <input value={rfid} onChange={(e) => setRfid(e.target.value)} placeholder="UID badge (optionnel)" style={{ padding: 8, minWidth: 200 }} />
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Actif
          </label>
          <button onClick={addUser} style={{ fontWeight: 900 }}>Ajouter</button>
          <button onClick={load}>Rafraîchir</button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 10, border: "1px solid #a33", borderRadius: 10 }}>
          Erreur: {error}
        </div>
      )}

      <div style={{ padding: 12, border: "1px solid #333", borderRadius: 12 }}>
        <h3 style={{ marginTop: 0 }}>Liste</h3>

        <div style={{ display: "grid", gap: 8 }}>
          {users.map((u) => (
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

              <div style={{ opacity: 0.85 }}>{u.email || "—"}</div>

              <div style={{ opacity: 0.85 }}>
                Badge: <b>{u.rfid_uid || "—"}</b>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                <button onClick={() => rename(u)}>Renommer</button>
                <button onClick={() => linkBadge(u)}>{u.rfid_uid ? "Changer badge" : "Lier badge"}</button>
                <button onClick={() => toggleActive(u)}>{u.is_active === 1 ? "Désactiver" : "Activer"}</button>
              </div>
            </div>
          ))}
          {users.length === 0 && <p style={{ opacity: 0.7 }}>Aucun utilisateur.</p>}
        </div>
      </div>
    </section>
  );
}
