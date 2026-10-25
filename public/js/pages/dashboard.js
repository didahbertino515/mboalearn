import { state, api, t, html, avatar, money, fmtDate, fromNow, onSubmit, toast, loadMe } from '../core.js';
import { canJoin, statusBadge, emptyState, tutorCard, bindFavorites } from '../components.js';
import { openDeposit } from '../payflow.js';

export function lessonRow(b, opts = {}) {
  const me = state.user;
  const other = me.role === 'tutor' ? [b.student_name, b.student_avatar] : [b.tutor_name, b.tutor_avatar];
  return html`
  <div class="lesson-row">
    ${avatar(other[0], other[1], 44)}
    <div class="grow">
      <b>${b.subject || t('Cours', 'Lesson')}${b.type === 'trial' ? html` <span class="badge amber">${t('Essai', 'Trial')}</span>` : ''}</b> · ${other[0]}
      <div class="small muted">🗓 ${fmtDate(b.start_at, { dateStyle: 'full', timeStyle: 'short' })} · ${b.duration_min} min${b.status === 'confirmed' ? ` · ${fromNow(b.start_at)}` : ''}</div>
    </div>
    ${statusBadge(b.status)}
    ${canJoin(b) ? html`<a class="btn accent sm pulse" href="#/classroom/${b.room_id}">🎥 ${t('Rejoindre', 'Join')}</a>` : ''}
    ${opts.actions ? opts.actions(b) : ''}
  </div>`;
}

export default async function dashboard(app) {
  await loadMe();
  const u = state.user;
  if (u.role === 'admin') { location.hash = '#/admin'; return; }
  if (u.role === 'tutor') return tutorDash(app, u);
  if (u.role === 'parent') return parentDash(app, u);
  return studentDash(app, u);
}

