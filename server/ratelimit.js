// Limiteur de requêtes en mémoire (fenêtre glissante simple), suffisant pour une instance unique
const buckets = new Map();

function hit(key, max, windowMs) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset <= now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count += 1;
  return { ok: b.count <= max, retryAfter: Math.ceil((b.reset - now) / 1000) };
}

// keyFn(req) -> identifiant (IP, utilisateur, e-mail…)
function limit(name, max, windowMs, keyFn = (req) => req.ip) {
  return (req, res, next) => {
    const r = hit(`${name}:${keyFn(req)}`, max, windowMs);
    if (r.ok) return next();
    res.set('Retry-After', String(r.retryAfter));
    const minutes = Math.ceil(r.retryAfter / 60);
    res.status(429).json({ error: `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.` });
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
}, 5 * 60 * 1000).unref();

const byUser = (req) => req.user?.id || req.ip;
const byEmail = (req) => `${req.ip}|${String(req.body?.email || '').toLowerCase()}`;

module.exports = { limit, byUser, byEmail };
