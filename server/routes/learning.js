// Devoirs, quiz auto-corrigés, vocabulaire (répétition espacée) et suivi de progression
const express = require('express');
const { get, all, run } = require('../db');
const { requireAuth } = require('../auth');
const { notify } = require('../notify');
const { parseJSON, str } = require('../util');

const r = express.Router();
const LEITNER_DAYS = [0, 1, 3, 7, 14, 30];

function canSeeStudent(user, studentId) {
  if (user.id === studentId || user.role === 'admin') return true;
  if (user.role === 'parent') return !!get('SELECT 1 FROM parent_links WHERE parent_id = ? AND child_id = ?', user.id, studentId);
  if (user.role === 'tutor') return !!get('SELECT 1 FROM bookings WHERE tutor_id = ? AND student_id = ? LIMIT 1', user.id, studentId);
  return false;
}

const hwView = `SELECT h.*, t.name AS tutor_name, s.name AS student_name FROM homework h
  JOIN users t ON t.id = h.tutor_id JOIN users s ON s.id = h.student_id`;

function present(h, user) {
  const quiz = parseJSON(h.quiz, null);
  // On masque les réponses correctes à l'élève tant que le devoir n'est pas rendu
  if (quiz && user.role !== 'tutor' && h.status === 'assigned') quiz.forEach((q) => delete q.answer);
  return { ...h, quiz, quiz_answers: parseJSON(h.quiz_answers, null) };
}

r.get('/homework', requireAuth(), (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === 'tutor') rows = all(`${hwView} WHERE h.tutor_id = ? ORDER BY h.id DESC`, u.id);
  else if (u.role === 'parent') rows = all(`${hwView} WHERE h.student_id IN (SELECT child_id FROM parent_links WHERE parent_id = ?) ORDER BY h.id DESC`, u.id);
  else rows = all(`${hwView} WHERE h.student_id = ? ORDER BY h.id DESC`, u.id);
  res.json(rows.map((h) => present(h, u)));
});

r.post('/homework', requireAuth('tutor'), (req, res) => {
  const b = req.body;
  const studentId = Number(b.student_id);
  if (!get('SELECT 1 FROM bookings WHERE tutor_id = ? AND student_id = ? LIMIT 1', req.user.id, studentId)) {
    return res.status(400).json({ error: 'Vous ne pouvez donner des devoirs qu\'à vos élèves' });
  }
  const quiz = Array.isArray(b.quiz) ? b.quiz.slice(0, 30).map((q) => ({
    question: str(q.question, 500),
    choices: (q.choices || []).slice(0, 6).map((c) => str(c, 200)),
    answer: Number(q.answer) || 0,
  })).filter((q) => q.question && q.choices.length >= 2) : null;
  const id = run('INSERT INTO homework (tutor_id, student_id, booking_id, title, instructions, quiz, due_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    req.user.id, studentId, b.booking_id ? Number(b.booking_id) : null, str(b.title, 160) || 'Devoir', str(b.instructions, 5000),
    quiz && quiz.length ? JSON.stringify(quiz) : null, b.due_at ? new Date(b.due_at).toISOString() : null).lastInsertRowid;
  notify(studentId, 'Nouveau devoir', `${req.user.name} vous a donné un devoir : ${str(b.title, 80)}`, '#/homework');
  for (const p of all('SELECT parent_id FROM parent_links WHERE child_id = ?', studentId)) {
    notify(p.parent_id, 'Nouveau devoir pour votre enfant', str(b.title, 80), '#/homework');
  }
  res.json(present(get(`${hwView} WHERE h.id = ?`, id), req.user));
});

r.post('/homework/:id/submit', requireAuth('student'), (req, res) => {
  const h = get('SELECT * FROM homework WHERE id = ? AND student_id = ?', Number(req.params.id), req.user.id);
  if (!h) return res.status(404).json({ error: 'Devoir introuvable' });
  if (h.status !== 'assigned') return res.status(400).json({ error: 'Devoir déjà rendu' });
  const quiz = parseJSON(h.quiz, null);
  let score = null;
  let answers = null;
  if (quiz) {
    answers = quiz.map((_, i) => Number(req.body.quiz_answers?.[i]));
    score = Math.round((quiz.filter((q, i) => q.answer === answers[i]).length / quiz.length) * 100);
  }
  // Un quiz sans réponse rédigée est corrigé automatiquement
  const autoGraded = quiz && !str(h.instructions);
  run('UPDATE homework SET status = ?, answer = ?, quiz_answers = ?, score = ? WHERE id = ?',
    autoGraded ? 'graded' : 'submitted', str(req.body.answer, 10000), answers ? JSON.stringify(answers) : null, score, h.id);
  run('UPDATE users SET xp = xp + ? WHERE id = ?', 20 + Math.round((score || 0) / 5), req.user.id);
  notify(h.tutor_id, 'Devoir rendu', `${req.user.name} a rendu « ${h.title} »${score !== null ? ` (quiz : ${score}%)` : ''}.`, '#/homework');
  res.json(present(get(`${hwView} WHERE h.id = ?`, h.id), req.user));
});