async function studentDash(app, u) {
  const [lessons, hw, vocab, progress, favs] = await Promise.all([
    api('/bookings'), api('/learning/homework'), api('/learning/vocab'), api(`/learning/progress/${u.id}`), api('/tutors/favorites'),
  ]);
  const upcoming = lessons.filter((b) => b.status === 'confirmed').sort((a, b) => a.start_at.localeCompare(b.start_at));
  const next = upcoming[0];
  const todo = hw.filter((h) => h.status === 'assigned');
  const xpInLevel = u.xp - (progress.level - 1) ** 2 * 100;
  const xpNeed = progress.level ** 2 * 100 - (progress.level - 1) ** 2 * 100;
  app.innerHTML = html`
  <div class="container page">
    <div class="dash-head">
      <div><h1>${t('Bonjour', 'Hello')} ${u.name.split(' ')[0]} 👋</h1><p class="muted">${t('Prêt pour votre prochaine séance ?', 'Ready for your next lesson?')}</p></div>
      <div class="gamify">
        <div class="streak" title="${t('Jours consécutifs', 'Day streak')}">🔥 <b>${u.streak_days}</b> ${u.streak_days > 1 ? t('jours', 'days') : t('jour', 'day')}</div>
        <div class="level"><span>${t('Niveau', 'Level')} ${progress.level}</span><div class="bar"><i style="width:${Math.min(100, Math.round((xpInLevel / xpNeed) * 100))}%"></i></div><small>${u.xp} XP</small></div>
      </div>
    </div>
    <div class="dash-grid">
      <section class="card next-lesson ${next ? '' : 'empty-card'}">
        <h3>${t('Prochain cours', 'Next lesson')}</h3>
        ${next ? html`${lessonRow(next)}
          <p class="small muted">${t('La classe virtuelle ouvre 15 minutes avant le début du cours.', 'The classroom opens 15 minutes before the lesson.')}</p>`
        : html`<p class="muted">${t('Aucun cours programmé.', 'No lesson scheduled.')}</p><a class="btn primary" href="#/search">${t('Trouver un tuteur', 'Find a tutor')}</a>`}
      </section>
      <section class="card wallet-mini">
        <h3>💰 ${t('Portefeuille', 'Wallet')}</h3>
        <div class="big-num">${money(u.wallet_balance)}</div>
        <small class="muted">${money(u.held_balance)} ${t('en séquestre pour vos cours à venir', 'held for upcoming lessons')}</small>
        <button class="btn primary block" data-topup>${t('Recharger', 'Top up')} (MoMo / OM)</button>
      </section>
      <section class="card">
        <h3>📊 ${t('Mes statistiques', 'My stats')}</h3>
        <div class="mini-stats">
          <div><b>${progress.lessons.total}</b><small>${t('cours suivis', 'lessons')}</small></div>
          <div><b>${Math.round(progress.lessons.minutes / 60)} h</b><small>${t("d'apprentissage", 'learning')}</small></div>
          <div><b>${progress.homework.avg_score ?? '—'}${progress.homework.avg_score != null ? '%' : ''}</b><small>${t('moyenne devoirs', 'homework avg')}</small></div>
          <div><b>${progress.vocab.mastered || 0}/${progress.vocab.total}</b><small>${t('mots maîtrisés', 'words mastered')}</small></div>
        </div>
        <a href="#/progress/${u.id}">${t('Voir ma progression détaillée', 'See detailed progress')} →</a>
      </section>
    </div>
    <div class="dash-grid two">
      <section class="card">
        <div class="section-head"><h3>📅 ${t('Cours à venir', 'Upcoming lessons')}</h3><a href="#/lessons">${t('Tout voir', 'See all')}</a></div>
        ${upcoming.length ? upcoming.slice(0, 5).map((b) => lessonRow(b)) : html`<p class="muted">${t('Rien de prévu.', 'Nothing planned.')}</p>`}
      </section>
      <section class="card">
        <div class="section-head"><h3>📝 ${t('Devoirs à rendre', 'Homework due')}</h3><a href="#/homework">${t('Tout voir', 'See all')}</a></div>
        ${todo.length ? todo.map((h) => html`<a class="line row between" href="#/homework"><span><b>${h.title}</b><br><small class="muted">${h.tutor_name}${h.due_at ? ` · ${t('pour', 'due')} ${fmtDate(h.due_at, { dateStyle: 'medium' })}` : ''}</small></span>${h.quiz ? html`<span class="badge blue">Quiz</span>` : ''}</a>`)
        : html`<p class="muted">${t('Tout est à jour 🎉', 'All caught up 🎉')}</p>`}
        <div class="vocab-cta"><span>🧠 <b>${vocab.due.length}</b> ${t('mots à réviser aujourd\'hui', 'words to review today')}</span><a class="btn ghost sm" href="#/vocab">${t('Réviser', 'Review')}</a></div>
      </section>
    </div>
    ${favs.length ? html`<section class="section"><h2>♥ ${t('Mes tuteurs favoris', 'My favourite tutors')}</h2><div class="tutor-list">${favs.map(tutorCard)}</div></section>` : ''}
    <section class="card referral">
      <div><h3>🎁 ${t('Parrainez vos amis', 'Refer your friends')}</h3><p class="muted">${t('Gagnez 1 000 FCFA dès la première recharge de chaque filleul.', 'Earn 1,000 FCFA on each friend’s first top-up.')}</p></div>
      <div class="ref-code"><code>${u.referral_code}</code><button class="btn ghost sm" data-copy>${t('Copier le lien', 'Copy link')}</button></div>
    </section>
  </div>`;
  bindFavorites(app);
  app.querySelector('[data-topup]').onclick = async () => { if (await openDeposit()) dashboard(app); };
  app.querySelector('[data-copy]').onclick = () => {
    navigator.clipboard?.writeText(`${location.origin}/#/register?ref=${u.referral_code}`);
    toast(t('Lien copié !', 'Link copied!'), 'success');
  };
}

