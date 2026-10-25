const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const persist = require('./persist');

const EXT = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif',
  'application/pdf': 'pdf', 'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'video/webm': 'webm', 'video/mp4': 'mp4',
  'text/plain': 'txt', 'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

const PRIVATE_PREFIX = 'priv-';
const MIME_OF = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));

// Enregistre un fichier envoyé en data URL (base64) et renvoie son URL publique.
// Avec { private: true } (pièces d'identité…), le fichier n'est jamais servi par /uploads :
// on renvoie seulement son nom, lu ensuite par une route authentifiée (voir readUpload).
function saveDataUrl(dataUrl, allowed = Object.keys(EXT), maxMb = 10, { private: isPrivate = false } = {}) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) throw Object.assign(new Error('Fichier invalide'), { status: 400 });
  const mime = m[1];
  if (!allowed.includes(mime) || !EXT[mime]) throw Object.assign(new Error('Type de fichier non autorisé'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > maxMb * 1024 * 1024) throw Object.assign(new Error(`Fichier trop volumineux (max ${maxMb} Mo)`), { status: 413 });
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const name = `${isPrivate ? PRIVATE_PREFIX : ''}${Date.now()}-${crypto.randomBytes(isPrivate ? 16 : 6).toString('hex')}.${EXT[mime]}`;
  fs.writeFileSync(path.join(config.uploadDir, name), buf);
  // Copie dans PostgreSQL pour survivre aux redémarrages de l'hébergeur
  persist.saveFile(name, mime, buf).catch((e) => console.error('[uploads] copie PostgreSQL impossible :', e.message));
  return isPrivate ? name : `/uploads/${name}`;
}

// Lit un fichier (disque local, sinon PostgreSQL) : { mime, data } ou null
async function readUpload(name) {
  name = path.basename(String(name));
  const file = path.join(config.uploadDir, name);
  if (fs.existsSync(file)) return { mime: MIME_OF[path.extname(name).slice(1)] || 'application/octet-stream', data: fs.readFileSync(file) };
  const row = await persist.loadFile(name);
  if (!row) return null;
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.writeFileSync(file, row.data);
  return row;
}

// Sert un fichier : disque local d'abord, sinon récupération depuis PostgreSQL puis mise en cache
async function serveUpload(req, res, next) {
  const name = path.basename(req.params.name);
  if (name.startsWith(PRIVATE_PREFIX)) return res.status(404).end();
  const file = path.join(config.uploadDir, name);
  if (fs.existsSync(file)) return res.sendFile(file, { maxAge: '7d' });
  try {
    const row = await persist.loadFile(name);
    if (!row) return res.status(404).end();
    fs.mkdirSync(config.uploadDir, { recursive: true });
    fs.writeFileSync(file, row.data);
    res.type(row.mime).set('Cache-Control', 'public, max-age=604800').send(row.data);
  } catch (e) { next(e); }
}

module.exports = { saveDataUrl, serveUpload, readUpload, EXT };
