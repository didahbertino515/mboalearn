import { api, t, html, money, SUBJECTS, avatar, fmtDate } from '../core.js';
import { tutorCard, bindFavorites } from '../components.js';

export default async function home(app) {
  const [top, groups] = await Promise.all([api('/tutors?limit=4'), api('/groups')]);
  app.innerHTML = html`
  <section class="hero">
    <div class="container hero-grid">
      <div>
        <span class="eyebrow">🇨🇲 ${t('Fait au Cameroun, pour le Cameroun et la diaspora', 'Made in Cameroon, for Cameroon and the diaspora')}</span>
        <h1>${t('Le bon professeur,', 'The right tutor,')} <span class="hl">${t('au bon prix,', 'at the right price,')}</span> ${t('payé par Mobile Money.', 'paid with Mobile Money.')}</h1>
        <p class="lead">${t("Langues étrangères et nationales, soutien scolaire du CP au Bac et au GCE : des milliers d'heures de cours en ligne dans une classe virtuelle conçue pour la 3G/4G.", 'Foreign and national languages, school tutoring from primary to Bac and GCE, in a virtual classroom built for 3G/4G networks.')}</p>
        <form class="hero-search" data-search>
          <select name="category" aria-label="Catégorie">
            <option value="langue">🌍 ${t('Je veux apprendre une langue', 'I want to learn a language')}</option>
            <option value="scolaire">📚 ${t('Soutien scolaire', 'School tutoring')}</option>
          </select>
          <select name="subject" aria-label="Matière" data-subjects></select>
          <button class="btn accent" type="submit">${t('Trouver mon prof', 'Find my tutor')}</button>
        </form>
        <div class="hero-trust">
          <span>⭐ 4,9/5 ${t('note moyenne', 'average rating')}</span>
          <span>✔ ${t('Tuteurs vérifiés', 'Verified tutors')}</span>
          <span>🔒 ${t('Paiement en séquestre', 'Escrow payment')}</span>
        </div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <div class="mock-class">
          <div class="mock-video big">${avatar('Jean-Paul Mbarga', null, 72)}<span>Jean-Paul · ${t('Maths', 'Maths')}</span></div>
          <div class="mock-video small">${avatar('Kevin Ndongo', null, 40)}</div>
          <div class="mock-board"><svg viewBox="0 0 200 90"><path d="M10 70 Q 50 10 90 50 T 190 30" stroke="#0b7a4b" stroke-width="3" fill="none"/><text x="12" y="20" font-size="13" fill="#334">∫ f(x) dx = F(b) − F(a)</text></svg></div>
          <div class="mock-pay"><span class="op mtn">MoMo</span> ${t('Paiement reçu', 'Payment received')} ✓</div>
        </div>
      </div>
    </div>
  </section>

  <section class="container section">
    <div class="cat-grid">
      ${[
        ['🇬🇧', 'Anglais', 'langue', t('IELTS, TOEFL, business', 'IELTS, TOEFL, business')],
        ['🇫🇷', 'Français', 'langue', 'DELF, DALF, TCF'],
        ['🇩🇪', 'Allemand', 'langue', t('Goethe, Ausbildung', 'Goethe, Ausbildung')],
        ['🇨🇳', 'Chinois', 'langue', 'HSK'],
        ['🥁', 'Duala', 'langue', t('Langues nationales', 'National languages')],
        ['➗', 'Mathématiques', 'scolaire', 'BEPC, Probatoire, Bac'],
        ['🧬', 'Biology', 'scolaire', 'GCE O/A Level'],
        ['💻', 'Informatique', 'scolaire', t('Python, Web, concours', 'Python, web, entrance exams')],
      ].map(([icon, s, c, sub]) => html`<a class="cat card" href="#/search?category=${c}&subject=${encodeURIComponent(s)}"><span class="cat-icon">${icon}</span><b>${s}</b><small class="muted">${sub}</small></a>`)}
    </div>
  </section>

  <section class="container section">
    <div class="section-head"><h2>${t('Nos tuteurs les mieux notés', 'Top-rated tutors')}</h2><a href="#/search">${t('Voir tous les tuteurs', 'See all tutors')} →</a></div>
    <div class="tutor-list">${top.items.map(tutorCard)}</div>
  </section>

  <section class="band">
    <div class="container section">
      <h2 class="center">${t('Comment ça marche ?', 'How does it work?')}</h2>
      <div class="steps">
        ${[
          ['1', t('Trouvez votre tuteur', 'Find your tutor'), t('Filtrez par matière, niveau (BEPC, Bac, GCE…), prix, disponibilité et langue parlée. Regardez les vidéos de présentation.', 'Filter by subject, level, price, availability and spoken language.')],
          ['2', t('Rechargez par Mobile Money', 'Top up with Mobile Money'), t('MTN MoMo, Orange Money ou carte bancaire depuis la diaspora. Votre argent reste bloqué jusqu\'à la fin du cours.', 'MTN MoMo, Orange Money or card. Your money is held in escrow until the lesson ends.')],
          ['3', t('Rejoignez la classe virtuelle', 'Join the virtual classroom'), t('Vidéo HD, tableau blanc partagé, partage d\'écran, documents, notes et mode économie de données.', 'HD video, shared whiteboard, screen sharing, files, notes and data-saver mode.')],
          ['4', t('Progressez et suivez vos résultats', 'Progress and track results'), t('Devoirs, quiz auto-corrigés, vocabulaire en répétition espacée et rapport de progression pour les parents.', 'Homework, auto-graded quizzes, spaced-repetition vocabulary and progress reports for parents.')],
        ].map(([n, h, p]) => html`<div class="step"><span class="step-n">${n}</span><h3>${h}</h3><p class="muted">${p}</p></div>`)}
      </div>
    </div>
  </section>

  <section class="container section">
    <h2 class="center">${t('Plus complet que les plateformes classiques', 'More complete than traditional platforms')}</h2>
    <div class="compare card">
      <table>
        <thead><tr><th></th><th>MboaLearn</th><th>${t('Plateformes internationales', 'International platforms')}</th></tr></thead>
        <tbody>
          ${[
            [t('Paiement MTN MoMo / Orange Money', 'MTN MoMo / Orange Money payment'), '✅', '❌'],
            [t('Prix en FCFA, sans frais de change', 'Prices in FCFA, no FX fees'), '✅', '❌'],
            [t('Commission tuteur', 'Tutor commission'), '12 %', '18 – 33 %'],
            [t("Cours d'essai payé au tuteur", 'Trial lesson paid to tutor'), '✅', '❌'],
            [t('Programmes BEPC, Probatoire, Bac, GCE', 'BEPC, Probatoire, Bac, GCE curricula'), '✅', '❌'],
            [t('Cours collectifs à petit prix', 'Affordable group classes'), '✅', '⚠️'],
            [t('Espace parents & rapports de progression', 'Parent space & progress reports'), '✅', '❌'],
            [t('Devoirs, quiz auto-corrigés, vocabulaire', 'Homework, auto-graded quizzes, vocabulary'), '✅', '⚠️'],
            [t('Mode économie de données (audio seul)', 'Data-saver mode (audio only)'), '✅', '❌'],
            [t('Langues nationales (Duala, Ewondo, Fulfulde…)', 'National languages (Duala, Ewondo, Fulfulde…)'), '✅', '❌'],
            [t('Retrait des gains par Mobile Money', 'Earnings withdrawal via Mobile Money'), t('Instantané', 'Instant'), t('Plusieurs jours', 'Several days')],
          ].map(([a, b, c]) => html`<tr><td>${a}</td><td class="yes">${b}</td><td>${c}</td></tr>`)}
        </tbody>
      </table>
    </div>
  </section>

  ${groups.length ? html`
  <section class="container section">
    <div class="section-head"><h2>${t('Prochains cours collectifs', 'Upcoming group classes')}</h2><a href="#/groups">${t('Tous les cours collectifs', 'All group classes')} →</a></div>
    <div class="grid-3">${groups.slice(0, 3).map((g) => html`
      <a class="card group-card" href="#/groups">
        <span class="badge blue">${g.level || g.subject}</span>
        <h3>${g.title}</h3>
        <p class="small muted">👤 ${g.tutor_name} · 🗓 ${fmtDate(g.start_at)}</p>
        <div class="row between"><b>${g.price ? money(g.price) : t('Gratuit', 'Free')}</b><small class="muted">${g.enrolled}/${g.max_students} ${t('places', 'seats')}</small></div>
      </a>`)}
    </div>
  </section>` : ''}

  <section class="container section">
    <div class="cta-grid">
      <div class="cta card dark">
        <h2>${t('Vous êtes enseignant ?', 'Are you a teacher?')}</h2>
        <p>${t("Fixez vos prix, choisissez vos horaires et recevez vos gains directement sur MTN MoMo ou Orange Money. Seulement 12 % de commission.", 'Set your prices and hours, and receive earnings directly on MTN MoMo or Orange Money. Only 12% commission.')}</p>
        <a class="btn accent" href="#/register?role=tutor">${t('Devenir tuteur', 'Become a tutor')}</a>
      </div>
      <div class="cta card">
        <h2>${t('Parents : suivez la progression de vos enfants', 'Parents: follow your children’s progress')}</h2>
        <p class="muted">${t('Payez les cours de vos enfants, consultez les devoirs, les notes et les rapports de séance.', 'Pay for lessons, check homework, grades and lesson reports.')}</p>
        <a class="btn primary" href="#/register?role=parent">${t('Créer un compte parent', 'Create a parent account')}</a>
      </div>
    </div>
  </section>`;

  const form = app.querySelector('[data-search]');
  const subjSel = app.querySelector('[data-subjects]');
  const fill = () => {
    subjSel.innerHTML = html`<option value="">${t('Toutes les matières', 'All subjects')}</option>${SUBJECTS[form.category.value].map((s) => html`<option>${s}</option>`)}`;
  };
  form.category.onchange = fill;
  fill();
  form.onsubmit = (e) => {
    e.preventDefault();
    location.hash = `#/search?category=${form.category.value}${form.subject.value ? `&subject=${encodeURIComponent(form.subject.value)}` : ''}`;
  };
  bindFavorites(app);
}
