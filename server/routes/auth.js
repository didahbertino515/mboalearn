const express = require('express');
const crypto = require('crypto');
const { get, run, all, tx } = require('../db');
const { signToken, hashPassword, checkPassword, requireAuth, publicUser } = require('../auth');
const { normalizePhone, detectOperator } = require('../payments/service');
const { saveDataUrl } = require('../uploads');
const { parseJSON, wrap, str } = require('../util');
const { limit, byEmail } = require('../ratelimit');
const { sendMail } = require('../mailer');
const config = require('../config');

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

r.post('/register', limit('register', 5, 60 * 60 * 1000), wrap(async (req, res) => {
  const name = str(req.body.name, 80);
  const email = str(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  const role = ['student', 'tutor', 'parent'].includes(req.body.role) ? req.body.role : 'student';
  if (name.length < 2) return res.status(400).json({ error: 'Nom trop court' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Adresse e-mail invalide' });
  if (password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
  if (req.body.accept_terms !== true && req.body.accept_terms !== 'on') {
    return res.status(400).json({ error: "Vous devez accepter les conditions d'utilisation et la politique de confidentialité" });
  }
  if (get('SELECT id FROM users WHERE email = ?', email)) return res.status(409).json({ error: 'Un compte existe déjà avec cet e-mail' });
  const phone = req.body.phone ? normalizePhone(req.body.phone) : null;
  const referrer = req.body.referral ? get('SELECT id FROM users WHERE referral_code = ?', str(req.body.referral, 20).toUpperCase()) : null;

  const id = tx(() => {
    const result = run(
      `INSERT INTO users (role, name, email, password_hash, phone, city, ui_lang, referral_code, referred_by, terms_accepted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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

// 10 essais par quart d'heure pour un même e-mail depuis une même IP, 50 par IP
r.post('/login', limit('login-ip', 50, 15 * 60 * 1000), limit('login', 10, 15 * 60 * 1000, byEmail), (req, res) => {
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

// ---------------------------------------------------------------- Mes données (droit d'accès et d'effacement)
r.get('/export', requireAuth(), limit('export', 5, 60 * 60 * 1000), (req, res) => {
  const id = req.user.id;
  const data = {
    exported_at: new Date().toISOString(),
    account: publicUser(get('SELECT * FROM users WHERE id = ?', id)),
    tutor_profile: get('SELECT * FROM tutor_profiles WHERE user_id = ?', id) || null,
    availability: all('SELECT weekday, start_min, end_min FROM availability WHERE tutor_id = ?', id),
    bookings: all('SELECT * FROM bookings WHERE student_id = ? OR tutor_id = ?', id, id),
    packages: all('SELECT * FROM packages WHERE student_id = ? OR tutor_id = ?', id, id),
    group_enrollments: all('SELECT * FROM group_enrollments WHERE student_id = ?', id),
    transactions: all('SELECT * FROM transactions WHERE user_id = ?', id),
    reviews_written: all('SELECT * FROM reviews WHERE student_id = ?', id),
    messages_sent: all('SELECT conversation_id, body, attachment, created_at FROM messages WHERE sender_id = ?', id),
    homework: all('SELECT * FROM homework WHERE student_id = ? OR tutor_id = ?', id, id),
    vocabulary: all('SELECT word, translation, example, box, created_at FROM vocab WHERE student_id = ?', id),
    notifications: all('SELECT title, body, created_at FROM notifications WHERE user_id = ?', id),
  };
  res.set('Content-Disposition', `attachment; filename="mboalearn-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json(data);
});

// Suppression : le compte est anonymisé. Les cours et transactions sont conservés (obligations
// comptables) mais ne sont plus rattachés à une identité.
r.delete('/me', requireAuth(), limit('delete', 5, 60 * 60 * 1000), (req, res) => {
  const u = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (u.role === 'admin') return res.status(400).json({ error: 'Un compte administrateur ne peut pas être supprimé ici' });
  if (!checkPassword(String(req.body.password || ''), u.password_hash)) return res.status(401).json({ error: 'Mot de passe incorrect' });
  if (u.wallet_balance > 0) return res.status(400).json({ error: `Votre solde n'est pas vide (${u.wallet_balance} FCFA). Retirez-le ou contactez le support avant de supprimer votre compte.` });
  const upcoming = get("SELECT COUNT(*) n FROM bookings WHERE (student_id = ? OR tutor_id = ?) AND status IN ('confirmed','disputed')", u.id, u.id).n;
  if (upcoming || u.held_balance > 0) return res.status(400).json({ error: 'Vous avez des cours à venir ou en cours de règlement. Annulez-les ou attendez leur clôture.' });
  tx(() => {
    run(`UPDATE users SET name = 'Utilisateur supprimé', email = ?, phone = NULL, avatar = NULL, city = NULL, password_hash = ?,
      is_blocked = 1, deleted_at = datetime('now') WHERE id = ?`, `supprime-${u.id}@mboalearn.invalid`, hashPassword(crypto.randomBytes(24).toString('hex')), u.id);
    run("UPDATE tutor_profiles SET status = 'rejected', headline = NULL, bio = NULL, video_url = NULL, payout_phone = NULL, education = NULL, certificates = NULL WHERE user_id = ?", u.id);
    for (const t of ['vocab WHERE student_id', 'favorites WHERE student_id', 'parent_links WHERE parent_id', 'parent_links WHERE child_id',
      'notifications WHERE user_id', 'password_resets WHERE user_id', 'tutor_documents WHERE tutor_id', 'availability WHERE tutor_id']) {
      run(`DELETE FROM ${t} = ?`, u.id);
    }
  });
  res.json({ ok: true });
});

r.get('/notifications', requireAuth(), (req, res) => {
  res.json(all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', req.user.id));
});

r.post('/notifications/read', requireAuth(), (req, res) => {
  run("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND read_at IS NULL", req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- Mot de passe oublié
const RESET_TTL_MS = 60 * 60 * 1000;
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

function createResetLink(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  run('DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?', userId, new Date().toISOString());
  run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', sha256(token), userId, new Date(Date.now() + RESET_TTL_MS).toISOString());
  return `${config.appUrl}/#/reset?token=${token}`;
}

// Réponse identique que le compte existe ou non (pas de divulgation des e-mails inscrits)
r.post('/forgot', limit('forgot', 5, 60 * 60 * 1000), wrap(async (req, res) => {
  const user = get('SELECT * FROM users WHERE email = ? AND is_blocked = 0', str(req.body.email, 120).toLowerCase());
  if (user) {
    const url = createResetLink(user.id);
    sendMail({
      to: user.email, name: user.name, subject: 'Réinitialisation de votre mot de passe MboaLearn',
      title: 'Mot de passe oublié ?',
      body: `<p>Bonjour ${user.name.replace(/[<>&]/g, '')},</p><p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable 1 heure.</p><p style="color:#64748b;font-size:13px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.</p>`,
      cta: { url, label: 'Choisir un nouveau mot de passe' },
    });
  }
  res.json({ ok: true });
}));

r.post('/reset', limit('reset', 10, 60 * 60 * 1000), (req, res) => {
  const row = get('SELECT * FROM password_resets WHERE token_hash = ?', sha256(String(req.body.token || '')));
  if (!row || row.used_at || row.expires_at < new Date().toISOString()) {
    return res.status(400).json({ error: 'Lien invalide ou expiré. Refaites une demande.' });
  }
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), row.user_id);
  run("UPDATE password_resets SET used_at = datetime('now') WHERE token_hash = ?", row.token_hash);
  res.json(session({ id: row.user_id }));
});

module.exports = { router: r, me, createResetLink };