const CRITERIA_LABEL = () => ({
  rating: t('Note moyenne', 'Average rating'), lessons: t('Cours donnés', 'Lessons taught'), activity: t('Activité (90 derniers jours)', 'Activity (last 90 days)'),
  retention: t('Fidélisation des élèves', 'Student retention'), reliability: t('Fiabilité', 'Reliability'), response: t('Réactivité aux messages', 'Message responsiveness'),
  verified: t('Identité vérifiée', 'Verified identity'),
});
const CRITERIA_TIP = () => ({
  rating: t('Demandez à vos élèves de laisser un avis après le cours.', 'Ask students to leave a review after class.'),
  lessons: t('Ouvrez plus de créneaux et proposez un cours d\'essai attractif.', 'Open more slots and offer an attractive trial.'),
  activity: t('Gardez des disponibilités chaque semaine.', 'Keep weekly availability.'),
  retention: t('Proposez un plan de progression et des forfaits dès le cours d\'essai.', 'Offer a learning plan and packages from the trial.'),
  reliability: t('Évitez d\'annuler : déplacez plutôt le cours plus de 12 h à l\'avance.', 'Avoid cancelling: reschedule instead.'),
  response: t('Activez les notifications et répondez dans la journée.', 'Turn on notifications and reply within a day.'),
  verified: t('Envoyez votre pièce d\'identité dans Paramètres → Vérification.', 'Upload your ID in Settings → Verification.'),
});

// Carte « Badge Super tuteur » : critères, valeur actuelle et progression
function superCard(sp) {
  if (!sp) return '';
  const done = sp.criteria.filter((c) => c.met).length;
  const labels = CRITERIA_LABEL();
  const tips = CRITERIA_TIP();
  return html`
  <section class="card super-card ${sp.is_super ? 'is-super' : ''}">
    <div class="section-head">
      <h3>⭐ ${sp.is_super ? t('Vous êtes Super tuteur !', 'You are a Super tutor!') : t('Devenir Super tuteur', 'Become a Super tutor')}</h3>
      <span class="badge ${sp.is_super ? 'super' : 'grey'}">${done}/${sp.criteria.length} ${t('critères', 'criteria')}</span>
    </div>
    <p class="small muted">${sp.is_super
      ? t('Le badge apparaît sur votre profil et vous place en tête des résultats de recherche. Il est réévalué chaque jour : gardez tous les critères au vert pour le conserver.', 'The badge is shown on your profile and boosts you in search. It is re-evaluated daily.')
      : t('Remplissez tous les critères ci-dessous pour obtenir automatiquement le badge : il vous met en avant dans la recherche et rassure les parents.', 'Meet all the criteria below to automatically earn the badge.')}</p>
    <div class="criteria">
      ${sp.criteria.map((c) => html`
        <div class="criterion ${c.met ? 'ok' : ''}">
          <span class="crit-icon">${c.met ? '✔' : '○'}</span>
          <div class="grow">
            <div class="row between wrap"><b>${labels[c.key] || c.label}</b><span class="small">${c.value}</span></div>
            <div class="bar"><i style="width:${Math.round(c.progress * 100)}%"></i></div>
            <small class="muted">${t('Objectif', 'Target')} : ${c.target}${c.met ? '' : html` — ${tips[c.key] || ''}`}</small>
          </div>
        </div>`)}
    </div>
  </section>`;
}

