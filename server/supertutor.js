// Badge « Super tuteur » : attribué automatiquement aux tuteurs qui remplissent TOUS les critères,
// réévalué après chaque cours/avis et chaque nuit. Il peut donc être gagné… et perdu.
const { get, all, run } = require('./db');
const { notify } = require('./notify');

const WINDOW_DAYS = 90;

// Seuils (modifiables ici). Gardez la page d'aide (tableau de bord tuteur) cohérente.
const RULES = {
  minRating: 4.8,
  minReviews: 10,
  minLessons: 30,
  minRecentLessons: 10,
  minRetention: 50, // % d'élèves ayant pris au moins 2 cours
  maxCancelRate: 5, // % de cours annulés par le tuteur (90 jours)
  maxResponseHours: 24, // temps de réponse médian aux messages
};

const fr = (n) => String(n).replace('.', ',');
const since = () => new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString();

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Temps (en heures) mis par le tuteur pour répondre au premier message non répondu d'un élève,
// sur les conversations des 90 derniers jours
function responseHours(tutorId) {
  const msgs = all(`SELECT m.conversation_id, m.sender_id, m.created_at FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE (c.a_id = ? OR c.b_id = ?) AND m.created_at >= datetime('now', '-${WINDOW_DAYS} days')
    ORDER BY m.conversation_id, m.id`, tutorId, tutorId);
  const delays = [];
  let waitingSince = null;
  let conv = null;
  for (const m of msgs) {
    if (m.conversation_id !== conv) { conv = m.conversation_id; waitingSince = null; }
    const at = Date.parse(m.created_at.replace(' ', 'T') + 'Z');
    if (m.sender_id !== tutorId) { if (waitingSince === null) waitingSince = at; }
    else if (waitingSince !== null) { delays.push((at - waitingSince) / 3600000); waitingSince = null; }
  }
  // Messages restés sans réponse depuis plus de 24 h : comptés comme un délai long
  if (waitingSince !== null && Date.now() - waitingSince > 86400000) delays.push((Date.now() - waitingSince) / 3600000);
  return median(delays);
}

