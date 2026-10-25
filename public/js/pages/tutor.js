import { state, api, t, html, avatar, money, stars, modal, toast, fmtDate, fmtDay, fmtTime, loadMe, WEEKDAYS } from '../core.js';
import { openDeposit } from '../payflow.js';
import { renderHeader } from '../app.js';
import { verifiedBadges } from '../components.js';

function videoEmbed(url) {
  const m = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/.exec(url || '');
  return m ? html`<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="Vidéo de présentation" allowfullscreen loading="lazy"></iframe></div>` : '';
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export default async function tutorPage(app, { args, params }) {
  const tu = await api(`/tutors/${args[0]}`);
  const days = WEEKDAYS();
  app.innerHTML = html`
  <div class="container page tutor-page">
    <div class="tp-main">
      <section class="card tp-header">
        ${avatar(tu.name, tu.avatar, 120)}
        <div>
          <h1>${tu.name} ${tu.super_tutor ? html`<span class="badge super">⭐ Super tuteur</span>` : ''}</h1>
          <div class="chips">${verifiedBadges(tu)}</div>
          <p class="lead">${tu.headline}</p>
          <p class="muted">📍 ${tu.city || ''}, ${tu.country} · 🎓 ${tu.experience_years} ${t("ans d'expérience", 'years of experience')}</p>
          <div class="chips">${tu.subjects.map((s) => html`<span class="chip">${s}</span>`)}</div>
        </div>
      </section>
      <section class="tp-stats">
        <div class="stat"><b>${tu.rating ? tu.rating.toFixed(1) : '—'} ★</b><small>${tu.reviews_count} ${t('avis', 'reviews')}</small></div>
        <div class="stat"><b>${tu.lessons_count.toLocaleString()}</b><small>${t('cours', 'lessons')}</small></div>
        <div class="stat"><b>${tu.students_count}</b><small>${t('élèves', 'students')}</small></div>
        <div class="stat"><b>${money(tu.hourly_rate)}</b><small>${t('par heure', 'per hour')}</small></div>
      </section>
      ${videoEmbed(tu.video_url)}
      <section class="card">
        <h2>${t('À propos', 'About me')}</h2>
        <p class="pre">${tu.bio}</p>
        <dl class="facts">
          <dt>🗣 ${t('Langues parlées', 'Speaks')}</dt><dd>${tu.languages.join(', ')}${tu.native_language ? ` (${t('natif', 'native')} : ${tu.native_language})` : ''}</dd>
          <dt>🎯 ${t('Niveaux', 'Levels')}</dt><dd>${tu.levels.join(', ')}</dd>
          <dt>✨ ${t('Spécialités', 'Specialties')}</dt><dd>${tu.specialties.join(', ') || '—'}</dd>
          <dt>🎓 ${t('Formation', 'Education')}</dt><dd>${tu.education || '—'}</dd>
          ${tu.certificates ? html`<dt>📜 ${t('Certificats', 'Certificates')}</dt><dd>${tu.certificates}</dd>` : ''}
          ${tu.home_lessons ? html`<dt>🏠 ${t('À domicile', 'Home lessons')}</dt><dd>${t('Possible à', 'Available in')} ${tu.city}</dd>` : ''}
        </dl>
      </section>
      <section class="card">
        <h2>${t('Disponibilités habituelles', 'Usual availability')} <small class="muted">(${t('votre heure locale', 'your local time')})</small></h2>
        <div class="week-grid">${[1, 2, 3, 4, 5, 6, 0].map((d) => {
          const tzShift = -new Date().getTimezoneOffset() - tu.tz_offset;
          const ws = tu.availability.filter((a) => a.weekday === d);
          return html`<div class="wd"><b>${days[d]}</b>${ws.length ? ws.map((w) => html`<span>${hhmm((w.start_min + tzShift + 1440) % 1440)}–${hhmm((w.end_min + tzShift + 1440) % 1440)}</span>`) : html`<span class="muted">—</span>`}</div>`;
        })}</div>
      </section>
      ${tu.group_classes.length ? html`<section class="card"><h2>${t('Cours collectifs à venir', 'Upcoming group classes')}</h2>
        ${tu.group_classes.map((g) => html`<div class="row between line"><div><b>${g.title}</b><br><small class="muted">${fmtDate(g.start_at)} · ${g.duration_min} min</small></div><a class="btn ghost sm" href="#/groups">${money(g.price)}</a></div>`)}
      </section>` : ''}
      <section class="card">
        <h2>${t('Avis des élèves', 'Student reviews')} <small class="muted">${tu.reviews_count}</small></h2>
        ${tu.reviews.length ? tu.reviews.map((r) => html`
          <div class="review">${avatar(r.student_name, r.student_avatar, 40)}<div><b>${r.student_name}</b> ${stars(r.rating)}<br><small class="muted">${fmtDate(r.created_at.replace(' ', 'T') + 'Z', { dateStyle: 'medium' })}</small><p>${r.comment}</p></div></div>`)
        : html`<p class="muted">${t('Pas encore d\'avis.', 'No reviews yet.')}</p>`}
      </section>
    </div>
    <aside class="tp-side">
      <div class="card sticky book-card">
        <div class="price-line"><b>${money(tu.hourly_rate)}</b><span class="muted">/ 60 min</span></div>
        ${!tu.has_trial ? html`<button class="btn accent block" data-book="trial">${tu.trial_rate === 0 ? t("Réserver un cours d'essai gratuit", 'Book a free trial') : `${t("Réserver un cours d'essai", 'Book a trial lesson')} · ${money(tu.trial_rate)}`}</button>` : ''}
        <button class="btn primary block" data-book="regular">📅 ${t('Réserver un cours', 'Book a lesson')}</button>
        <button class="btn ghost block" data-contact>💬 ${t('Envoyer un message', 'Send a message')}</button>
        <button class="btn ghost block" data-fav>${tu.favorite ? '♥' : '♡'} ${t('Favori', 'Favourite')}</button>
        ${tu.packages?.length ? html`<p class="notice">🎟 ${t('Forfait actif', 'Active package')} : ${tu.packages[0].lessons_left} ${t('cours restants', 'lessons left')}</p>` : ''}
        <hr>
        <h4>${t('Forfaits (économisez jusqu\'à 10 %)', 'Packages (save up to 10%)')}</h4>
        ${[[5, 0], [10, 5], [20, 10]].map(([n, d]) => html`
          <button class="pkg" data-pkg="${n}"><span><b>${n} ${t('cours', 'lessons')}</b>${d ? html` <span class="badge green">-${d}%</span>` : ''}</span><span>${money(Math.round(tu.hourly_rate * (1 - d / 100)) * n)}</span></button>`)}
        <ul class="guarantees small muted">
          <li>🔒 ${t('Paiement libéré au tuteur après le cours', 'Payment released after the lesson')}</li>
          <li>↩️ ${t('Annulation gratuite jusqu\'à 12h avant', 'Free cancellation up to 12h before')}</li>
          <li>🛡 ${t('Réclamation possible si problème', 'Dispute if something goes wrong')}</li>
        </ul>
      </div>
    </aside>
  </div>`;

  const needLogin = () => { if (!state.user) { location.hash = `#/login?next=${encodeURIComponent(location.hash)}`; return true; } return false; };
  app.querySelectorAll('[data-book]').forEach((b) => { b.onclick = () => { if (!needLogin()) bookingModal(tu, b.dataset.book); }; });
  app.querySelector('[data-contact]').onclick = async () => {
    if (needLogin()) return;
    const c = await api(`/messages/with/${tu.id}`, { method: 'POST' });
    location.hash = `#/messages/${c.id}`;
  };
  app.querySelector('[data-fav]').onclick = async (e) => {
    if (needLogin()) return;
    const r = await api(`/tutors/${tu.id}/favorite`, { method: 'POST' });
    e.target.textContent = `${r.favorite ? '♥' : '♡'} ${t('Favori', 'Favourite')}`;
  };
  app.querySelectorAll('[data-pkg]').forEach((b) => { b.onclick = () => { if (!needLogin()) buyPackage(tu, Number(b.dataset.pkg)); }; });

  if (params.book && state.user) bookingModal(tu, params.book === 'trial' && !tu.has_trial ? 'trial' : 'regular');
  if (params.contact && state.user) app.querySelector('[data-contact]').click();
}

function childPicker() {
  if (state.user.role !== 'parent') return '';
  if (!state.user.children?.length) return html`<p class="notice err">${t('Rattachez d\'abord un enfant dans vos paramètres.', 'Link a child in your settings first.')}</p>`;
  return html`<label class="field"><span>${t('Pour quel enfant ?', 'For which child?')}</span><select name="child_id">${state.user.children.map((c) => html`<option value="${c.id}">${c.name}</option>`)}</select></label>`;
}

async function bookingModal(tu, type) {
  const pkg = tu.packages?.[0];
  const m = modal(html`
    <h2>${type === 'trial' ? t("Cours d'essai avec", 'Trial lesson with') : t('Réserver avec', 'Book with')} ${tu.name}</h2>
    <form class="stack" data-form>
      ${childPicker()}
      <div class="row gap wrap">
        <label class="field grow"><span>${t('Durée', 'Duration')}</span><select name="duration">
          ${(type === 'trial' ? [30, 60] : [30, 45, 60, 90, 120]).map((d) => html`<option value="${d}" ${d === 60 ? 'selected' : ''}>${d} min</option>`)}
        </select></label>
        <label class="field grow"><span>${t('Matière', 'Subject')}</span><select name="subject">${tu.subjects.map((s) => html`<option>${s}</option>`)}</select></label>
        ${type === 'regular' ? html`<label class="field grow"><span>${t('Répéter chaque semaine', 'Repeat weekly')}</span><select name="weeks">${[1, 2, 4, 8, 12].map((w) => html`<option value="${w}">${w === 1 ? t('Non', 'No') : `${w} ${t('semaines', 'weeks')}`}</option>`)}</select></label>` : ''}
      </div>
      ${type === 'regular' && pkg ? html`<label class="check"><input type="checkbox" name="use_package" checked> 🎟 ${t('Utiliser mon forfait', 'Use my package')} (${pkg.lessons_left} ${t('restants', 'left')}, 60 min)</label>` : ''}
      <div><b>${t('Choisissez un créneau', 'Pick a time slot')}</b> <small class="muted">(${Intl.DateTimeFormat().resolvedOptions().timeZone})</small></div>
      <div class="slots" data-slots><div class="loader"></div></div>
      <label class="field"><span>${t('Message pour le tuteur (objectifs, chapitre…)', 'Note for the tutor (goals, chapter…)')}</span><textarea name="note" rows="2"></textarea></label>
      <div class="summary" data-summary></div>
      <button class="btn primary block" type="submit" disabled>${t('Confirmer la réservation', 'Confirm booking')}</button>
    </form>`, { wide: true });

  const form = m.el.querySelector('[data-form]');
  let chosen = null;
  const price = () => {
    const d = Number(form.duration.value);
    const weeks = Number(form.weeks?.value || 1);
    if (form.use_package?.checked) return 0;
    return Math.round(((type === 'trial' ? tu.trial_rate : tu.hourly_rate) * d) / 60) * weeks;
  };
  const summary = () => {
    const p = price();
    const bal = state.user.wallet_balance;
    m.el.querySelector('[data-summary]').innerHTML = html`
      <div class="row between"><span>${chosen ? fmtDate(chosen, { dateStyle: 'full', timeStyle: 'short' }) : t('Aucun créneau choisi', 'No slot selected')}</span><b>${form.use_package?.checked ? t('Forfait', 'Package') : money(p)}</b></div>
      <div class="row between small muted"><span>${t('Solde du portefeuille', 'Wallet balance')}</span><span>${money(bal)}</span></div>
      ${p > bal ? html`<p class="notice">${t('Solde insuffisant : vous serez invité à recharger par Mobile Money.', 'Insufficient balance: you will be asked to top up via Mobile Money.')}</p>` : ''}`;
    form.querySelector('[type=submit]').disabled = !chosen;
  };
  const loadSlots = async () => {
    const duration = form.use_package?.checked ? 60 : form.duration.value;
    const slots = await api(`/tutors/${tu.id}/slots?duration=${duration}`);
    const byDay = {};
    for (const s of slots) (byDay[new Date(s).toDateString()] ||= []).push(s);
    const box = m.el.querySelector('[data-slots]');
    chosen = null;
    box.innerHTML = Object.keys(byDay).length
      ? Object.values(byDay).map((list) => html`<div class="slot-day"><b>${fmtDay(list[0])}</b><div class="slot-list">${list.map((s) => html`<button type="button" class="slot" data-slot="${s}">${fmtTime(s)}</button>`)}</div></div>`).join('')
      : html`<p class="muted">${t('Aucun créneau libre dans les 14 prochains jours. Envoyez un message au tuteur.', 'No free slot in the next 14 days. Message the tutor.')}</p>`;
    box.querySelectorAll('[data-slot]').forEach((b) => {
      b.onclick = () => { box.querySelectorAll('.slot.on').forEach((x) => x.classList.remove('on')); b.classList.add('on'); chosen = b.dataset.slot; summary(); };
    });
    summary();
  };
  form.duration.onchange = loadSlots;
  if (form.weeks) form.weeks.onchange = summary;
  if (form.use_package) form.use_package.onchange = () => { form.duration.value = '60'; form.duration.disabled = form.use_package.checked; loadSlots(); };
  if (form.use_package?.checked) form.duration.disabled = true;
  loadSlots();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const p = price();
    if (p > state.user.wallet_balance) {
      const ok = await openDeposit(p - state.user.wallet_balance);
      if (!ok) return;
      summary();
    }
    btn.disabled = true;
    try {
      const created = await api('/bookings', {
        method: 'POST',
        body: {
          tutor_id: tu.id, type, start_at: chosen, duration: form.use_package?.checked ? 60 : Number(form.duration.value), subject: form.subject.value,
          weeks: Number(form.weeks?.value || 1), note: form.note.value, package_id: form.use_package?.checked ? pkg.id : undefined,
          child_id: form.child_id?.value,
        },
      });
      await loadMe();
      renderHeader();
      m.close();
      toast(created.length > 1 ? `${created.length} ${t('cours réservés !', 'lessons booked!')}` : t('Cours réservé ! Retrouvez-le dans « Mes cours ».', 'Lesson booked!'), 'success');
      location.hash = '#/lessons';
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      if (err.status === 409) loadSlots();
    }
  };
}

