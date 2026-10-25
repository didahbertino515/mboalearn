const express = require('express');
const { get, all, run, tx } = require('../db');
const { requireAuth } = require('../auth');
const pay = require('../payments/service');
const { freeSlots } = require('./tutors');
const { notify } = require('../notify');
const { roomId, str } = require('../util');

const r = express.Router();
const CANCEL_FREE_HOURS = 12;
const PACKAGE_DISCOUNTS = { 5: 0, 10: 5, 20: 10 }; // % de remise selon le nombre de cours

const bookingView = `SELECT b.*, s.name AS student_name, s.avatar AS student_avatar, t.name AS tutor_name, t.avatar AS tutor_avatar,
  (SELECT 1 FROM reviews rv WHERE rv.booking_id = b.id) AS reviewed
  FROM bookings b JOIN users s ON s.id = b.student_id JOIN users t ON t.id = b.tutor_id`;

function priceFor(tutorId, type, duration) {
  const p = get('SELECT hourly_rate, trial_rate FROM tutor_profiles WHERE user_id = ?', tutorId);
  if (type === 'trial') return Math.round((p.trial_rate * duration) / 60);
  return Math.round((p.hourly_rate * duration) / 60);
}

// Mise à jour des statistiques du tuteur
function refreshTutorStats(tutorId) {
  const s = get(`SELECT COUNT(*) lessons, COUNT(DISTINCT student_id) students FROM bookings WHERE tutor_id = ? AND status = 'completed'`, tutorId);
  const rv = get('SELECT AVG(rating) avg, COUNT(*) n FROM reviews WHERE tutor_id = ?', tutorId);
  run('UPDATE tutor_profiles SET lessons_count = ?, students_count = ?, rating = ?, reviews_count = ? WHERE user_id = ?',
    s.lessons, s.students, Math.round((rv.avg || 0) * 10) / 10, rv.n, tutorId);
  require('../supertutor').refresh(tutorId);
}

// Lister mes cours (élève, tuteur, parent pour ses enfants)
r.get('/', requireAuth(), (req, res) => {
  const u = req.user;
  let rows;
  if (u.role === 'tutor') rows = all(`${bookingView} WHERE b.tutor_id = ? ORDER BY b.start_at DESC LIMIT 300`, u.id);
  else if (u.role === 'parent') rows = all(`${bookingView} WHERE b.student_id IN (SELECT child_id FROM parent_links WHERE parent_id = ?) ORDER BY b.start_at DESC LIMIT 300`, u.id);
  else if (u.role === 'admin') rows = all(`${bookingView} ORDER BY b.start_at DESC LIMIT 300`);
  else rows = all(`${bookingView} WHERE b.student_id = ? ORDER BY b.start_at DESC LIMIT 300`, u.id);
  res.json(rows);
});

r.get('/packages', requireAuth(), (req, res) => {
  const col = req.user.role === 'tutor' ? 'tutor_id' : 'student_id';
  res.json(all(`SELECT pk.*, t.name AS tutor_name, s.name AS student_name FROM packages pk
    JOIN users t ON t.id = pk.tutor_id JOIN users s ON s.id = pk.student_id WHERE pk.${col} = ? ORDER BY pk.id DESC`, req.user.id));
});

// Acheter un forfait de cours (remise dégressive)
r.post('/packages', requireAuth('student', 'parent'), (req, res, next) => {
  try {
    const tutorId = Number(req.body.tutor_id);
    const count = Number(req.body.lessons);
    if (!(count in PACKAGE_DISCOUNTS)) return res.status(400).json({ error: 'Forfait de 5, 10 ou 20 cours' });
    const tutor = get("SELECT * FROM tutor_profiles WHERE user_id = ? AND status = 'approved'", tutorId);
    if (!tutor) return res.status(404).json({ error: 'Tuteur introuvable' });
    const studentId = studentFor(req);
    const per = Math.round(tutor.hourly_rate * (1 - PACKAGE_DISCOUNTS[count] / 100));
    const total = per * count;
    const payer = req.user.id;
    const id = tx(() => {
      pay.chargeWallet(payer, total, `Forfait ${count} cours`);
      if (payer !== studentId) moveHeld(payer, studentId, total);
      return Number(run('INSERT INTO packages (student_id, tutor_id, lessons_total, lessons_left, price_per_lesson, subject) VALUES (?, ?, ?, ?, ?, ?)',
        studentId, tutorId, count, count, per, str(req.body.subject, 60) || null).lastInsertRowid);
    });
    notify(tutorId, 'Nouveau forfait acheté', `${req.user.name} a acheté un forfait de ${count} cours.`, '#/dashboard');
    res.json(get('SELECT * FROM packages WHERE id = ?', id));
  } catch (e) { next(e); }
});

