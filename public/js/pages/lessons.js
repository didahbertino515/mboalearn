import { state, api, t, html, modal, toast, confirmBox, fmtDay, fmtTime, loadMe } from '../core.js';
import { lessonRow, } from './dashboard.js';
import { emptyState } from '../components.js';
import { renderHeader } from '../app.js';

export default async function lessons(app, { params }) {
  const all = await api('/bookings');
  const tab = params.tab || 'upcoming';
  const now = Date.now();
  const lists = {
    upcoming: all.filter((b) => ['confirmed', 'disputed'].includes(b.status) && Date.parse(b.start_at) + b.duration_min * 60000 > now - 3600000).sort((a, b) => a.start_at.localeCompare(b.start_at)),
    toclose: all.filter((b) => b.status === 'confirmed' && Date.parse(b.start_at) + b.duration_min * 60000 <= now - 3600000),
    past: all.filter((b) => b.status !== 'confirmed' && b.status !== 'disputed'),
  };
  const isStudentSide = state.user.role !== 'tutor';
  app.innerHTML = html`
  <div class="container page">
    <h1 class="page-title">${t('Mes cours', 'My lessons')}</h1>
    <div class="tabs">
      <a href="#/lessons?tab=upcoming" class="${tab === 'upcoming' ? 'active' : ''}">${t('À venir', 'Upcoming')} (${lists.upcoming.length})</a>
      <a href="#/lessons?tab=toclose" class="${tab === 'toclose' ? 'active' : ''}">${t('À valider', 'To confirm')} (${lists.toclose.length})</a>
      <a href="#/lessons?tab=past" class="${tab === 'past' ? 'active' : ''}">${t('Historique', 'History')}</a>
      <a href="#/lessons?tab=calendar" class="${tab === 'calendar' ? 'active' : ''}">🗓 ${t('Calendrier', 'Calendar')}</a>
    </div>
    <div class="card" data-list></div>
  </div>`;

  const box = app.querySelector('[data-list]');
  if (tab === 'calendar') return renderCalendar(box, all.filter((b) => b.status !== 'cancelled'));
  const list = lists[tab] || lists.upcoming;
  const actions = (b) => {
    const out = [];
    const started = Date.parse(b.start_at) <= now;
    if (b.status === 'confirmed' && !started) {
      out.push(html`<button class="btn ghost sm" data-act="reschedule" data-id="${b.id}">${t('Déplacer', 'Reschedule')}</button>`);
      out.push(html`<button class="btn ghost sm danger" data-act="cancel" data-id="${b.id}">${t('Annuler', 'Cancel')}</button>`);
    }
    if (b.status === 'confirmed' && started) {
      out.push(html`<button class="btn primary sm" data-act="complete" data-id="${b.id}">✓ ${t('Confirmer le cours', 'Confirm lesson')}</button>`);
      if (isStudentSide) out.push(html`<button class="btn ghost sm danger" data-act="dispute" data-id="${b.id}">${t('Signaler un problème', 'Report a problem')}</button>`);
    }
    if (b.status === 'completed' && isStudentSide && !b.reviewed) out.push(html`<button class="btn accent sm" data-act="review" data-id="${b.id}">★ ${t('Noter', 'Review')}</button>`);
    if (b.status === 'completed' && isStudentSide) out.push(html`<a class="btn ghost sm" href="#/tutor/${b.tutor_id}?book=regular">${t('Réserver à nouveau', 'Book again')}</a>`);
    if (b.status === 'completed' && !isStudentSide) out.push(html`<button class="btn ghost sm" data-act="homework" data-id="${b.id}">+ ${t('Devoir', 'Homework')}</button>`);
    return out;
  };
  box.innerHTML = list.length ? list.map((b) => lessonRow(b, { actions })).join('') : emptyState('📅', t('Aucun cours ici', 'No lessons here'), '', html`<a class="btn primary" href="#/search">${t('Trouver un tuteur', 'Find a tutor')}</a>`);
  if (tab === 'toclose' && list.length) {
    box.insertAdjacentHTML('afterbegin', html`<p class="notice">${t('Confirmez les cours qui ont eu lieu pour libérer le paiement. Sans action, ils sont validés automatiquement 24h après.', 'Confirm lessons that took place to release payment. They auto-confirm after 24h.')}</p>`);
  }

  const byId = Object.fromEntries(all.map((b) => [b.id, b]));
  const reload = async () => { await loadMe(); renderHeader(); lessons(app, { params }); };
  box.querySelectorAll('[data-act]').forEach((btn) => {
    btn.onclick = async () => {
      const b = byId[btn.dataset.id];
      try {
        switch (btn.dataset.act) {
          case 'cancel': {
            const late = (Date.parse(b.start_at) - now) / 3600000 < 12 && state.user.role !== 'tutor';
            if (!(await confirmBox(late ? t('Moins de 12h avant le cours : le tuteur sera payé et vous ne serez pas remboursé. Continuer ?', 'Less than 12h before the lesson: no refund. Continue?') : t('Annuler ce cours ? Le montant sera remboursé sur votre portefeuille.', 'Cancel this lesson? You will be refunded.')))) return;
            await api(`/bookings/${b.id}/cancel`, { method: 'POST' });
            toast(t('Cours annulé', 'Lesson cancelled'), 'success');
            return reload();
          }
          case 'complete':
            await api(`/bookings/${b.id}/complete`, { method: 'POST' });
            toast(t('Cours confirmé, merci !', 'Lesson confirmed, thanks!'), 'success');
            return reload();
          case 'dispute': return disputeModal(b, reload);
          case 'review': return reviewModal(b, reload);
          case 'reschedule': return rescheduleModal(b, reload);
          case 'homework': return import('./homework.js').then((m) => m.assignHomework(b.student_id, b.student_name, b.id));
        }
      } catch (e) { toast(e.message, 'error'); }
    };
  });
}

