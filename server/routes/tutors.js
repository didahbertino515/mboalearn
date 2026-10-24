const express = require('express');
const { get, all, run, tx } = require('../db');
const { requireAuth } = require('../auth');
const { normalizePhone, detectOperator } = require('../payments/service');
const { parseJSON, str } = require('../util');

const r = express.Router();
const SLOT_STEP = 30; // minutes
const MIN_NOTICE_MS = 2 * 3600 * 1000;

function shape(row) {
  return {
    id: row.id, name: row.name, avatar: row.avatar, city: row.city, country: row.country,
    headline: row.headline, bio: row.bio, video_url: row.video_url,
    hourly_rate: row.hourly_rate, trial_rate: row.trial_rate, category: row.category,
    subjects: parseJSON(row.subjects, []), languages: parseJSON(row.languages, []),
    levels: parseJSON(row.levels, []), specialties: parseJSON(row.specialties, []),
    native_language: row.native_language, experience_years: row.experience_years,
    education: row.education, certificates: row.certificates, rating: row.rating,
    reviews_count: row.reviews_count, lessons_count: row.lessons_count, students_count: row.students_count,
    instant_book: !!row.instant_book, home_lessons: !!row.home_lessons, super_tutor: !!row.super_tutor,
    tz_offset: row.tz_offset, status: row.status, created_at: row.created_at,
  };
}

// Créneaux libres des 14 prochains jours, renvoyés en ISO UTC
function freeSlots(tutorId, duration = 60, days = 14) {
  const p = get('SELECT tz_offset FROM tutor_profiles WHERE user_id = ?', tutorId);
  const tz = p?.tz_offset ?? 60;
  const windows = all('SELECT weekday, start_min, end_min FROM availability WHERE tutor_id = ?', tutorId);
  const now = Date.now();
  const horizon = now + days * 86400000;
  const busy = [
    ...all("SELECT start_at, duration_min FROM bookings WHERE tutor_id = ? AND status IN ('confirmed','disputed') AND start_at >= ?", tutorId, new Date(now - 86400000).toISOString()),
    ...all("SELECT start_at, duration_min FROM group_classes WHERE tutor_id = ? AND status = 'scheduled' AND start_at >= ?", tutorId, new Date(now - 86400000).toISOString()),
  ].map((b) => [Date.parse(b.start_at), Date.parse(b.start_at) + b.duration_min * 60000]);

  const slots = [];
  // Minuit local du tuteur, aujourd'hui
  const localNow = new Date(now + tz * 60000);
  const day0 = Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) - tz * 60000;
  for (let d = 0; d <= days; d++) {
    const dayStart = day0 + d * 86400000;
    const weekday = new Date(dayStart + tz * 60000).getUTCDay();
    for (const w of windows.filter((x) => x.weekday === weekday)) {
      for (let m = w.start_min; m + duration <= w.end_min; m += SLOT_STEP) {
        const s = dayStart + m * 60000;
        const e = s + duration * 60000;
        if (s < now + MIN_NOTICE_MS || s > horizon) continue;
        if (busy.some(([bs, be]) => s < be && e > bs)) continue;
        slots.push(new Date(s).toISOString());
      }
    }
  }
  return [...new Set(slots)].sort();
}

