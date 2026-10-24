const crypto = require('crypto');
const config = require('./config');
const { get } = require('./db');

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function signToken(payload, ttlSec = 60 * 60 * 24 * 30) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  const sig = crypto.createHmac('sha256', config.jwtSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const [header, body, sig] = token.split('.');
  if (!header || !body || !sig) return null;
  const expected = crypto.createHmac('sha256', config.jwtSecret).update(`${header}.${body}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

function userFromToken(token) {
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = get('SELECT * FROM users WHERE id = ?', payload.uid);
  if (!user || user.is_blocked) return null;
  return user;
}

// Middleware Express : ajoute req.user si un jeton valide est présent
function authOptional(req, _res, next) {
  const h = req.headers.authorization || '';
  req.user = h.startsWith('Bearer ') ? userFromToken(h.slice(7)) : null;
  next();
}

function requireAuth(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Connexion requise' });
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'Accès refusé' });
    next();
  };
}

function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

module.exports = { signToken, verifyToken, hashPassword, checkPassword, userFromToken, authOptional, requireAuth, publicUser };
