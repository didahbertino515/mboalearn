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

// Enregistre un fichier envoyé en data URL (base64) et renvoie son URL publique
function saveDataUrl(dataUrl, allowed = Object.keys(EXT), maxMb = 10) {
  const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(String(dataUrl || ''));
  if (!m) throw Object.assign(new Error('Fichier invalide'), { status: 400 });
  const mime = m[1];
  if (!allowed.includes(mime) || !EXT[mime]) throw Object.assign(new Error('Type de fichier non autorisé'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > maxMb * 1024 * 1024) throw Object.assign(new Error(`Fichier trop volumineux (max ${maxMb} Mo)`), { status: 413 });
  fs.mkdirSync(config.uploadDir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${EXT[mime]}`;
  fs.writeFileSync(path.join(config.uploadDir, name), buf);
  // Copie dans PostgreSQL pour survivre aux redémarrages de l'hébergeur
  persist.saveFile(name, mime, buf).catch((e) => console.error('[uploads] copie PostgreSQL impossible :', e.message));
  return `/uploads/${name}`;
}

// Sert un fichier : disque local d'abord, sinon récupération depuis PostgreSQL puis mise en cache
async function serveUpload(req, res, next) {
  const name = path.basename(req.params.name);
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

module.exports = { saveDataUrl, serveUpload, EXT };