// Un parent paye pour son enfant : le séquestre est porté par l'élève
function moveHeld(fromId, toId, amount) {
  run('UPDATE users SET held_balance = held_balance - ? WHERE id = ?', amount, fromId);
  run('UPDATE users SET held_balance = held_balance + ? WHERE id = ?', amount, toId);
}

function studentFor(req) {
  if (req.user.role !== 'parent') return req.user.id;
  const child = get('SELECT child_id FROM parent_links WHERE parent_id = ? AND child_id = ?', req.user.id, Number(req.body.child_id));
  if (!child) throw pay.httpError(400, 'Choisissez un enfant rattaché à votre compte');
  return child.child_id;
}

// Réserver un cours
r.post('/', requireAuth('student', 'parent'), (req, res, next) => {
  try {
    const tutorId = Number(req.body.tutor_id);
    const duration = [30, 45, 60, 90, 120].includes(Number(req.body.duration)) ? Number(req.body.duration) : 60;
    const type = req.body.type === 'trial' ? 'trial' : 'regular';
    const startAt = new Date(req.body.start_at).toISOString();
    const recurring = Math.min(Math.max(Number(req.body.weeks) || 1, 1), 12); // réservation hebdomadaire récurrente
    const studentId = studentFor(req);
    const tutor = get("SELECT p.*, u.name FROM tutor_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ? AND p.status = 'approved'", tutorId);
    if (!tutor) return res.status(404).json({ error: 'Tuteur introuvable' });
    if (type === 'trial') {
      if (recurring > 1) return res.status(400).json({ error: "Le cours d'essai ne peut pas être récurrent" });
      if (get("SELECT 1 FROM bookings WHERE student_id = ? AND tutor_id = ? AND type = 'trial' AND status != 'cancelled'", studentId, tutorId)) {
        return res.status(400).json({ error: "Vous avez déjà pris un cours d'essai avec ce tuteur" });
      }
    }
    const pkg = req.body.package_id ? get('SELECT * FROM packages WHERE id = ? AND student_id = ? AND tutor_id = ? AND lessons_left > 0', Number(req.body.package_id), studentId, tutorId) : null;
    if (req.body.package_id && !pkg) return res.status(400).json({ error: 'Forfait épuisé ou invalide' });
    if (pkg && duration !== 60) return res.status(400).json({ error: 'Les forfaits concernent des cours de 60 minutes' });

    const free = new Set(freeSlots(tutorId, duration, 7 * recurring + 7));
    const starts = Array.from({ length: recurring }, (_, i) => new Date(Date.parse(startAt) + i * 7 * 86400000).toISOString());
    const unavailable = starts.filter((s) => !free.has(s));
    if (unavailable.length) return res.status(409).json({ error: `Créneau indisponible : ${unavailable.map((s) => new Date(s).toLocaleString('fr-FR', { timeZone: 'Africa/Douala' })).join(', ')}` });
    if (pkg && pkg.lessons_left < starts.length) return res.status(400).json({ error: `Il reste ${pkg.lessons_left} cours dans votre forfait` });

    const price = pkg ? pkg.price_per_lesson : priceFor(tutorId, type, duration);
    const ids = tx(() => {
      const created = [];
      for (const s of starts) {
        if (pkg) run('UPDATE packages SET lessons_left = lessons_left - 1 WHERE id = ?', pkg.id);
        else if (price > 0) {
          pay.holdForLesson(req.user.id, price, `Cours ${type === 'trial' ? "d'essai " : ''}avec ${tutor.name}`);
          if (req.user.id !== studentId) moveHeld(req.user.id, studentId, price);
        }
        created.push(Number(run(`INSERT INTO bookings (student_id, tutor_id, subject, start_at, duration_min, type, price, package_id, room_id, student_note)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, studentId, tutorId, str(req.body.subject, 60) || null, s, duration, type, price,
        pkg?.id || null, roomId(), str(req.body.note, 1000) || null).lastInsertRowid));
      }
      return created;
    });
    const when = new Date(starts[0]).toLocaleString('fr-FR', { timeZone: 'Africa/Douala', dateStyle: 'full', timeStyle: 'short' });
    notify(tutorId, 'Nouvelle réservation', `${req.user.name} a réservé ${ids.length > 1 ? `${ids.length} cours` : 'un cours'} à partir du ${when}.`, '#/lessons');
    notify(studentId, 'Cours confirmé', `Votre cours avec ${tutor.name} le ${when} est confirmé.`, '#/lessons');
    res.json(all(`${bookingView} WHERE b.id IN (${ids.map(() => '?').join(',')})`, ...ids));
  } catch (e) { next(e); }
});

function loadForUser(req) {
  const b = get('SELECT * FROM bookings WHERE id = ?', Number(req.params.id));
  if (!b) throw pay.httpError(404, 'Cours introuvable');
  const u = req.user;
  const isParent = u.role === 'parent' && get('SELECT 1 FROM parent_links WHERE parent_id = ? AND child_id = ?', u.id, b.student_id);
  if (u.role !== 'admin' && b.student_id !== u.id && b.tutor_id !== u.id && !isParent) throw pay.httpError(403, 'Accès refusé');
  return b;
}

function refundBooking(b, reason) {
  if (b.package_id) run('UPDATE packages SET lessons_left = lessons_left + 1 WHERE id = ?', b.package_id);
  else if (b.price > 0) pay.refundStudent(b.student_id, b.price, reason);
}

function completeBooking(b) {
  if (b.status !== 'confirmed') return;
  run("UPDATE bookings SET status = 'completed', completed_at = datetime('now') WHERE id = ?", b.id);
  if (b.price > 0) pay.releaseToTutor(b.student_id, b.tutor_id, b.price, `Cours du ${b.start_at.slice(0, 10)} (n°${b.id})`);
  run('UPDATE users SET xp = xp + 50 WHERE id = ?', b.student_id);
  refreshTutorStats(b.tutor_id);
  notify(b.student_id, 'Cours terminé', 'Comment s\'est passé votre cours ? Laissez un avis à votre tuteur.', '#/lessons');
  notify(b.tutor_id, 'Paiement libéré', 'Le paiement du cours a été crédité sur votre solde.', '#/wallet');
}

r.get('/:id', requireAuth(), (req, res, next) => {
  try {
    const b = loadForUser(req);
    res.json(get(`${bookingView} WHERE b.id = ?`, b.id));
  } catch (e) { next(e); }
});

r.post('/:id/cancel', requireAuth(), (req, res, next) => {
  try {
    const b = loadForUser(req);
    if (b.status !== 'confirmed') return res.status(400).json({ error: 'Ce cours ne peut plus être annulé' });
    const hoursLeft = (Date.parse(b.start_at) - Date.now()) / 3600000;
    const byTutor = req.user.id === b.tutor_id;
    tx(() => {
      run("UPDATE bookings SET status = 'cancelled', cancelled_by = ? WHERE id = ?", req.user.id, b.id);
      // Remboursement intégral si annulé par le tuteur ou plus de 12h avant le cours
      if (byTutor || hoursLeft >= CANCEL_FREE_HOURS || req.user.role === 'admin') refundBooking(b, `Remboursement cours n°${b.id}`);
      else if (b.price > 0 && !b.package_id) pay.releaseToTutor(b.student_id, b.tutor_id, b.price, `Annulation tardive cours n°${b.id}`);
    });
    if (byTutor) require('../supertutor').refresh(b.tutor_id);
    const other = byTutor ? b.student_id : b.tutor_id;
    notify(other, 'Cours annulé', `Le cours du ${new Date(b.start_at).toLocaleString('fr-FR', { timeZone: 'Africa/Douala' })} a été annulé.`, '#/lessons');
    res.json({ ok: true, refunded: byTutor || hoursLeft >= CANCEL_FREE_HOURS });
  } catch (e) { next(e); }
});

r.post('/:id/reschedule', requireAuth(), (req, res, next) => {
  try {
    const b = loadForUser(req);
    if (b.status !== 'confirmed') return res.status(400).json({ error: 'Ce cours ne peut pas être déplacé' });
    if ((Date.parse(b.start_at) - Date.now()) / 3600000 < CANCEL_FREE_HOURS && req.user.id !== b.tutor_id) {
      return res.status(400).json({ error: `Déplacement possible jusqu'à ${CANCEL_FREE_HOURS}h avant le cours` });
    }
    const startAt = new Date(req.body.start_at).toISOString();
    // On libère temporairement le créneau actuel pour le calcul des disponibilités
    const ok = tx(() => {
      run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", b.id);
      const free = freeSlots(b.tutor_id, b.duration_min, 30).includes(startAt);
      run("UPDATE bookings SET status = 'confirmed', start_at = ? WHERE id = ?", free ? startAt : b.start_at, b.id);
      return free;
    });
    if (!ok) return res.status(409).json({ error: 'Créneau indisponible' });
    const other = req.user.id === b.tutor_id ? b.student_id : b.tutor_id;
    notify(other, 'Cours déplacé', `Nouveau créneau : ${new Date(startAt).toLocaleString('fr-FR', { timeZone: 'Africa/Douala' })}.`, '#/lessons');
    res.json(get(`${bookingView} WHERE b.id = ?`, b.id));
  } catch (e) { next(e); }
});

r.post('/:id/complete', requireAuth(), (req, res, next) => {
  try {
    const b = loadForUser(req);
    if (Date.now() < Date.parse(b.start_at)) return res.status(400).json({ error: "Le cours n'a pas encore commencé" });
    tx(() => completeBooking(b));
    res.json(get(`${bookingView} WHERE b.id = ?`, b.id));
  } catch (e) { next(e); }
});

// Litige / garantie satisfaction : le paiement reste bloqué jusqu'à arbitrage
r.post('/:id/dispute', requireAuth('student', 'parent'), (req, res, next) => {
  try {
    const b = loadForUser(req);
    if (b.status !== 'confirmed') return res.status(400).json({ error: 'Le paiement a déjà été versé : contactez le support pour ce cours' });
    run("UPDATE bookings SET status = 'disputed', dispute_reason = ? WHERE id = ?", str(req.body.reason, 1000), b.id);
    for (const a of all("SELECT id FROM users WHERE role = 'admin'")) notify(a.id, 'Nouveau litige', `Cours n°${b.id} : ${str(req.body.reason, 140)}`, '#/admin');
    notify(b.tutor_id, 'Réclamation ouverte', "Un élève a ouvert une réclamation sur un cours. L'équipe va l'examiner.", '#/lessons');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

r.post('/:id/review', requireAuth('student', 'parent'), (req, res, next) => {
  try {
    const b = loadForUser(req);
    if (b.status !== 'completed') return res.status(400).json({ error: 'Vous pourrez noter le cours une fois terminé' });
    const rating = Math.round(Number(req.body.rating));
    if (!(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Note entre 1 et 5' });
    run('INSERT OR REPLACE INTO reviews (booking_id, student_id, tutor_id, rating, comment) VALUES (?, ?, ?, ?, ?)', b.id, b.student_id, b.tutor_id, rating, str(req.body.comment, 2000));
    refreshTutorStats(b.tutor_id);
    notify(b.tutor_id, 'Nouvel avis', `Vous avez reçu une note de ${rating}/5.`, `#/tutor/${b.tutor_id}`);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Clôture automatique : les cours terminés depuis plus de 24h sans litige sont payés au tuteur
function autoComplete() {
  const cutoff = Date.now() - 24 * 3600000;
  const due = all("SELECT * FROM bookings WHERE status = 'confirmed'").filter((b) => Date.parse(b.start_at) + b.duration_min * 60000 < cutoff);
  for (const b of due) {
    try { tx(() => completeBooking(b)); } catch (e) { console.error('[autoComplete]', b.id, e.message); }
  }
}

module.exports = { router: r, completeBooking, refundBooking, refreshTutorStats, autoComplete };