async function tutorDash(app, u) {
  const [lessons, wallet, groups, superP] = await Promise.all([api('/bookings'), api('/payments/wallet'), api('/groups/mine'), api('/tutors/me/super-progress')]);
  const p = u.profile || {};
  const upcoming = lessons.filter((b) => b.status === 'confirmed').sort((a, b) => a.start_at.localeCompare(b.start_at));
  const students = [...new Map(lessons.map((b) => [b.student_id, b])).values()];
  const months = {};
  for (const tx of wallet.transactions.filter((x) => x.type === 'earning')) {
    const k = tx.created_at.slice(0, 7);
    months[k] = (months[k] || 0) + tx.amount;
  }
  const monthKeys = Object.keys(months).sort().slice(-6);
  const maxM = Math.max(1, ...monthKeys.map((k) => months[k]));
  app.innerHTML = html`
  <div class="container page">
    <div class="dash-head"><div><h1>${t('Espace tuteur', 'Tutor space')}</h1><p class="muted">${u.name}</p></div>
      <div class="row gap"><a class="btn ghost" href="#/tutor/${u.id}">👁 ${t('Voir mon profil public', 'View public profile')}</a><a class="btn primary" href="#/settings">✏️ ${t('Modifier profil & horaires', 'Edit profile & hours')}</a></div></div>
    ${p.status === 'pending' ? html`<div class="notice warn">⏳ ${t("Votre profil est en cours de vérification. Complétez votre profil, votre vidéo et vos disponibilités pour accélérer la validation.", 'Your profile is under review. Complete it to speed up approval.')}</div>` : ''}
    ${p.status === 'rejected' ? html`<div class="notice err">${t('Votre profil a été refusé. Mettez-le à jour puis contactez le support.', 'Your profile was rejected.')}</div>` : ''}
    <div class="kpis">
      <div class="card kpi"><small>${t('Solde disponible', 'Available balance')}</small><b>${money(wallet.wallet_balance)}</b><a href="#/wallet">${t('Retirer vers MoMo/OM', 'Withdraw to MoMo/OM')} →</a></div>
      <div class="card kpi"><small>${t('Gains ce mois-ci', 'Earnings this month')}</small><b>${money(wallet.earned_month)}</b><span class="muted small">${t('Total', 'Total')} : ${money(wallet.earned)}</span></div>
      <div class="card kpi"><small>${t('Cours à venir', 'Upcoming lessons')}</small><b>${upcoming.length}</b><span class="muted small">${students.length} ${t('élèves', 'students')}</span></div>
      <div class="card kpi"><small>${t('Note moyenne', 'Average rating')}</small><b>${p.rating ? `${p.rating} ★` : '—'}</b><span class="muted small">${p.reviews_count || 0} ${t('avis', 'reviews')}</span></div>
    </div>
    ${superCard(superP)}
    <div class="dash-grid two">
      <section class="card">
        <div class="section-head"><h3>📅 ${t('Prochains cours', 'Next lessons')}</h3><a href="#/lessons">${t('Calendrier', 'Calendar')}</a></div>
        ${upcoming.length ? upcoming.slice(0, 6).map((b) => lessonRow(b)) : emptyState('📭', t('Aucun cours réservé', 'No bookings'), t('Ajoutez des disponibilités et une vidéo pour attirer des élèves.', 'Add availability and a video to attract students.'))}
      </section>
      <section class="card">
        <h3>📈 ${t('Gains des derniers mois', 'Recent earnings')}</h3>
        ${monthKeys.length ? html`<div class="bars">${monthKeys.map((k) => html`<div class="bar-col"><div class="bar-v" style="height:${Math.round((months[k] / maxM) * 100)}%" title="${money(months[k])}"></div><small>${k.slice(5)}/${k.slice(2, 4)}</small></div>`)}</div>`
        : html`<p class="muted">${t('Vos gains apparaîtront ici.', 'Your earnings will appear here.')}</p>`}
        <p class="small muted">${t('Commission plateforme', 'Platform commission')} : ${state.payConfig?.commission_rate ?? 12} % · ${t('versement après chaque cours', 'paid after each lesson')}</p>
      </section>
    </div>
    <div class="dash-grid two">
      <section class="card">
        <h3>👥 ${t('Mes élèves', 'My students')}</h3>
        ${students.length ? students.map((b) => html`<div class="line row between">${avatar(b.student_name, b.student_avatar, 32)}<span class="grow">${b.student_name}</span>
          <a class="btn ghost sm" href="#/progress/${b.student_id}">${t('Progression', 'Progress')}</a>
          <button class="btn ghost sm" data-hw="${b.student_id}" data-name="${b.student_name}">+ ${t('Devoir', 'Homework')}</button></div>`)
        : html`<p class="muted">—</p>`}
      </section>
      <section class="card">
        <div class="section-head"><h3>👨‍🏫 ${t('Mes cours collectifs', 'My group classes')}</h3><button class="btn primary sm" data-newgroup>+ ${t('Créer', 'Create')}</button></div>
        ${groups.length ? groups.map((g) => html`<div class="line row between"><span><b>${g.title}</b><br><small class="muted">${fmtDate(g.start_at)} · ${g.enrolled}/${g.max_students}</small></span>
          ${statusBadge(g.status)}${canJoin(g) ? html`<a class="btn accent sm" href="#/classroom/${g.room_id}">🎥</a>` : ''}
          ${g.status === 'scheduled' && Date.parse(g.start_at) < Date.now() ? html`<button class="btn ghost sm" data-gdone="${g.id}">${t('Clôturer', 'Close')}</button>` : ''}</div>`)
        : html`<p class="muted">${t('Préparez un groupe pour le BEPC, le Bac ou un club de conversation.', 'Run a group for exam prep or a conversation club.')}</p>`}
      </section>
    </div>
  </div>`;

  app.querySelectorAll('[data-hw]').forEach((b) => { b.onclick = () => import('./homework.js').then((m) => m.assignHomework(Number(b.dataset.hw), b.dataset.name)); });
  app.querySelector('[data-newgroup]').onclick = () => import('./groups.js').then((m) => m.createGroup(() => tutorDash(app, u)));
  app.querySelectorAll('[data-gdone]').forEach((b) => {
    b.onclick = async () => { await api(`/groups/${b.dataset.gdone}/complete`, { method: 'POST' }); toast(t('Cours clôturé, paiements versés.', 'Class closed, payments released.'), 'success'); tutorDash(app, u); };
  });
}