async function buyPackage(tu, n) {
  const d = { 5: 0, 10: 5, 20: 10 }[n];
  const total = Math.round(tu.hourly_rate * (1 - d / 100)) * n;
  const m = modal(html`
    <h2>${t('Forfait', 'Package')} ${n} ${t('cours', 'lessons')} — ${tu.name}</h2>
    <p>${n} × 60 min · <b>${money(total)}</b> ${d ? html`<span class="badge green">-${d}%</span>` : ''}</p>
    <p class="muted small">${t('Le montant est conservé en séquestre et versé au tuteur cours après cours. Les cours non utilisés restent disponibles.', 'Held in escrow and released lesson by lesson.')}</p>
    <form data-f class="stack">${childPicker()}<button class="btn primary block" type="submit">${t('Acheter le forfait', 'Buy package')}</button></form>`);
  m.el.querySelector('[data-f]').onsubmit = async (e) => {
    e.preventDefault();
    if (total > state.user.wallet_balance && !(await openDeposit(total - state.user.wallet_balance))) return;
    try {
      await api('/bookings/packages', { method: 'POST', body: { tutor_id: tu.id, lessons: n, subject: tu.subjects[0], child_id: e.target.child_id?.value } });
      await loadMe();
      renderHeader();
      m.close();
      toast(t('Forfait acheté ! Réservez maintenant vos cours.', 'Package purchased!'), 'success');
      location.hash = `#/tutor/${tu.id}?book=regular`;
    } catch (err) { toast(err.message, 'error'); }
  };
}
