// Temporary in-memory cache for repeated report/GSC reads.
// This cache is process-local and not durable on Vercel serverless; production should use Redis or Postgres.
const cache = new Map();

function nowMs() {
  return Date.now();
}

export function getCache(key) {
  const entry = cache.get(String(key));
  if (!entry) {
    return null;
  }

  if (entry.expiresAt && entry.expiresAt <= nowMs()) {
    cache.delete(String(key));
    return null;
  }

  return entry.value;
}

export function setCache(key, value, ttlSeconds = 300) {
  const ttl = Number(ttlSeconds);
  const expiresAt = Number.isFinite(ttl) && ttl > 0 ? nowMs() + ttl * 1000 : null;
  cache.set(String(key), { value, expiresAt });
  return value;
}
