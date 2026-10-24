// Cours collectifs (préparation BEPC, Probatoire, Bac, GCE, clubs de conversation…)
const express = require('express');
const { get, all, run, tx } = require('../db');
const { requireAuth } = require('../auth');
const pay = require('../payments/service');
const { notify } = require('../notify');
const { roomId, str } = require('../util');

const r = express.Router();
const view = `SELECT g.*, u.name AS tutor_name, u.avatar AS tutor_avatar,
  (SELECT COUNT(*) FROM group_enrollments e WHERE e.class_id = g.id) AS enrolled
  FROM group_classes g JOIN users u ON u.id = g.tutor_id`;

r.get('/', (req, res) => {
  const where = ["g.status = 'scheduled'", 'g.start_at > ?'];
  const params = [new Date(Date.now() - 2 * 3600000).toISOString()];
  if (req.query.subject) { where.push('g.subject = ?'); params.push(str(req.query.subject, 60)); }
  if (req.query.level) { where.push('g.level = ?'); params.push(str(req.query.level, 60)); }
  const rows = all(`${view} WHERE ${where.join(' AND ')} ORDER BY g.start_at LIMIT 60`, ...params);
  if (req.user) {
    const mine = new Set(all('SELECT class_id FROM group_enrollments WHERE student_id = ?', req.user.id).map((e) => e.class_id));
    rows.forEach((g) => { g.joined = mine.has(g.id); });
  }
  res.json(rows);
});

r.get('/mine', requireAuth(), (req, res) => {
  if (req.user.role === 'tutor') return res.json(all(`${view} WHERE g.tutor_id = ? ORDER BY g.start_at DESC`, req.user.id));
  res.json(all(`${view} WHERE g.id IN (SELECT class_id FROM group_enrollments WHERE student_id = ?) ORDER BY g.start_at DESC`, req.user.id));
});

r.post('/', requireAuth('tutor'), (req, res) => {
  const b = req.body;
  const start = new Date(b.start_at);
  if (Number.isNaN(start.getTime()) || start < new Date()) return res.status(400).json({ error: 'Date invalide' });
  const price = Math.round(Number(b.price));
  if (!(price >= 0 && price <= 100000)) return res.status(400).json({ error: 'Prix invalide' });
  const id = run(`INSERT INTO group_classes (tutor_id, title, subject, level, description, start_at, duration_min, max_students, price, room_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, req.user.id, str(b.title, 120) || 'Cours collectif', str(b.subject, 60), str(b.level, 60),
  str(b.description, 2000), start.toISOString(), Math.min(Math.max(Number(b.duration_min) || 90, 30), 240),
  Math.min(Math.max(Number(b.max_students) || 10, 2), 30), price, roomId()).lastInsertRowid;
  res.json(get(`${view} WHERE g.id = ?`, id));
});

r.post('/:id/join', requireAuth('student'), (req, res, next) => {
  try {
    const g = get(`${view} WHERE g.id = ?`, Number(req.params.id));
    if (!g || g.status !== 'scheduled') return res.status(404).json({ error: 'Cours introuvable' });
    if (g.enrolled >= g.max_students) return res.status(400).json({ error: 'Cours complet' });
    if (get('SELECT 1 FROM group_enrollments WHERE class_id = ? AND student_id = ?', g.id, req.user.id)) return res.status(400).json({ error: 'Déjà inscrit' });
    tx(() => {
      if (g.price > 0) pay.holdForLesson(req.user.id, g.price, `Cours collectif : ${g.title}`);
      run('INSERT INTO group_enrollments (class_id, student_id, price) VALUES (?, ?, ?)', g.id, req.user.id, g.price);
    });
    notify(g.tutor_id, 'Nouvel inscrit', `${req.user.name} a rejoint « ${g.title} ».`, '#/groups');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Le tuteur clôture le cours : versement des inscriptions (moins commission)
r.post('/:id/complete', requireAuth('tutor', 'admin'), (req, res) => {
  const g = get('SELECT * FROM group_classes WHERE id = ?', Number(req.params.id));
  if (!g || (req.user.role !== 'admin' && g.tutor_id !== req.user.id)) return res.status(404).json({ error: 'Cours introuvable' });
  if (g.status !== 'scheduled') return res.status(400).json({ error: 'Cours déjà clôturé' });
  if (Date.parse(g.start_at) > Date.now()) return res.status(400).json({ error: "Le cours n'a pas encore commencé" });
  tx(() => {
    run("UPDATE group_classes SET status = 'completed' WHERE id = ?", g.id);
    for (const e of all('SELECT * FROM group_enrollments WHERE class_id = ?', g.id)) {
      if (e.price > 0) pay.releaseToTutor(e.student_id, g.tutor_id, e.price, `Cours collectif : ${g.title}`);
    }
  });
  res.json({ ok: true });
});

r.post('/:id/cancel', requireAuth('tutor', 'admin'), (req, res) => {
  const g = get('SELECT * FROM group_classes WHERE id = ?', Number(req.params.id));
  if (!g || (req.user.role !== 'admin' && g.tutor_id !== req.user.id)) return res.status(404).json({ error: 'Cours introuvable' });
  if (g.status !== 'scheduled') return res.status(400).json({ error: 'Cours déjà clôturé' });
  tx(() => {
    run("UPDATE group_classes SET status = 'cancelled' WHERE id = ?", g.id);
    for (const e of all('SELECT * FROM group_enrollments WHERE class_id = ?', g.id)) {
      if (e.price > 0) pay.refundStudent(e.student_id, e.price, `Remboursement : ${g.title}`);
      notify(e.student_id, 'Cours collectif annulé', `« ${g.title} » a été annulé. Vous avez été remboursé.`, '#/wallet');
    }
  });
  res.json({ ok: true });
});

module.exports = { router: r };
