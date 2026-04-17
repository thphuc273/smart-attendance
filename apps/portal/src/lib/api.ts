import ky from 'ky';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1';

export function getApi() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  return ky.create({
    prefixUrl: API_BASE_URL,
    hooks: {
      beforeRequest: [
        (req) => {
          if (token) req.headers.set('authorization', `Bearer ${token}`);
        },
      ],
      afterResponse: [
        async (_req, _opts, res) => {
          if (res.status === 401 && typeof window !== 'undefined') {
            localStorage.removeItem('access_token');
            localStorage.removeItem('user');
            window.location.href = '/login';
          }
          return res;
        },
      ],
    },
    retry: 0,
    timeout: 20_000,
  });
}

export interface ApiUser {
  id: string;
  email: string;
  full_name?: string;
  roles: string[];
}

export function getStoredUser(): ApiUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ApiUser;
  } catch {
    return null;
  }
}

export function storeAuth(access_token: string, user: ApiUser) {
  localStorage.setItem('access_token', access_token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user');
}

export function isAdmin(user: ApiUser | null): boolean {
  return !!user?.roles.includes('admin');
}

export function isManager(user: ApiUser | null): boolean {
  return !!user?.roles.some((r) => r === 'admin' || r === 'manager');
}
