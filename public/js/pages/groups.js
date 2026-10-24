import { state, api, t, html, avatar, money, fmtDate, modal, toast, loadMe, SUBJECTS, LEVELS } from '../core.js';
import { canJoin, emptyState } from '../components.js';
import { openDeposit } from '../payflow.js';
import { renderHeader } from '../app.js';

export default async function groups(app, { params }) {
  const list = await api(`/groups${params.subject ? `?subject=${encodeURIComponent(params.subject)}` : ''}`);
  const mine = state.user ? await api('/groups/mine') : [];
  app.innerHTML = html`
  <div class="container page">
    <div class="dash-head"><div><h1>👥 ${t('Cours collectifs', 'Group classes')}</h1>
      <p class="muted">${t("Préparation aux examens, clubs de conversation, révisions : apprenez en groupe jusqu'à 70 % moins cher.", 'Exam prep, conversation clubs, revision: learn in groups for up to 70% less.')}</p></div>
      ${state.user?.role === 'tutor' ? html`<button class="btn primary" data-new>+ ${t('Créer un cours collectif', 'Create a group class')}</button>` : ''}</div>
    ${mine.length && state.user.role === 'student' ? html`<section class="card"><h3>${t('Mes inscriptions', 'My enrolments')}</h3>${mine.map((g) => html`
      <div class="line row between"><span><b>${g.title}</b><br><small class="muted">${fmtDate(g.start_at)} · ${g.tutor_name}</small></span>
      ${canJoin(g) ? html`<a class="btn accent sm pulse" href="#/classroom/${g.room_id}">🎥 ${t('Rejoindre', 'Join')}</a>` : html`<span class="badge blue">${t('Inscrit', 'Enrolled')}</span>`}</div>`)}</section>` : ''}
    <div class="grid-3">
      ${list.length ? list.map((g) => html`
        <article class="card group-card">
          <div class="row between"><span class="badge blue">${g.level || g.subject}</span><small class="muted">${g.duration_min} min</small></div>
          <h3>${g.title}</h3>
          <p class="small muted">${g.description || ''}</p>
          <div class="row gap">${avatar(g.tutor_name, g.tutor_avatar, 28)}<a href="#/tutor/${g.tutor_id}">${g.tutor_name}</a></div>
          <p class="small">🗓 ${fmtDate(g.start_at, { dateStyle: 'full', timeStyle: 'short' })}</p>
          <div class="seats"><div class="bar"><i style="width:${Math.round((g.enrolled / g.max_students) * 100)}%"></i></div><small>${g.enrolled}/${g.max_students} ${t('places', 'seats')}</small></div>
          <div class="row between"><b class="price">${g.price ? money(g.price) : t('Gratuit', 'Free')}</b>
            ${g.joined ? (canJoin(g) ? html`<a class="btn accent sm" href="#/classroom/${g.room_id}">🎥 ${t('Rejoindre', 'Join')}</a>` : html`<span class="badge green">✓ ${t('Inscrit', 'Enrolled')}</span>`)
            : g.enrolled >= g.max_students ? html`<span class="badge grey">${t('Complet', 'Full')}</span>`
            : state.user?.role === 'tutor' ? '' : html`<button class="btn primary sm" data-join="${g.id}">${t("S'inscrire", 'Enrol')}</button>`}</div>
        </article>`) : emptyState('👥', t('Aucun cours collectif programmé', 'No group class scheduled'), '')}
    </div>
  </div>`;
  app.querySelector('[data-new]')?.addEventListener('click', () => createGroup(() => groups(app, { params })));
  app.querySelectorAll('[data-join]').forEach((b) => {
    b.onclick = async () => {
      if (!state.user) { location.hash = '#/login?next=%23%2Fgroups'; return; }
      const g = list.find((x) => x.id === Number(b.dataset.join));
      if (g.price > state.user.wallet_balance && !(await openDeposit(g.price - state.user.wallet_balance))) return;
      try {
        await api(`/groups/${g.id}/join`, { method: 'POST' });
        await loadMe();
        renderHeader();
        toast(t('Inscription confirmée !', 'Enrolment confirmed!'), 'success');
        groups(app, { params });
      } catch (e) { toast(e.message, 'error'); }
    };
  });
}

export function createGroup(done) {
  const subjects = [...new Set([...SUBJECTS.scolaire, ...SUBJECTS.langue])];
  const m = modal(html`
    <h2>${t('Nouveau cours collectif', 'New group class')}</h2>
    <form class="stack" data-f>
      <label class="field"><span>${t('Titre', 'Title')}</span><input name="title" required placeholder="${t('Ex : Révision Bac D — Probabilités', 'e.g. Bac revision — Probability')}"></label>
      <div class="row gap wrap">
        <label class="field grow"><span>${t('Matière', 'Subject')}</span><select name="subject">${subjects.map((s) => html`<option>${s}</option>`)}</select></label>
        <label class="field grow"><span>${t('Niveau', 'Level')}</span><select name="level">${[...LEVELS.scolaire, ...LEVELS.langue].map((s) => html`<option>${s}</option>`)}</select></label>
      </div>
      <label class="field"><span>Description</span><textarea name="description" rows="3"></textarea></label>
      <div class="row gap wrap">
        <label class="field grow"><span>${t('Date et heure', 'Date & time')}</span><input name="start_at" type="datetime-local" required></label>
        <label class="field"><span>${t('Durée (min)', 'Duration (min)')}</span><input name="duration_min" type="number" value="90" min="30" max="240"></label>
      </div>
      <div class="row gap wrap">
        <label class="field grow"><span>${t('Prix par élève (FCFA)', 'Price per student (FCFA)')}</span><input name="price" type="number" value="2000" min="0" step="100"></label>
        <label class="field grow"><span>${t('Places', 'Seats')}</span><input name="max_students" type="number" value="15" min="2" max="30"></label>
      </div>
      <button class="btn primary" type="submit">${t('Publier', 'Publish')}</button>
    </form>`);
  m.el.querySelector('[data-f]').onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target).entries());
    d.start_at = new Date(d.start_at).toISOString();
    try {
      await api('/groups', { method: 'POST', body: d });
      m.close();
      toast(t('Cours collectif publié', 'Group class published'), 'success');
      done?.();
    } catch (err) { toast(err.message, 'error'); }
  };
}
