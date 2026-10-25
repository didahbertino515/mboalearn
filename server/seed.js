// Données de démonstration. Mot de passe de tous les comptes : demo1234
const crypto = require('crypto');
const { run, get, tx } = require('./db');
const { hashPassword } = require('./auth');
const { roomId } = require('./util');

const PASSWORD = hashPassword('demo1234');
const code = () => crypto.randomBytes(4).toString('hex').toUpperCase();

function user(role, name, email, extra = {}) {
  const r = run(`INSERT INTO users (role, name, email, password_hash, phone, city, wallet_balance, referral_code, xp, streak_days)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, role, name, email, extra.password || PASSWORD, extra.phone || null, extra.city || 'Yaoundé',
  extra.wallet || 0, code(), extra.xp || 0, extra.streak || 0);
  return Number(r.lastInsertRowid);
}

const TUTORS = [
  { name: 'Brenda Ndip', city: 'Buea', category: 'langue', rate: 6000, trial: 2000, subjects: ['Anglais'], native: 'Anglais', languages: ['Anglais', 'Français', 'Pidgin'], levels: ['Débutant', 'Intermédiaire', 'Avancé'], specialties: ['Anglais des affaires', 'IELTS', 'TOEFL', 'Conversation'], exp: 7, headline: "Anglais des affaires & préparation IELTS/TOEFL", edu: 'Master en Linguistique anglaise — Université de Buea', rating: 4.9, reviews: 128, lessons: 1840, students: 210, superT: 1 },
  { name: 'Jean-Paul Mbarga', city: 'Yaoundé', category: 'scolaire', rate: 5000, trial: 0, subjects: ['Mathématiques', 'Physique-Chimie'], native: 'Français', languages: ['Français', 'Anglais'], levels: ['3ème (BEPC)', 'Première (Probatoire)', 'Terminale (Bac)'], specialties: ['Préparation Bac C & D', 'Probatoire', 'Méthodologie'], exp: 12, headline: 'Professeur certifié de Maths — Préparation Bac C/D et Probatoire', edu: 'DIPES II Mathématiques — ENS Yaoundé', rating: 4.95, reviews: 214, lessons: 3120, students: 340, superT: 1 },
  { name: 'Aïcha Bouba', city: 'Garoua', category: 'langue', rate: 4000, trial: 1500, subjects: ['Arabe', 'Fulfulde', 'Français'], native: 'Fulfulde', languages: ['Fulfulde', 'Arabe', 'Français'], levels: ['Débutant', 'Intermédiaire'], specialties: ['Arabe littéraire', 'Lecture du Coran', 'Fulfulde pour débutants'], exp: 5, headline: 'Arabe et Fulfulde pour enfants et adultes', edu: 'Licence en Lettres arabes — Université de Ngaoundéré', rating: 4.8, reviews: 56, lessons: 610, students: 74 },
  { name: 'Samuel Ekwalla', city: 'Douala', category: 'langue', rate: 3500, trial: 1000, subjects: ['Duala', 'Français'], native: 'Duala', languages: ['Duala', 'Français', 'Anglais'], levels: ['Débutant', 'Intermédiaire', 'Avancé'], specialties: ['Langues maternelles', 'Culture Sawa', 'Enfants de la diaspora'], exp: 9, headline: 'Transmettez le Duala à vos enfants, même depuis la diaspora', edu: 'Licence en Langues et cultures camerounaises', rating: 4.85, reviews: 73, lessons: 920, students: 95 },
  { name: 'Grace Fon', city: 'Bamenda', category: 'scolaire', rate: 5500, trial: 2000, subjects: ['Biology', 'Chemistry', 'SVT'], native: 'Anglais', languages: ['Anglais', 'Français', 'Pidgin'], levels: ['GCE O Level', 'GCE A Level', 'Terminale (Bac)'], specialties: ['GCE A Level Biology', 'Médecine concours', 'Bilingue'], exp: 8, headline: 'GCE O/A Level Biology & Chemistry — bilingual tutor', edu: 'BSc Biochemistry — University of Bamenda', rating: 4.9, reviews: 91, lessons: 1150, students: 130, superT: 1 },
  { name: 'Lucas Fernández', city: 'Douala', category: 'langue', rate: 7000, trial: 2500, subjects: ['Espagnol'], native: 'Espagnol', languages: ['Espagnol', 'Français', 'Anglais'], levels: ['Débutant', 'Intermédiaire', 'Avancé'], specialties: ['DELE', 'Conversation', 'Espagnol pour le Bac'], exp: 6, headline: 'Professeur natif — Espagnol pour le Bac et le DELE', edu: 'Grado en Filología Hispánica — Universidad de Sevilla', rating: 4.7, reviews: 44, lessons: 480, students: 61 },
  { name: 'Mireille Tchoupo', city: 'Bafoussam', category: 'both', rate: 4500, trial: 1500, subjects: ['Français', 'Philosophie', 'Allemand'], native: 'Français', languages: ['Français', 'Allemand', 'Ghomala'], levels: ['Seconde', 'Première (Probatoire)', 'Terminale (Bac)', 'Intermédiaire'], specialties: ['Dissertation', 'Commentaire composé', 'Goethe-Zertifikat'], exp: 10, headline: 'Français, Philo & Allemand — réussir la dissertation', edu: 'Master Lettres modernes — Université de Dschang', rating: 4.8, reviews: 102, lessons: 1300, students: 150 },
  { name: 'Wei Zhang', city: 'Yaoundé', category: 'langue', rate: 8000, trial: 3000, subjects: ['Chinois'], native: 'Chinois', languages: ['Chinois', 'Français', 'Anglais'], levels: ['Débutant', 'Intermédiaire'], specialties: ['HSK 1-4', 'Chinois des affaires'], exp: 4, headline: 'Chinois mandarin — préparation HSK (Institut Confucius)', edu: 'Licence en enseignement du chinois langue étrangère', rating: 4.75, reviews: 29, lessons: 300, students: 40 },
  { name: 'Patrick Essomba', city: 'Yaoundé', category: 'scolaire', rate: 6500, trial: 2000, subjects: ['Informatique', 'Mathématiques'], native: 'Français', languages: ['Français', 'Anglais'], levels: ['Terminale (Bac)', 'Université', 'Professionnel'], specialties: ['Python', 'Développement web', 'Algorithmique', 'Concours Polytechnique'], exp: 6, headline: 'Informatique & Maths — Python, Web, Concours Polytechnique', edu: 'Ingénieur — École Nationale Supérieure Polytechnique de Yaoundé', rating: 4.9, reviews: 67, lessons: 700, students: 88 },
  { name: 'Clarisse Ngo Bassa', city: 'Edéa', category: 'scolaire', rate: 3000, trial: 0, subjects: ['Primaire (toutes matières)', 'Français', 'Mathématiques'], native: 'Bassa', languages: ['Français', 'Bassa'], levels: ['SIL - CP', 'CE1 - CE2', 'CM1 - CM2 (CEP / Concours 6ème)'], specialties: ['Lecture', 'Concours d\'entrée en 6ème', 'Enfants en difficulté'], exp: 15, headline: 'Institutrice — soutien primaire et concours d\'entrée en 6ème', edu: 'CAPIEMP — ENIEG Edéa', rating: 5.0, reviews: 88, lessons: 2100, students: 120, superT: 1 },
  { name: 'Emmanuel Abena', city: 'Yaoundé', category: 'langue', rate: 3000, trial: 1000, subjects: ['Ewondo', 'Français'], native: 'Ewondo', languages: ['Ewondo', 'Français'], levels: ['Débutant', 'Intermédiaire'], specialties: ['Langues nationales', 'Contes et proverbes'], exp: 3, headline: 'Apprenez l\'Ewondo par les contes et la conversation', edu: 'Licence en Linguistique — Université de Yaoundé I', rating: 4.6, reviews: 18, lessons: 150, students: 25 },
  { name: 'Sophie Müller', city: 'Douala', category: 'langue', rate: 7500, trial: 2500, subjects: ['Allemand'], native: 'Allemand', languages: ['Allemand', 'Français', 'Anglais'], levels: ['Débutant', 'Intermédiaire', 'Avancé'], specialties: ['Goethe A1-B2', 'Visa études Allemagne', 'Ausbildung'], exp: 8, headline: 'Allemand pour les études et l\'Ausbildung en Allemagne', edu: 'Staatsexamen Deutsch als Fremdsprache', rating: 4.85, reviews: 76, lessons: 990, students: 105 },
];

const COMMENTS = [
  'Excellente pédagogie, très patient et clair.', 'Mon fils a eu 16/20 au Probatoire grâce à ces cours !',
  'Cours très bien structurés, je progresse chaque semaine.', 'Très ponctuel, la classe virtuelle fonctionne bien même en 3G.',
  'Je recommande vivement, super ambiance.', 'Great tutor, very professional and friendly.',
  'Ma fille a enfin compris les fractions, merci !', 'Explications claires et beaucoup d\'exercices corrigés.',
  'Toujours à l\'heure et bien préparé.', 'Les quiz entre les cours m\'aident énormément.',
  'Très bon tuteur, un peu rapide parfois mais efficace.', 'I passed my IELTS with band 7. Thank you!',
  'Patient avec les débutants, je recommande.', 'Bonne méthode pour la dissertation.',
];
const DEMO_LEARNERS = ['Arnaud Fotso', 'Sandrine Mvondo', 'Ibrahim Moussa', 'Christelle Ebah', 'Paul Nkeng', 'Aïssatou Hamadou'];

tx(() => {
  // En ligne, le mot de passe admin doit venir de ADMIN_PASSWORD (jamais le mot de passe de démo)
  user('admin', 'Administrateur MboaLearn', process.env.ADMIN_EMAIL || 'admin@mboalearn.cm', {
    city: 'Yaoundé', password: process.env.ADMIN_PASSWORD ? hashPassword(process.env.ADMIN_PASSWORD) : null,
  });
  const studentId = user('student', 'Kevin Ndongo', 'eleve@mboalearn.cm', { phone: '237677123456', wallet: 25000, xp: 640, streak: 5 });
  const student2 = user('student', 'Laure Atangana', 'laure@mboalearn.cm', { phone: '237699554433', wallet: 10000, xp: 220 });
  const parentId = user('parent', 'Marie Ndongo', 'parent@mboalearn.cm', { phone: '237655001122', wallet: 40000 });
  run('INSERT INTO parent_links (parent_id, child_id) VALUES (?, ?)', parentId, studentId);

  const tutorIds = TUTORS.map((t, i) => {
    const id = user('tutor', t.name, i === 1 ? 'tuteur@mboalearn.cm' : `tuteur${i + 1}@mboalearn.cm`, { city: t.city, phone: '237670000' + String(100 + i), wallet: i === 1 ? 85000 : 0 });
    run(`INSERT INTO tutor_profiles (user_id, headline, bio, hourly_rate, trial_rate, category, subjects, languages, levels, specialties,
      native_language, experience_years, education, status, rating, reviews_count, lessons_count, students_count, super_tutor,
      payout_phone, payout_operator, video_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, 'mtn', ?)`,
    id, t.headline,
    `Bonjour, je suis ${t.name.split(' ')[0]} ! ${t.headline}.\n\nAvec ${t.exp} ans d'expérience, j'adapte chaque cours à vos objectifs : examens officiels, progression scolaire, voyage ou carrière. Mes cours sont interactifs : tableau blanc, exercices corrigés en direct, devoirs et quiz entre les séances.\n\nRéservez un cours d'essai pour faire connaissance et établir ensemble votre plan de progression.`,
    t.rate, t.trial, t.category, JSON.stringify(t.subjects), JSON.stringify(t.languages), JSON.stringify(t.levels), JSON.stringify(t.specialties),
    t.native, t.exp, t.edu, t.rating, t.reviews, t.lessons, t.students, t.superT || 0, '237670000' + String(100 + i), '');
    // Disponibilités : lundi-vendredi 16h-21h, samedi 8h-14h (heure de Douala)
    for (let d = 1; d <= 5; d++) run('INSERT INTO availability (tutor_id, weekday, start_min, end_min) VALUES (?, ?, ?, ?)', id, d, 16 * 60 + (i % 3) * 30, 21 * 60);
    run('INSERT INTO availability (tutor_id, weekday, start_min, end_min) VALUES (?, 6, ?, ?)', id, 8 * 60, 14 * 60);
    if (i % 2 === 0) run('INSERT INTO availability (tutor_id, weekday, start_min, end_min) VALUES (?, 0, ?, ?)', id, 15 * 60, 19 * 60);
    return id;
  });

  // Un tuteur en attente de validation (pour la démo admin)
  const pending = user('tutor', 'Rodrigue Kamga', 'nouveau@mboalearn.cm', { city: 'Douala' });
  run(`INSERT INTO tutor_profiles (user_id, headline, hourly_rate, trial_rate, category, subjects, levels, education, status)
    VALUES (?, 'Professeur de Physique — Bac C, D, E', 5000, 1500, 'scolaire', '["Physique-Chimie"]', '["Terminale (Bac)"]', 'DIPES I Physique', 'pending')`, pending);

  // Historique de cours pour l'élève de démo
  const mathTutor = tutorIds[1];
  const engTutor = tutorIds[0];
  const day = 86400000;
  const hourAt = (offsetDays, h) => { const d = new Date(Date.now() + offsetDays * day); d.setUTCHours(h - 1, 0, 0, 0); return d.toISOString(); };
  const past = [[-21, 17, mathTutor, 'Mathématiques'], [-14, 17, mathTutor, 'Mathématiques'], [-12, 18, engTutor, 'Anglais'], [-7, 17, mathTutor, 'Mathématiques'], [-5, 18, engTutor, 'Anglais']];
  for (const [o, h, t, subj] of past) {
    const id = Number(run(`INSERT INTO bookings (student_id, tutor_id, subject, start_at, duration_min, type, price, status, room_id, completed_at)
      VALUES (?, ?, ?, ?, 60, 'regular', ?, 'completed', ?, datetime('now', ?))`, studentId, t, subj, hourAt(o, h), t === mathTutor ? 5000 : 6000, roomId(), `${o} days`).lastInsertRowid);
    run('INSERT INTO reviews (booking_id, student_id, tutor_id, rating, comment, created_at) VALUES (?, ?, ?, 5, ?, datetime(\'now\', ?))', id, studentId, t, COMMENTS[id % COMMENTS.length], `${o} days`);
  }
  // Historique réaliste : chaque tuteur a donné entre 6 et 20 cours notés à des élèves de démo.
  // Les compteurs (note, avis, cours, élèves) sont ensuite recalculés à partir de ces données.
  const learners = [student2, ...DEMO_LEARNERS.map((n, k) => user('student', n, `apprenant${k + 1}@mboalearn.cm`, { city: ['Douala', 'Yaoundé', 'Garoua', 'Buea', 'Bafoussam', 'Maroua'][k] }))];
  tutorIds.forEach((t, i) => {
    const n = 6 + ((i * 7) % 15);
    for (let k = 0; k < n; k++) {
      const learner = learners[(i + k) % learners.length];
      const subject = TUTORS[i].subjects[k % TUTORS[i].subjects.length];
      const id = Number(run(`INSERT INTO bookings (student_id, tutor_id, subject, start_at, duration_min, price, status, room_id, completed_at)
        VALUES (?, ?, ?, ?, 60, ?, 'completed', ?, datetime('now', ?))`, learner, t, subject, hourAt(-10 - k * 4 - (i % 3), 17), TUTORS[i].rate, roomId(), `${-10 - k * 4} days`).lastInsertRowid);
      // Environ 2 cours sur 3 donnent lieu à un avis, majoritairement 5 étoiles
      if (k % 3 !== 2) {
        run(`INSERT INTO reviews (booking_id, student_id, tutor_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
          id, learner, t, (i + k) % 7 === 0 ? 4 : 5, COMMENTS[(i * 3 + k) % COMMENTS.length], `${-10 - k * 4} days`);
      }
    }
  });

  // Cours à venir : un dans quelques minutes (pour tester la classe virtuelle) et un dans 2 jours
  const soon = new Date(Date.now() + 5 * 60000); soon.setUTCSeconds(0, 0);
  run(`INSERT INTO bookings (student_id, tutor_id, subject, start_at, duration_min, price, status, room_id) VALUES (?, ?, 'Mathématiques', ?, 60, 5000, 'confirmed', 'demo-classe')`, studentId, mathTutor, soon.toISOString());
  run(`INSERT INTO bookings (student_id, tutor_id, subject, start_at, duration_min, price, status, room_id) VALUES (?, ?, 'Anglais', ?, 60, 6000, 'confirmed', ?)`, studentId, engTutor, hourAt(2, 18), roomId());
  run('UPDATE users SET held_balance = 11000 WHERE id = ?', studentId);
  run('INSERT INTO packages (student_id, tutor_id, lessons_total, lessons_left, price_per_lesson, subject) VALUES (?, ?, 10, 6, 4750, ?)', studentId, mathTutor, 'Mathématiques');

  // Transactions
  const txs = [
    [studentId, 'deposit', 30000, 'mtn', 'Recharge via MTN Mobile Money', -20],
    [studentId, 'payment', -5000, null, 'Cours avec Jean-Paul Mbarga', -21],
    [parentId, 'deposit', 50000, 'orange', 'Recharge via Orange Money', -15],
    [mathTutor, 'earning', 4400, null, 'Cours du ' + hourAt(-7, 17).slice(0, 10), -7],
    [mathTutor, 'withdrawal', 20000, 'mtn', 'Retrait vers MTN MoMo 237670000101', -3],
  ];
  for (const [u, type, amount, op, desc, days] of txs) {
    run(`INSERT INTO transactions (user_id, type, amount, status, provider, reference, operator, description, meta, created_at)
      VALUES (?, ?, ?, 'success', 'simulator', ?, ?, ?, ?, datetime('now', ?))`, u, type, amount, `SEED-${code()}`, op, desc,
    type === 'earning' ? JSON.stringify({ gross: 5000, commission: 600 }) : null, `${days} days`);
  }

  // Cours collectifs
  const groups = [
    [mathTutor, 'Marathon Bac D : fonctions et intégrales', 'Mathématiques', 'Terminale (Bac)', 3, 18, 120, 25, 2500],
    [tutorIds[4], 'GCE A Level Biology — Genetics crash course', 'Biology', 'GCE A Level', 4, 17, 90, 20, 2000],
    [engTutor, "Club de conversation anglaise (B1-B2)", 'Anglais', 'Intermédiaire', 1, 19, 60, 8, 1500],
    [tutorIds[9], "Concours d'entrée en 6ème : révision générale", 'Primaire (toutes matières)', 'CM1 - CM2 (CEP / Concours 6ème)', 5, 9, 120, 15, 1500],
    [tutorIds[6], 'Méthode de la dissertation philosophique', 'Philosophie', 'Terminale (Bac)', 6, 16, 90, 20, 2000],
  ];
  for (const [t, title, subject, level, d, h, dur, max, price] of groups) {
    run(`INSERT INTO group_classes (tutor_id, title, subject, level, description, start_at, duration_min, max_students, price, room_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, t, title, subject, level,
    'Séance en direct dans la classe virtuelle : cours, exercices corrigés au tableau blanc et questions/réponses. Support PDF partagé pendant la séance.',
    hourAt(d, h), dur, max, price, roomId());
  }

  // Devoirs
  run(`INSERT INTO homework (tutor_id, student_id, title, instructions, quiz, due_at) VALUES (?, ?, ?, ?, ?, ?)`, mathTutor, studentId,
    'Quiz : dérivées usuelles', '',
    JSON.stringify([
      { question: 'Dérivée de f(x) = x³ ?', choices: ['3x²', 'x²', '3x', 'x³/3'], answer: 0 },
      { question: 'Dérivée de f(x) = ln(x) ?', choices: ['x', '1/x', 'eˣ', 'ln(x)/x'], answer: 1 },
      { question: 'Dérivée de f(x) = eˣ ?', choices: ['xeˣ⁻¹', 'eˣ', '1', '0'], answer: 1 },
      { question: 'Dérivée de f(x) = sin(x) ?', choices: ['-sin(x)', 'cos(x)', '-cos(x)', 'tan(x)'], answer: 1 },
    ]), new Date(Date.now() + 3 * day).toISOString());
  run(`INSERT INTO homework (tutor_id, student_id, title, instructions, due_at) VALUES (?, ?, ?, ?, ?)`, engTutor, studentId,
    'Writing: My dream job', 'Write 150 words about your dream job. Use at least 3 conditional sentences (If I were…).', new Date(Date.now() + 5 * day).toISOString());
  run(`INSERT INTO homework (tutor_id, student_id, title, instructions, status, answer, score, feedback) VALUES (?, ?, ?, ?, 'graded', ?, 85, ?)`, mathTutor, studentId,
    'Exercice : suites arithmétiques', 'Exercice 3 page 112 du manuel.', 'u_n = 3 + 2n ; S = 120…', 'Très bon travail. Attention à la rédaction de la récurrence.');

  for (const [w, tr, ex] of [['nevertheless', 'néanmoins', 'Nevertheless, she passed the exam.'], ['to achieve', 'atteindre / réussir', 'He achieved his goals.'], ['meanwhile', 'pendant ce temps', ''], ['reliable', 'fiable', 'A reliable tutor.']]) {
    run('INSERT INTO vocab (student_id, word, translation, example) VALUES (?, ?, ?, ?)', studentId, w, tr, ex);
  }

  // Conversation de démonstration
  const [a, b] = studentId < mathTutor ? [studentId, mathTutor] : [mathTutor, studentId];
  const conv = Number(run('INSERT INTO conversations (a_id, b_id) VALUES (?, ?)', a, b).lastInsertRowid);
  run('INSERT INTO messages (conversation_id, sender_id, body, read_at) VALUES (?, ?, ?, datetime(\'now\'))', conv, studentId, 'Bonjour Monsieur, pouvons-nous revoir les intégrales au prochain cours ?');
  run('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)', conv, mathTutor, 'Bonjour Kevin, bien sûr ! Préparez les exercices 4 et 5, on les corrigera ensemble au tableau.');

  // Badges de vérification pour les profils de démonstration les plus complets
  tutorIds.forEach((t, i) => { if (TUTORS[i].superT || i % 3 === 0) run('UPDATE tutor_profiles SET id_verified = 1, diploma_verified = ? WHERE user_id = ?', TUTORS[i].superT ? 1 : 0, t); });

  run("INSERT INTO notifications (user_id, title, body, link) VALUES (?, 'Bienvenue sur MboaLearn 👋', 'Votre cours de Mathématiques commence bientôt. Testez la classe virtuelle !', '#/lessons')", studentId);
});

// Statistiques des tuteurs cohérentes avec les cours et avis réellement présents
const { refreshTutorStats } = require('./routes/bookings');
for (const { user_id: id } of require('./db').all('SELECT user_id FROM tutor_profiles')) refreshTutorStats(id);

console.log(`Données de démonstration créées. Comptes (mot de passe demo1234) : eleve@, tuteur@, parent@mboalearn.cm — admin : ${process.env.ADMIN_PASSWORD ? process.env.ADMIN_EMAIL || 'admin@mboalearn.cm' : 'admin@mboalearn.cm (demo1234)'}`);
module.exports = {};