r.get('/', (req, res) => {
  const q = req.query;
  const where = ["p.status = 'approved'", 'u.is_blocked = 0'];
  const params = [];
  if (q.category && ['langue', 'scolaire'].includes(q.category)) { where.push("(p.category = ? OR p.category = 'both')"); params.push(q.category); }
  if (q.subject) { where.push('p.subjects LIKE ?'); params.push(`%"${str(q.subject, 60)}"%`); }
  if (q.level) { where.push('p.levels LIKE ?'); params.push(`%"${str(q.level, 60)}"%`); }
  if (q.speaks) { where.push('p.languages LIKE ?'); params.push(`%"${str(q.speaks, 40)}"%`); }
  if (q.city) { where.push('u.city = ?'); params.push(str(q.city, 60)); }
  if (q.native === '1') { where.push('p.native_language IS NOT NULL'); }
  if (q.home === '1') where.push('p.home_lessons = 1');
  if (q.super === '1') where.push('p.super_tutor = 1');
  if (q.min_price) { where.push('p.hourly_rate >= ?'); params.push(Number(q.min_price)); }
  if (q.max_price) { where.push('p.hourly_rate <= ?'); params.push(Number(q.max_price)); }
  if (q.q) {
    where.push('(u.name LIKE ? OR p.headline LIKE ? OR p.bio LIKE ? OR p.specialties LIKE ?)');
    const like = `%${str(q.q, 80)}%`;
    params.push(like, like, like, like);
  }
  const order = {
    price_asc: 'p.hourly_rate ASC',
    price_desc: 'p.hourly_rate DESC',
    rating: 'p.rating DESC, p.reviews_count DESC',
    popular: 'p.lessons_count DESC',
    new: 'u.created_at DESC',
  }[q.sort] || 'p.super_tutor DESC, (p.rating * MIN(p.reviews_count, 20)) DESC, p.lessons_count DESC';
  const limit = Math.min(Number(q.limit) || 20, 50);
  const offset = Math.max(Number(q.offset) || 0, 0);
  const base = `FROM users u JOIN tutor_profiles p ON p.user_id = u.id WHERE ${where.join(' AND ')}`;
  const total = get(`SELECT COUNT(*) c ${base}`, ...params).c;
  let rows = all(`SELECT u.*, p.* , u.id AS id ${base} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, limit, offset).map(shape);

  // Filtre « disponible à tel moment » (matin / après-midi / soir / week-end)
  if (q.when) {
    rows = rows.filter((t) => {
      const av = all('SELECT weekday, start_min, end_min FROM availability WHERE tutor_id = ?', t.id);
      return av.some((a) => {
        if (q.when === 'weekend') return a.weekday === 0 || a.weekday === 6;
        const [from, to] = { morning: [360, 720], afternoon: [720, 1080], evening: [1080, 1440] }[q.when] || [0, 1440];
        return a.start_min < to && a.end_min > from;
      });
    });
  }
  const favs = req.user ? new Set(all('SELECT tutor_id FROM favorites WHERE student_id = ?', req.user.id).map((f) => f.tutor_id)) : new Set();
  rows.forEach((t) => { t.favorite = favs.has(t.id); });
  res.json({ total, items: rows });
});

r.get('/favorites', requireAuth(), (req, res) => {
  const rows = all(`SELECT u.*, p.*, u.id AS id FROM favorites f JOIN users u ON u.id = f.tutor_id
    JOIN tutor_profiles p ON p.user_id = u.id WHERE f.student_id = ?`, req.user.id).map(shape);
  rows.forEach((t) => { t.favorite = true; });
  res.json(rows);
});

r.post('/:id/favorite', requireAuth(), (req, res) => {
  const id = Number(req.params.id);
  const exists = get('SELECT 1 FROM favorites WHERE student_id = ? AND tutor_id = ?', req.user.id, id);
  if (exists) run('DELETE FROM favorites WHERE student_id = ? AND tutor_id = ?', req.user.id, id);
  else run('INSERT INTO favorites (student_id, tutor_id) VALUES (?, ?)', req.user.id, id);
  res.json({ favorite: !exists });
});

r.get('/:id', (req, res) => {
  const row = get('SELECT u.*, p.*, u.id AS id FROM users u JOIN tutor_profiles p ON p.user_id = u.id WHERE u.id = ?', Number(req.params.id));
  if (!row || (row.status !== 'approved' && req.user?.id !== row.id && req.user?.role !== 'admin')) {
    return res.status(404).json({ error: 'Tuteur introuvable' });
  }
  const t = shape(row);
  t.reviews = all(`SELECT r.rating, r.comment, r.created_at, u.name AS student_name, u.avatar AS student_avatar
    FROM reviews r JOIN users u ON u.id = r.student_id WHERE r.tutor_id = ? ORDER BY r.id DESC LIMIT 30`, t.id);
  t.availability = all('SELECT weekday, start_min, end_min FROM availability WHERE tutor_id = ? ORDER BY weekday, start_min', t.id);
  t.group_classes = all("SELECT * FROM group_classes WHERE tutor_id = ? AND status = 'scheduled' AND start_at > ? ORDER BY start_at LIMIT 10", t.id, new Date().toISOString());
  t.favorite = req.user ? !!get('SELECT 1 FROM favorites WHERE student_id = ? AND tutor_id = ?', req.user.id, t.id) : false;
  if (req.user) {
    t.has_trial = !!get("SELECT 1 FROM bookings WHERE student_id = ? AND tutor_id = ? AND type = 'trial' AND status != 'cancelled'", req.user.id, t.id);
    t.packages = all('SELECT * FROM packages WHERE student_id = ? AND tutor_id = ? AND lessons_left > 0', req.user.id, t.id);
  }
  res.json(t);
});

r.get('/:id/slots', (req, res) => {
  const duration = [30, 45, 60, 90, 120].includes(Number(req.query.duration)) ? Number(req.query.duration) : 60;
  res.json(freeSlots(Number(req.params.id), duration));
});

// Le tuteur met à jour son profil
r.put('/me/profile', requireAuth('tutor'), (req, res) => {
  const b = req.body;
  const list = (v) => JSON.stringify((Array.isArray(v) ? v : String(v || '').split(',')).map((x) => str(x, 60)).filter(Boolean).slice(0, 20));
  const rate = Math.round(Number(b.hourly_rate));
  const trial = Math.round(Number(b.trial_rate));
  if (!(rate >= 1000 && rate <= 100000)) return res.status(400).json({ error: 'Tarif horaire entre 1 000 et 100 000 FCFA' });
  if (!(trial >= 0 && trial <= rate)) return res.status(400).json({ error: "Le cours d'essai doit coûter entre 0 et le tarif horaire" });
  const payoutPhone = b.payout_phone ? normalizePhone(b.payout_phone) : null;
  if (b.payout_phone && !payoutPhone) return res.status(400).json({ error: 'Numéro Mobile Money de versement invalide' });
  run(`UPDATE tutor_profiles SET headline = ?, bio = ?, video_url = ?, hourly_rate = ?, trial_rate = ?, category = ?,
       subjects = ?, languages = ?, levels = ?, specialties = ?, native_language = ?, experience_years = ?, education = ?,
       certificates = ?, tz_offset = ?, instant_book = ?, home_lessons = ?, payout_phone = ?, payout_operator = ? WHERE user_id = ?`,
  str(b.headline, 120), str(b.bio, 4000), str(b.video_url, 300), rate, trial,
  ['langue', 'scolaire', 'both'].includes(b.category) ? b.category : 'langue',
  list(b.subjects), list(b.languages), list(b.levels), list(b.specialties), str(b.native_language, 40) || null,
  Math.max(0, Math.min(60, Number(b.experience_years) || 0)), str(b.education, 300), str(b.certificates, 300),
  Number.isFinite(Number(b.tz_offset)) ? Number(b.tz_offset) : 60, b.instant_book ? 1 : 0, b.home_lessons ? 1 : 0,
  payoutPhone, payoutPhone ? detectOperator(payoutPhone) : null, req.user.id);
  res.json({ ok: true });
});

r.put('/me/availability', requireAuth('tutor'), (req, res) => {
  const slots = Array.isArray(req.body.slots) ? req.body.slots : [];
  const clean = slots
    .map((s) => ({ weekday: Number(s.weekday), start: Number(s.start_min), end: Number(s.end_min) }))
    .filter((s) => s.weekday >= 0 && s.weekday <= 6 && s.start >= 0 && s.end <= 1440 && s.end - s.start >= 30);
  tx(() => {
    run('DELETE FROM availability WHERE tutor_id = ?', req.user.id);
    for (const s of clean) run('INSERT INTO availability (tutor_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)', req.user.id, s.weekday, s.start, s.end);
  });
  res.json({ ok: true, count: clean.length });
});

module.exports = { router: r, freeSlots, shape };
