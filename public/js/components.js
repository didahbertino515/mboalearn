import { state, api, t, html, avatar, money, stars, toast } from './core.js';

export function tutorCard(tu) {
  return html`
  <article class="tutor-card card" data-id="${tu.id}">
    <a class="tc-photo" href="#/tutor/${tu.id}">${avatar(tu.name, tu.avatar, 96)}${tu.super_tutor ? html`<span class="badge super">⭐ Super tuteur</span>` : ''}</a>
    <div class="tc-main">
      <div class="tc-head">
        <a href="#/tutor/${tu.id}" class="tc-name">${tu.name}</a>
        <span class="muted small">📍 ${tu.city || tu.country}</span>
      </div>
      <p class="tc-headline">${tu.headline}</p>
      <div class="chips">${tu.subjects.slice(0, 4).map((s) => html`<span class="chip">${s}</span>`)}</div>
      <p class="small muted">🗣 ${t('Parle', 'Speaks')} : ${tu.languages.join(', ')}${tu.native_language ? html` · ${t('Natif', 'Native')} ${tu.native_language}` : ''}</p>
      <p class="tc-bio">${(tu.bio || '').split('\n')[0].slice(0, 180)}…</p>
    </div>
    <div class="tc-side">
      <div class="tc-stats">
        <div><b>${tu.rating ? `★ ${tu.rating.toFixed(1)}` : t('Nouveau', 'New')}</b><small>${tu.reviews_count} ${t('avis', 'reviews')}</small></div>
        <div><b>${money(tu.hourly_rate)}</b><small>${t('par heure', 'per hour')}</small></div>
      </div>
      <small class="muted">${tu.lessons_count.toLocaleString()} ${t('cours donnés', 'lessons taught')} · ${tu.students_count} ${t('élèves', 'students')}</small>
      <a class="btn primary block" href="#/tutor/${tu.id}?book=trial">${tu.trial_rate === 0 ? t("Cours d'essai gratuit", 'Free trial lesson') : `${t('Essai', 'Trial')} · ${money(tu.trial_rate)}`}</a>
      <div class="row gap">
        <a class="btn ghost sm grow" href="#/tutor/${tu.id}?contact=1">💬 ${t('Message', 'Message')}</a>
        <button class="btn ghost sm fav ${tu.favorite ? 'on' : ''}" data-fav="${tu.id}" aria-label="Favori">${tu.favorite ? '♥' : '♡'}</button>
      </div>
    </div>
  </article>`;
}

export function bindFavorites(root) {
  root.querySelectorAll('[data-fav]').forEach((b) => {
    b.onclick = async () => {
      if (!state.user) { location.hash = '#/login'; return; }
      try {
        const r = await api(`/tutors/${b.dataset.fav}/favorite`, { method: 'POST' });
        b.classList.toggle('on', r.favorite);
        b.textContent = r.favorite ? '♥' : '♡';
      } catch (e) { toast(e.message, 'error'); }
    };
  });
}

export function statusBadge(status) {
  const map = {
    confirmed: ['blue', t('Confirmé', 'Confirmed')], completed: ['green', t('Terminé', 'Completed')],
    cancelled: ['grey', t('Annulé', 'Cancelled')], disputed: ['red', t('Réclamation', 'Disputed')], refunded: ['grey', t('Remboursé', 'Refunded')],
    pending: ['amber', t('En attente', 'Pending')], success: ['green', t('Réussi', 'Success')], failed: ['red', t('Échoué', 'Failed')],
    assigned: ['amber', t('À faire', 'To do')], submitted: ['blue', t('Rendu', 'Submitted')], graded: ['green', t('Corrigé', 'Graded')],
    approved: ['green', t('Approuvé', 'Approved')], rejected: ['red', t('Refusé', 'Rejected')], scheduled: ['blue', t('Programmé', 'Scheduled')],
  };
  const [c, l] = map[status] || ['grey', status];
  return html`<span class="badge ${c}">${l}</span>`;
}

export const emptyState = (icon, title, text, action = '') => html`<div class="empty"><div class="empty-icon">${icon}</div><h3>${title}</h3><p class="muted">${text}</p>${action}</div>`;

// Fenêtre « classe accessible » : 15 min avant jusqu'à la fin du cours
export function canJoin(b) {
  const s = Date.parse(b.start_at);
  return ['confirmed', 'scheduled'].includes(b.status) && Date.now() >= s - 15 * 60000 && Date.now() <= s + (b.duration_min + 30) * 60000;
}
