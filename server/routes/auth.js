const express = require('express');
const crypto = require('crypto');
const { get, run, all, tx } = require('../db');
const { signToken, hashPassword, checkPassword, requireAuth, publicUser } = require('../auth');
const { normalizePhone, detectOperator } = require('../payments/service');
const { saveDataUrl } = require('../uploads');
const { parseJSON, wrap, str } = require('../util');

const r = express.Router();

function session(user) {
  return { token: signToken({ uid: user.id }), user: me(user.id) };
}

function me(id) {
  const u = publicUser(get('SELECT * FROM users WHERE id = ?', id));
  if (u.role === 'tutor') {
    const p = get('SELECT * FROM tutor_profiles WHERE user_id = ?', id);
    if (p) u.profile = { ...p, subjects: parseJSON(p.subjects, []), languages: parseJSON(p.languages, []), levels: parseJSON(p.levels, []), specialties: parseJSON(p.specialties, []) };
  }
  if (u.role === 'parent') {
    u.children = all('SELECT u.id, u.name, u.email, u.avatar FROM parent_links pl JOIN users u ON u.id = pl.child_id WHERE pl.parent_id = ?', id);
  }
  u.unread_notifications = get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read_at IS NULL', id).c;
  u.unread_messages = get(
    `SELECT COUNT(*) c FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE (c.a_id = ? OR c.b_id = ?) AND m.sender_id != ? AND m.read_at IS NULL`, id, id, id).c;
  return u;
}

r.post('/register', wrap(async (req, res) => {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  const role = ['student', 'tutor', 'parent'].includes(req.body.role) ? req.body.role : 'student';
  if (name.length < 2) return res.status(400).json({ error: 'Nom trop court' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Adresse e-mail invalide' });
  if (password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
  if (get('SELECT id FROM users WHERE email = ?', email)) return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail' });
  const phone = req.body.phone ? normalizePhone(req.body.phone) : null;
  const referrer = req.body.referral ? get('SELECT id FROM users WHERE referral_code = ?', str(req.body.referral, 20).toUpperCase()) : null;

  const id = tx(() => {
    const result = run(
      `INSERT INTO users (role, name, email, password_hash, phone, city, ui_lang, referral_code, referred_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      role, name, email, hashPassword(password), phone, str(req.body.city, 60) || null,
      req.body.ui_lang === 'en' ? 'en' : 'fr', crypto.randomBytes(4).toString('hex').toUpperCase(), referrer?.id || null,
    );
    const uid = Number(result.lastInsertRowid);
    if (role === 'tutor') {
      run('INSERT INTO tutor_profiles (user_id, payout_phone, payout_operator) VALUES (?, ?, ?)', uid, phone, phone ? detectOperator(phone) : null);
    }
    return uid;
  });
  res.json(session({ id }));
}));

r.post('/login', (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  const user = get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !checkPassword(String(req.body.password || ''), user.password_hash)) {
    return res.status(401).json({ error: 'E-mail ou mot de passe incorrect' });
  }
  if (user.is_blocked) return res.status(403).json({ error: 'Compte suspendu. Contactez le support.' });
  res.json(session(user));
});

r.get('/me', requireAuth(), (req, res) => {
  // Série de jours d'activité (gamification)
  const today = new Date().toISOString().slice(0, 10);
  const u = req.user;
  if (u.last_active_day !== today) {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const streak = u.last_active_day === yesterday ? u.streak_days + 1 : 1;
    run('UPDATE users SET last_active_day = ?, streak_days = ? WHERE id = ?', today, streak, u.id);
  }
  res.json(me(u.id));
});

r.put('/me', requireAuth(), wrap(async (req, res) => {
  const b = req.body;
  const u = req.user;
  const phone = b.phone !== undefined ? (b.phone ? normalizePhone(b.phone) : null) : u.phone;
  if (b.phone && !phone) return res.status(400).json({ error: 'Numéro de téléphone camerounais invalide (ex : 6XX XX XX XX)' });
  let avatar = u.avatar;
  if (b.avatar_data) avatar = saveDataUrl(b.avatar_data, ['image/png', 'image/jpeg', 'image/webp'], 3);
  run('UPDATE users SET name = ?, phone = ?, city = ?, country = ?, ui_lang = ?, avatar = ? WHERE id = ?',
    str(b.name ?? u.name, 80) || u.name, phone, str(b.city ?? u.city, 60), str(b.country ?? u.country, 60),
    b.ui_lang === 'en' ? 'en' : 'fr', avatar, u.id);
  if (b.password) {
    if (String(b.password).length < 8) return res.status(400).json({ error: 'Mot de passe trop court' });
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(String(b.password)), u.id);
  }
  res.json(me(u.id));
}));

// Espace parents : rattacher un enfant via son e-mail
r.post('/children', requireAuth('parent'), (req, res) => {
  const child = get("SELECT id FROM users WHERE email = ? AND role = 'student'", str(req.body.email, 120).toLowerCase());
  if (!child) return res.status(404).json({ error: "Aucun compte élève avec cet e-mail" });
  run('INSERT OR IGNORE INTO parent_links (parent_id, child_id) VALUES (?, ?)', req.user.id, child.id);
  res.json(me(req.user.id));
});

r.get('/notifications', requireAuth(), (req, res) => {
  res.json(all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', req.user.id));
});

r.post('/notifications/read', requireAuth(), (req, res) => {
  run("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL", req.user.id);
  res.json({ ok: true });
});

module.exports = { router: r, me };
