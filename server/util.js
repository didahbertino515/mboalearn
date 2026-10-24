const crypto = require('crypto');

const parseJSON = (s, fallback) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };
const roomId = () => crypto.randomBytes(9).toString('base64url');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const str = (v, max = 5000) => (v === undefined || v === null ? '' : String(v).slice(0, max).trim());

module.exports = { parseJSON, roomId, wrap, str };