r.post('/homework/:id/grade', requireAuth('tutor'), (req, res) => {
  const h = get('SELECT * FROM homework WHERE id = ? AND tutor_id = ?', Number(req.params.id), req.user.id);
  if (!h) return res.status(404).json({ error: 'Devoir introuvable' });
  const score = req.body.score === '' || req.body.score === undefined ? h.score : Math.max(0, Math.min(100, Number(req.body.score)));
  run("UPDATE homework SET status = 'graded', score = ?, feedback = ? WHERE id = ?", score, str(req.body.feedback, 5000), h.id);
  notify(h.student_id, 'Devoir corrigé', `« ${h.title} » a été corrigé${score !== null ? ` : ${score}/100` : ''}.`, '#/homework');
  res.json(present(get(`${hwView} WHERE h.id = ?`, h.id), req.user));
});

// ---------------------------------------------------------------- Vocabulaire
r.get('/vocab', requireAuth('student'), (req, res) => {
  const items = all('SELECT * FROM vocab WHERE student_id = ? ORDER BY id DESC', req.user.id);
  const due = items.filter((v) => v.next_review <= new Date().toISOString().slice(0, 10));
  res.json({ items, due });
});

r.post('/vocab', requireAuth('student'), (req, res) => {
  const word = str(req.body.word, 120);
  if (!word) return res.status(400).json({ error: 'Mot requis' });
  const id = run('INSERT INTO vocab (student_id, word, translation, example) VALUES (?, ?, ?, ?)', req.user.id, word, str(req.body.translation, 200), str(req.body.example, 500)).lastInsertRowid;
  res.json(get('SELECT * FROM vocab WHERE id = ?', id));
});

// Révision : système de Leitner (boîtes 1 à 5)
r.post('/vocab/:id/review', requireAuth('student'), (req, res) => {
  const v = get('SELECT * FROM vocab WHERE id = ? AND student_id = ?', Number(req.params.id), req.user.id);
  if (!v) return res.status(404).json({ error: 'Mot introuvable' });
  const box = req.body.known ? Math.min(v.box + 1, 5) : 1;
  const next = new Date(Date.now() + LEITNER_DAYS[box] * 86400000).toISOString().slice(0, 10);
  run('UPDATE vocab SET box = ?, next_review = ? WHERE id = ?', box, next, v.id);
  if (req.body.known) run('UPDATE users SET xp = xp + 2 WHERE id = ?', req.user.id);
  res.json({ ...v, box, next_review: next });
});

r.delete('/vocab/:id', requireAuth('student'), (req, res) => {
  run('DELETE FROM vocab WHERE id = ? AND student_id = ?', Number(req.params.id), req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- Progression
r.get('/progress/:studentId', requireAuth(), (req, res) => {
  const sid = Number(req.params.studentId);
  if (!canSeeStudent(req.user, sid)) return res.status(403).json({ error: 'Accès refusé' });
  const student = get('SELECT id, name, avatar, xp, streak_days FROM users WHERE id = ?', sid);
  const lessons = get(`SELECT COUNT(*) total, COALESCE(SUM(duration_min), 0) minutes FROM bookings WHERE student_id = ? AND status = 'completed'`, sid);
  const upcoming = all(`SELECT b.id, b.start_at, b.subject, b.duration_min, u.name AS tutor_name FROM bookings b JOIN users u ON u.id = b.tutor_id
    WHERE b.student_id = ? AND b.status = 'confirmed' ORDER BY b.start_at LIMIT 10`, sid);
  const bySubject = all(`SELECT COALESCE(subject, 'Général') subject, COUNT(*) n, SUM(duration_min) minutes FROM bookings
    WHERE student_id = ? AND status = 'completed' GROUP BY 1 ORDER BY 2 DESC`, sid);
  const hw = get(`SELECT COUNT(*) total, SUM(status != 'assigned') done, ROUND(AVG(score)) avg_score FROM homework WHERE student_id = ?`, sid);
  const scores = all('SELECT title, score, created_at FROM homework WHERE student_id = ? AND score IS NOT NULL ORDER BY id DESC LIMIT 12', sid).reverse();
  const weekly = all(`SELECT strftime('%Y-%W', start_at) week, SUM(duration_min) minutes FROM bookings
    WHERE student_id = ? AND status = 'completed' AND start_at >= date('now', '-84 days') GROUP BY 1 ORDER BY 1`, sid);
  const vocab = get('SELECT COUNT(*) total, SUM(box >= 4) mastered FROM vocab WHERE student_id = ?', sid);
  const level = Math.floor(Math.sqrt(student.xp / 100)) + 1;
  res.json({ student, level, lessons, upcoming, bySubject, homework: hw, scores, weekly, vocab });
});

module.exports = { router: r };
