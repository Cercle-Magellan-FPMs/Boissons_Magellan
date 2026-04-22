export function getAdminToken(): string {
  return localStorage.getItem("admin_token") || "";
}

export function setAdminToken(token: string) {
  localStorage.setItem("admin_token", token);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAdminToken();
  const hasBody = init?.body != null;
  const headers = new Headers(init?.headers);
  headers.set("x-admin-token", token);

  if (hasBody && !(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, {
    ...init,
    headers,
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