function reviewModal(b, done) {
  const m = modal(html`<h2>${t('Noter votre cours avec', 'Rate your lesson with')} ${b.tutor_name}</h2>
    <form class="stack" data-f>
      <div class="star-input">${[5, 4, 3, 2, 1].map((n) => html`<input type="radio" name="rating" id="s${n}" value="${n}" ${n === 5 ? 'checked' : ''}><label for="s${n}">★</label>`)}</div>
      <textarea name="comment" rows="4" placeholder="${t('Qu\'avez-vous pensé du cours ?', 'What did you think?')}"></textarea>
      <button class="btn primary" type="submit">${t('Publier mon avis', 'Post review')}</button>
    </form>`);
  m.el.querySelector('[data-f]').onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api(`/bookings/${b.id}/review`, { method: 'POST', body: { rating: Number(f.rating.value), comment: f.comment.value } });
      m.close();
      toast(t('Merci pour votre avis !', 'Thanks for your review!'), 'success');
      done();
    } catch (err) { toast(err.message, 'error'); }
  };
}

function disputeModal(b, done) {
  const m = modal(html`<h2>${t('Signaler un problème', 'Report a problem')}</h2>
    <p class="muted">${t("Le paiement restera bloqué pendant que notre équipe examine la situation. Si le cours n'a pas eu lieu, vous serez remboursé.", 'Payment stays on hold while we review. If the lesson did not happen you will be refunded.')}</p>
    <form class="stack" data-f>
      <select name="reason_type"><option>${t('Le tuteur ne s\'est pas présenté', 'Tutor did not show up')}</option><option>${t('Problème technique', 'Technical problem')}</option><option>${t('Cours écourté', 'Lesson cut short')}</option><option>${t('Autre', 'Other')}</option></select>
      <textarea name="details" rows="3" placeholder="${t('Détails', 'Details')}"></textarea>
      <button class="btn primary" type="submit">${t('Envoyer', 'Send')}</button>
    </form>`);
  m.el.querySelector('[data-f]').onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/bookings/${b.id}/dispute`, { method: 'POST', body: { reason: `${e.target.reason_type.value}. ${e.target.details.value}` } });
      m.close();
      toast(t('Réclamation envoyée', 'Dispute submitted'), 'success');
      done();
    } catch (err) { toast(err.message, 'error'); }
  };
}

async function rescheduleModal(b, done) {
  const slots = await api(`/tutors/${b.tutor_id}/slots?duration=${b.duration_min}`);
  const m = modal(html`<h2>${t('Déplacer le cours', 'Reschedule')}</h2><div class="slots">${slots.length ? slots.slice(0, 60).map((s) => html`<button class="slot" data-s="${s}">${fmtDay(s)} · ${fmtTime(s)}</button>`) : t('Aucun créneau libre', 'No free slots')}</div>`, { wide: true });
  m.el.querySelectorAll('[data-s]').forEach((x) => {
    x.onclick = async () => {
      try {
        await api(`/bookings/${b.id}/reschedule`, { method: 'POST', body: { start_at: x.dataset.s } });
        m.close();
        toast(t('Cours déplacé', 'Lesson moved'), 'success');
        done();
      } catch (e) { toast(e.message, 'error'); }
    };
  });
}

function renderCalendar(box, items) {
  let weekStart = new Date();
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const draw = () => {
    const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86400000));
    box.innerHTML = html`
      <div class="row between"><button class="btn ghost sm" data-prev>←</button><b>${fmtDay(days[0].toISOString())} – ${fmtDay(days[6].toISOString())}</b><button class="btn ghost sm" data-next>→</button></div>
      <div class="calendar">${days.map((d) => {
        const dayItems = items.filter((b) => new Date(b.start_at).toDateString() === d.toDateString()).sort((a, c) => a.start_at.localeCompare(c.start_at));
        return html`<div class="cal-day ${d.toDateString() === new Date().toDateString() ? 'today' : ''}"><div class="cal-head">${fmtDay(d.toISOString()).split(' ').slice(0, 2).join(' ')}</div>
          ${dayItems.map((b) => html`<a class="cal-ev ${b.status}" href="${b.status === 'confirmed' ? `#/classroom/${b.room_id}` : '#/lessons?tab=past'}"><b>${fmtTime(b.start_at)}</b> ${b.subject || ''}<br><small>${state.user.role === 'tutor' ? b.student_name : b.tutor_name}</small></a>`)}</div>`;
      })}</div>`;
    box.querySelector('[data-prev]').onclick = () => { weekStart = new Date(weekStart.getTime() - 7 * 86400000); draw(); };
    box.querySelector('[data-next]').onclick = () => { weekStart = new Date(weekStart.getTime() + 7 * 86400000); draw(); };
  };
  draw();
}
