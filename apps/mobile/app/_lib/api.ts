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
}