function evaluate(tutorId) {
  const p = get('SELECT * FROM tutor_profiles WHERE user_id = ?', tutorId);
  if (!p) return null;
  const lessons = get("SELECT COUNT(*) n FROM bookings WHERE tutor_id = ? AND status = 'completed'", tutorId).n;
  const recent = get("SELECT COUNT(*) n FROM bookings WHERE tutor_id = ? AND status = 'completed' AND start_at >= ?", tutorId, since()).n;
  const rv = get('SELECT AVG(rating) avg, COUNT(*) n FROM reviews WHERE tutor_id = ?', tutorId);
  const ret = get(`SELECT COUNT(*) students, SUM(n >= 2) loyal FROM
    (SELECT student_id, COUNT(*) n FROM bookings WHERE tutor_id = ? AND status = 'completed' GROUP BY student_id)`, tutorId);
  const recentAll = get('SELECT COUNT(*) n FROM bookings WHERE tutor_id = ? AND start_at >= ?', tutorId, since()).n;
  const cancelledByTutor = get("SELECT COUNT(*) n FROM bookings WHERE tutor_id = ? AND status = 'cancelled' AND cancelled_by = ? AND start_at >= ?", tutorId, tutorId, since()).n;
  const lostDisputes = get("SELECT COUNT(*) n FROM bookings WHERE tutor_id = ? AND status = 'refunded' AND dispute_reason IS NOT NULL AND start_at >= ?", tutorId, since()).n;
  const resp = responseHours(tutorId);

  const rating = Math.round((rv.avg || 0) * 100) / 100;
  const retention = ret.students ? Math.round((ret.loyal / ret.students) * 100) : 0;
  const cancelRate = recentAll ? Math.round((cancelledByTutor / recentAll) * 1000) / 10 : 0;

  const criteria = [
    { key: 'rating', label: 'Note moyenne', value: rv.n ? `${fr(rating.toFixed(2))} / 5 (${rv.n} avis)` : 'Aucun avis',
      target: `≥ ${fr(RULES.minRating)} sur au moins ${RULES.minReviews} avis`, met: rv.n >= RULES.minReviews && rating >= RULES.minRating,
      progress: Math.min(1, rv.n / RULES.minReviews) * (rating >= RULES.minRating ? 1 : rating / 5) },
    { key: 'lessons', label: 'Cours donnés', value: `${lessons}`, target: `≥ ${RULES.minLessons}`, met: lessons >= RULES.minLessons,
      progress: Math.min(1, lessons / RULES.minLessons) },
    { key: 'activity', label: `Activité (${WINDOW_DAYS} derniers jours)`, value: `${recent} cours`, target: `≥ ${RULES.minRecentLessons} cours`,
      met: recent >= RULES.minRecentLessons, progress: Math.min(1, recent / RULES.minRecentLessons) },
    { key: 'retention', label: 'Fidélisation des élèves', value: ret.students ? `${retention} % (${ret.loyal || 0}/${ret.students})` : 'Aucun élève',
      target: `≥ ${RULES.minRetention} % reviennent pour un 2e cours`, met: ret.students >= 3 && retention >= RULES.minRetention,
      progress: ret.students >= 3 ? Math.min(1, retention / RULES.minRetention) : 0 },
    { key: 'reliability', label: 'Fiabilité', value: `${fr(cancelRate)} % d'annulations${lostDisputes ? `, ${lostDisputes} réclamation(s) perdue(s)` : ''}`,
      target: `≤ ${RULES.maxCancelRate} % d'annulations et aucune réclamation perdue`, met: cancelRate <= RULES.maxCancelRate && lostDisputes === 0,
      progress: cancelRate <= RULES.maxCancelRate && lostDisputes === 0 ? 1 : 0 },
    { key: 'response', label: 'Réactivité aux messages', value: resp === null ? 'Pas encore de message' : resp < 1 ? `${Math.max(1, Math.round(resp * 60))} min (médiane)` : `${Math.round(resp)} h (médiane)`,
      target: `Réponse en moins de ${RULES.maxResponseHours} h`, met: resp === null || resp <= RULES.maxResponseHours,
      progress: resp === null || resp <= RULES.maxResponseHours ? 1 : Math.max(0, RULES.maxResponseHours / resp) },
    { key: 'verified', label: 'Identité vérifiée', value: p.id_verified ? 'Oui' : 'Non', target: "Pièce d'identité validée par l'équipe",
      met: !!p.id_verified, progress: p.id_verified ? 1 : 0 },
  ];
  const eligible = p.status === 'approved' && criteria.every((c) => c.met);
  return { eligible, criteria, window_days: WINDOW_DAYS, is_super: !!p.super_tutor };
}

// Met à jour le badge et prévient le tuteur s'il le gagne ou le perd
function refresh(tutorId) {
  const r = evaluate(tutorId);
  if (!r) return null;
  const now = r.eligible ? 1 : 0;
  if (now !== (r.is_super ? 1 : 0)) {
    run('UPDATE tutor_profiles SET super_tutor = ? WHERE user_id = ?', now, tutorId);
    notify(tutorId, now ? 'Vous êtes Super tuteur ⭐' : 'Badge Super tuteur retiré',
      now ? 'Félicitations ! Le badge apparaît sur votre profil et vous êtes mis en avant dans la recherche.'
        : 'Un ou plusieurs critères ne sont plus remplis. Consultez votre tableau de bord pour le récupérer.', '#/dashboard');
  }
  return { ...r, is_super: !!now };
}

function refreshAll() {
  for (const { user_id: id } of all("SELECT user_id FROM tutor_profiles WHERE status = 'approved'")) refresh(id);
}

module.exports = { RULES, WINDOW_DAYS, evaluate, refresh, refreshAll };