async function parentDash(app, u) {
  const [lessons, hw] = await Promise.all([api('/bookings'), api('/learning/homework')]);
  const progress = await Promise.all((u.children || []).map((c) => api(`/learning/progress/${c.id}`)));
  app.innerHTML = html`
  <div class="container page">
    <div class="dash-head"><div><h1>${t('Espace parents', 'Parent space')}</h1><p class="muted">${t('Suivez la scolarité de vos enfants en temps réel.', 'Follow your children’s learning in real time.')}</p></div>
      <div class="card wallet-mini inline"><span>💰 <b>${money(u.wallet_balance)}</b></span><button class="btn primary sm" data-topup>${t('Recharger', 'Top up')}</button></div></div>
    <div class="grid-3">
      ${progress.map((p) => html`
        <a class="card child-card" href="#/progress/${p.student.id}">
          <div class="row gap">${avatar(p.student.name, p.student.avatar, 52)}<div><h3>${p.student.name}</h3><small class="muted">${t('Niveau', 'Level')} ${p.level} · 🔥 ${p.student.streak_days} ${t('jours', 'days')}</small></div></div>
          <div class="mini-stats">
            <div><b>${p.lessons.total}</b><small>${t('cours', 'lessons')}</small></div>
            <div><b>${p.homework.avg_score ?? '—'}</b><small>${t('moy. devoirs', 'hw avg')}</small></div>
            <div><b>${p.upcoming.length}</b><small>${t('à venir', 'upcoming')}</small></div>
          </div>
        </a>`)}
      <form class="card stack" data-link>
        <h3>➕ ${t('Rattacher un enfant', 'Link a child')}</h3>
        <p class="small muted">${t("Saisissez l'e-mail du compte élève de votre enfant.", "Enter your child's student account email.")}</p>
        <input name="email" type="email" required placeholder="enfant@exemple.cm">
        <button class="btn primary" type="submit">${t('Rattacher', 'Link')}</button>
        <a class="small" href="#/search?category=scolaire">${t('Trouver un répétiteur', 'Find a tutor')} →</a>
      </form>
    </div>
    <div class="dash-grid two">
      <section class="card"><h3>📅 ${t('Cours des enfants', "Children's lessons")}</h3>
        ${lessons.length ? lessons.slice(0, 8).map((b) => html`<div><small class="muted">${b.student_name}</small>${lessonRow(b)}</div>`) : html`<p class="muted">—</p>`}
      </section>
      <section class="card"><h3>📝 ${t('Devoirs', 'Homework')}</h3>
        ${hw.length ? hw.slice(0, 8).map((h) => html`<div class="line row between"><span><b>${h.title}</b><br><small class="muted">${h.student_name} · ${h.tutor_name}</small></span>${h.score != null ? html`<b>${h.score}/100</b>` : ''}${statusBadge(h.status)}</div>`) : html`<p class="muted">—</p>`}
      </section>
    </div>
  </div>`;
  app.querySelector('[data-topup]').onclick = async () => { if (await openDeposit(10000)) parentDash(app, state.user); };
  onSubmit(app.querySelector('[data-link]'), async (d) => {
    await api('/auth/children', { method: 'POST', body: d });
    await loadMe();
    toast(t('Enfant rattaché !', 'Child linked!'), 'success');
    parentDash(app, state.user);
  });
}
