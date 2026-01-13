export function getAdminToken(): string {
  return localStorage.getItem("admin_token") || "";
}

export function setAdminToken(token: string) {
  localStorage.setItem("admin_token", token);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();

  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      "x-admin-token": token,
    },
  });

  if (!res.ok) {
    let msg = `Erreur (${res.status})`;
    try {
      const body = await res.json();
      msg = body?.error || body?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  return res.json();
}
