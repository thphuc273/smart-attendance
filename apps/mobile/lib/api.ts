import ky from 'ky';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

let refreshInFlight: Promise<string | null> | null = null;

async function doRefresh(): Promise<string | null> {
  const refreshToken = await SecureStore.getItemAsync('refresh_token');
  if (!refreshToken) return null;
  try {
    const res = await ky.post(`${API_BASE_URL}/auth/refresh`, {
      json: { refresh_token: refreshToken },
      retry: 0,
      timeout: 10_000,
    }).json<{ data: { access_token: string; refresh_token: string } }>();
    await SecureStore.setItemAsync('access_token', res.data.access_token);
    await SecureStore.setItemAsync('refresh_token', res.data.refresh_token);
    return res.data.access_token;
  } catch {
    await SecureStore.deleteItemAsync('access_token');
    await SecureStore.deleteItemAsync('refresh_token');
    return null;
  }
}

function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export function getApi() {
  return ky.create({
    prefixUrl: API_BASE_URL,
    hooks: {
      beforeRequest: [
        async (req) => {
          const token = await SecureStore.getItemAsync('access_token');
          if (token) req.headers.set('authorization', `Bearer ${token}`);
        },
      ],
      afterResponse: [
        async (req, _options, res) => {
          // Don't try to refresh the refresh call itself.
          if (res.status !== 401 || req.url.includes('/auth/refresh') || req.url.includes('/auth/login')) {
            return res;
          }
          const newToken = await refreshAccessToken();
          if (!newToken) return res;
          const retried = new Request(req, {
            headers: new Headers(req.headers),
          });
          retried.headers.set('authorization', `Bearer ${newToken}`);
          return ky(retried, { retry: 0 });
        },
      ],
    },
    retry: 0,
    timeout: 20_000,
  });
}

export async function hasToken(): Promise<boolean> {
  const t = await SecureStore.getItemAsync('access_token');
  return !!t;
}

export async function clearAuth() {
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('refresh_token');
  await SecureStore.deleteItemAsync('user');
}

export interface StoredUser {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
}

export async function storeUser(user: StoredUser) {
  await SecureStore.setItemAsync('user', JSON.stringify(user));
}

export async function getStoredUser(): Promise<StoredUser | null> {
  const raw = await SecureStore.getItemAsync('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function isAdmin(u: StoredUser | null): boolean {
  return !!u?.roles.includes('admin');
}
export function isManager(u: StoredUser | null): boolean {
  return !!u?.roles.some((r) => r === 'admin' || r === 'manager');
}

/** Home route for a given user, matches portal `homeFor()`. */
export function homeFor(u: StoredUser): string {
  if (isAdmin(u)) return '/admin';
  if (isManager(u)) return '/manager';
  return '/checkin';
}
