const API_BASE = typeof window !== "undefined"
  ? window.location.origin + "/zetta/api"
  : "http://localhost:4500/api";

// Auth helpers
const TOKEN_KEY = "zetta_token";
const REFRESH_KEY = "zetta_refresh";
const USER_KEY = "zetta_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): Record<string, unknown> | null {
  if (typeof window === "undefined") return null;
  const u = localStorage.getItem(USER_KEY);
  return u ? JSON.parse(u) : null;
}

export function saveAuth(data: { accessToken: string; refreshToken: string; user: Record<string, unknown> }) {
  localStorage.setItem(TOKEN_KEY, data.accessToken);
  localStorage.setItem(REFRESH_KEY, data.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(data.user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

async function doRefresh(): Promise<string | null> {
  const refresh = localStorage.getItem(REFRESH_KEY);
  if (!refresh) return null;
  try {
    const res = await fetch(API_BASE + "/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: refresh }),
    });
    if (!res.ok) {
      clearAuth();
      return null;
    }
    const data = await res.json();
    if (data.success && data.data) {
      saveAuth(data.data);
      return data.data.accessToken;
    }
    clearAuth();
    return null;
  } catch {
    clearAuth();
    return null;
  }
}

// Raw API call (returns Response)
export async function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(API_BASE + path, init);
}

// Authenticated API call — returns Response, auto-refreshes token
export async function authApi(path: string, init?: RequestInit): Promise<Response> {
  let token = getToken();
  if (!token) {
    token = await doRefresh();
    if (!token) {
      if (typeof window !== "undefined") window.location.href = "/zetta/login";
      throw new Error("Not authenticated");
    }
  }

  const headers = new Headers(init?.headers);
  headers.set("Authorization", "Bearer " + token);

  const res = await fetch(API_BASE + path, { ...init, headers });

  if (res.status === 401) {
    token = await doRefresh();
    if (!token) {
      if (typeof window !== "undefined") window.location.href = "/zetta/login";
      throw new Error("Not authenticated");
    }
    headers.set("Authorization", "Bearer " + token);
    return fetch(API_BASE + path, { ...init, headers });
  }

  return res;
}
