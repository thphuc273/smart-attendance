import ky from 'ky';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

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
