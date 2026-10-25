// Anti-contournement : tant qu'aucun cours n'a été réservé entre deux personnes, les numéros
// de téléphone, e-mails et liens WhatsApp/Telegram sont masqués dans la messagerie.
// Cela protège les élèves (paiement en séquestre, réclamations) et le modèle économique.
const { get } = require('./db');

const MASK = '[coordonnées masquées]';
const PATTERNS = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, // e-mails
  /\b(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|t\.me|telegram\.me|m\.me)\/\S*/gi, // liens messageries
  /(?:\+|00)?\d(?:[\s.\-()/]*\d){7,}/g, // numéros : au moins 8 chiffres, avec ou sans séparateurs
];

function maskContacts(text) {
  let masked = false;
  let out = String(text || '');
  for (const re of PATTERNS) {
    out = out.replace(re, () => { masked = true; return MASK; });
  }
  return { text: out, masked };
}

// Les coordonnées sont autorisées dès qu'un cours (même passé) existe entre les deux personnes
function contactAllowed(a, b) {
  if (get("SELECT 1 FROM users WHERE id IN (?, ?) AND role = 'admin'", a, b)) return true;
  // Un parent est considéré comme l'élève pour les cours de ses enfants
  const asStudent = (u) => `(student_id = ${Number(u)} OR student_id IN (SELECT child_id FROM parent_links WHERE parent_id = ${Number(u)}))`;
  return !!get(`SELECT 1 FROM bookings WHERE status IN ('confirmed','completed','disputed')
    AND ((tutor_id = ? AND ${asStudent(a)}) OR (tutor_id = ? AND ${asStudent(b)})) LIMIT 1`, b, a);
}

module.exports = { maskContacts, contactAllowed, MASK };
