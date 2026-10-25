// Tâches périodiques : rappels de cours et vérification des paiements restés en attente
const { all, get, run } = require('./db');
const config = require('./config');
const { notify } = require('./notify');
const { sendMail } = require('./mailer');
const pay = require('./payments/service');

const when = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Douala', dateStyle: 'full', timeStyle: 'short' });

// Rappels 24 h et 1 h avant chaque cours (notification + e-mail à l'élève, au tuteur et aux parents)
function lessonReminders() {
  const now = Date.now();
  const rows = all(`SELECT b.*, s.name AS student_name, s.email AS student_email, t.name AS tutor_name, t.email AS tutor_email
    FROM bookings b JOIN users s ON s.id = b.student_id JOIN users t ON t.id = b.tutor_id
    WHERE b.status = 'confirmed' AND b.start_at > ? AND b.start_at < ? AND (b.reminded_24h = 0 OR b.reminded_1h = 0)`,
  new Date(now).toISOString(), new Date(now + 24 * 3600000).toISOString());
  for (const b of rows) {
    const minutesLeft = (Date.parse(b.start_at) - now) / 60000;
    const kind = minutesLeft <= 60 && !b.reminded_1h ? '1h' : !b.reminded_24h && minutesLeft > 60 ? '24h' : null;
    if (!kind) continue;
    run(`UPDATE bookings SET reminded_24h = 1${kind === '1h' ? ', reminded_1h = 1' : ''} WHERE id = ?`, b.id);
    const label = kind === '1h' ? 'dans moins d\'une heure' : `dans ${Math.round(minutesLeft / 60)} heures`;
    const url = `${config.appUrl}/#/lessons`;
    const recipients = [
      { id: b.student_id, name: b.student_name, email: b.student_email, other: b.tutor_name },
      { id: b.tutor_id, name: b.tutor_name, email: b.tutor_email, other: b.student_name },
      ...all('SELECT u.id, u.name, u.email FROM parent_links pl JOIN users u ON u.id = pl.parent_id WHERE pl.child_id = ?', b.student_id)
        .map((p) => ({ ...p, other: `${b.student_name} et ${b.tutor_name}` })),
    ];
    for (const r of recipients) {
      notify(r.id, `Rappel : cours ${label}`, `${b.subject || 'Cours'} avec ${r.other} — ${when(b.start_at)}`, '#/lessons');
      sendMail({
        to: r.email, name: r.name, subject: `Rappel : cours ${label} (${when(b.start_at)})`, title: `Votre cours a lieu ${label}`,
        body: `<p>Bonjour ${r.name.replace(/[<>&]/g, '')},</p><p><b>${(b.subject || 'Cours').replace(/[<>&]/g, '')}</b> avec ${r.other.replace(/[<>&]/g, '')}<br>${when(b.start_at)} (heure de Douala) · ${b.duration_min} min</p><p>La classe virtuelle ouvre 15 minutes avant le début. Pensez à vérifier votre connexion, votre micro et votre caméra.</p>`,
        cta: { url, label: 'Voir mes cours' },
      });
    }
  }
}

// Paiements Mobile Money restés « en attente » (webhook perdu) : on interroge le fournisseur
async function reconcilePayments() {
  const pending = all(`SELECT * FROM transactions WHERE status = 'pending' AND created_at < datetime('now', '-2 minutes')`);
  for (const t of pending) {
    const ageHours = (Date.now() - Date.parse(t.created_at.replace(' ', 'T') + 'Z')) / 3600000;
    if (ageHours > 24) { pay.finalize(t.reference, 'failed'); continue; }
    await pay.refreshStatus(t.reference);
  }
}

function start() {
  const safe = (name, fn) => async () => { try { await fn(); } catch (e) { console.error(`[jobs] ${name}`, e.message); } };
  setInterval(safe('rappels', lessonReminders), 5 * 60 * 1000).unref();
  setInterval(safe('paiements', reconcilePayments), 3 * 60 * 1000).unref();
  setTimeout(safe('rappels', lessonReminders), 15000).unref();
}

module.exports = { start, lessonReminders, reconcilePayments };
