const express = require('express');
const { get, all, run, tx } = require('../db');
const { requireAuth, publicUser } = require('../auth');
const { completeBooking, refundBooking } = require('./bookings');
const pay = require('../payments/service');
const { notify } = require('../notify');
const { str } = require('../util');

const r = express.Router();
r.use(requireAuth('admin'));

r.get('/stats', (_req, res) => {
  const revenue = all(`SELECT strftime('%Y-%m', created_at) month, SUM(json_extract(meta, '$.commission')) commission, SUM(json_extract(meta, '$.gross')) gross
    FROM transactions WHERE type = 'earning' GROUP BY 1 ORDER BY 1 DESC LIMIT 12`).reverse();
  res.json({
    users: get(`SELECT COUNT(*) total, SUM(role = 'student') students, SUM(role = 'tutor') tutors, SUM(role = 'parent') parents FROM users`),
    lessons: get(`SELECT COUNT(*) total, SUM(status = 'completed') completed, SUM(status = 'confirmed') upcoming, SUM(status = 'disputed') disputed FROM bookings`),
    money: get(`SELECT
      COALESCE(SUM(CASE WHEN type = 'deposit' AND status = 'success' THEN amount END), 0) deposits,
      COALESCE(SUM(CASE WHEN type = 'withdrawal' AND status = 'success' THEN amount END), 0) withdrawals,
      COALESCE(SUM(CASE WHEN type = 'earning' THEN json_extract(meta, '$.commission') END), 0) commission,
      (SELECT COALESCE(SUM(held_balance), 0) FROM users) escrow,
      (SELECT COALESCE(SUM(wallet_balance), 0) FROM users) wallets
      FROM transactions`),
    by_operator: all(`SELECT operator, COUNT(*) n, SUM(amount) amount FROM transactions WHERE type = 'deposit' AND status = 'success' GROUP BY operator`),
    revenue,
    commission_rate: pay.commissionRate(),
  });
});

r.get('/tutors', (req, res) => {
  const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  res.json(all(`SELECT u.id, u.name, u.email, u.phone, u.city, u.created_at, p.headline, p.subjects, p.hourly_rate, p.education, p.certificates, p.video_url, p.status
    FROM users u JOIN tutor_profiles p ON p.user_id = u.id WHERE p.status = ? ORDER BY u.id DESC`, status));
});

r.post('/tutors/:id/:decision', (req, res) => {
  const status = req.params.decision === 'approve' ? 'approved' : 'rejected';
  run('UPDATE tutor_profiles SET status = ? WHERE user_id = ?', status, Number(req.params.id));
  notify(Number(req.params.id), status === 'approved' ? 'Profil approuvé 🎉' : 'Profil refusé',
    status === 'approved' ? 'Votre profil est désormais visible par les élèves.' : str(req.body.reason, 300) || 'Complétez votre profil et contactez le support.', '#/dashboard');
  res.json({ ok: true });
});

r.get('/users', (req, res) => {
  const q = `%${str(req.query.q, 80)}%`;
  res.json(all('SELECT * FROM users WHERE name LIKE ? OR email LIKE ? OR phone LIKE ? ORDER BY id DESC LIMIT 100', q, q, q).map(publicUser));
});

// Lien de réinitialisation à transmettre à l'utilisateur (WhatsApp, SMS…) quand l'e-mail n'est pas configuré
r.post('/users/:id/reset-link', (req, res) => {
  const u = get('SELECT id FROM users WHERE id = ?', Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json({ url: require('./auth').createResetLink(u.id) });
});

r.post('/users/:id/block', (req, res) => {
  run('UPDATE users SET is_blocked = 1 - is_blocked WHERE id = ? AND role != \'admin\'', Number(req.params.id));
  res.json({ ok: true });
});

r.get('/transactions', (req, res) => {
  res.json(all(`SELECT t.*, u.name AS user_name FROM transactions t JOIN users u ON u.id = t.user_id
    ${req.query.type ? 'WHERE t.type = ?' : ''} ORDER BY t.id DESC LIMIT 200`, ...(req.query.type ? [req.query.type] : [])));
});

r.get('/disputes', (_req, res) => {
  res.json(all(`SELECT b.*, s.name AS student_name, t.name AS tutor_name FROM bookings b JOIN users s ON s.id = b.student_id
    JOIN users t ON t.id = b.tutor_id WHERE b.status = 'disputed' ORDER BY b.id DESC`));
});

// Arbitrage : rembourser l'élève ou payer le tuteur
r.post('/disputes/:id/:decision', (req, res) => {
  const b = get("SELECT * FROM bookings WHERE id = ? AND status = 'disputed'", Number(req.params.id));
  if (!b) return res.status(404).json({ error: 'Litige introuvable' });
  tx(() => {
    if (req.params.decision === 'refund') {
      run("UPDATE bookings SET status = 'refunded' WHERE id = ?", b.id);
      refundBooking(b, `Remboursement après réclamation (cours n°${b.id})`);
    } else {
      run("UPDATE bookings SET status = 'confirmed' WHERE id = ?", b.id);
      completeBooking({ ...b, status: 'confirmed' });
    }
  });
  notify(b.student_id, 'Réclamation traitée', req.params.decision === 'refund' ? 'Vous avez été remboursé.' : 'Le cours a été validé.', '#/lessons');
  notify(b.tutor_id, 'Réclamation traitée', req.params.decision === 'refund' ? "L'élève a été remboursé." : 'Le paiement vous a été versé.', '#/wallet');
  res.json({ ok: true });
});

r.put('/settings', (req, res) => {
  const rate = Number(req.body.commission_rate);
  if (!(rate >= 0 && rate <= 50)) return res.status(400).json({ error: 'Commission entre 0 et 50 %' });
  run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', 'commission_rate', String(rate));
  res.json({ ok: true });
});

module.exports = { router: r };
