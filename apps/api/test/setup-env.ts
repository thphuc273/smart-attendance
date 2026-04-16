// Injected before any module loads. Guarantees env.validation passes in e2e.
process.env.NODE_ENV = 'test';
process.env.API_PORT = '0';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'e2e-access-secret';
process.env.JWT_ACCESS_TTL = '15m';
process.env.JWT_REFRESH_SECRET = 'e2e-refresh-secret';
process.env.JWT_REFRESH_TTL = '7d';
process.env.ALLOWED_ORIGINS = 'http://localhost:3100';
