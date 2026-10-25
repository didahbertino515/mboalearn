import { state, api, t, html, money, fmtDate, toast, confirmBox, modal, openPrivateFile } from '../core.js';

const listOf = (json) => { try { return JSON.parse(json).join(', '); } catch { return json || ''; } };

export const DOC_LABEL = () => ({ id: t("Pièce d'identité", 'ID document'), diploma: t('Diplôme', 'Diploma'), other: t('Autre justificatif', 'Other document') });
import { statusBadge, emptyState } from '../components.js';

export default async function admin(app, { params }) {
  if (state.user.role !== 'admin') { location.hash = '#/'; return; }
  const tab = params.tab || 'overview';
  app.innerHTML = html`
  <div class="container page">
    <h1 class="page-title">🛠 ${t('Administration', 'Administration')}</h1>
    <div class="tabs">${[['overview', t("Vue d'ensemble", 'Overview')], ['tutors', t('Validation tuteurs', 'Tutor approval')], ['disputes', t('Litiges', 'Disputes')], ['transactions', 'Transactions'], ['users', t('Utilisateurs', 'Users')]]
      .map(([k, l]) => html`<a href="#/admin?tab=${k}" class="${tab === k ? 'active' : ''}">${l}</a>`)}</div>
    <div data-body><div class="loader"></div></div>
  </div>`;
  const body = app.querySelector('[data-body]');
  const reload = () => admin(app, { params });

  if (tab === 'overview') {
    const s = await api('/admin/stats');
    const maxR = Math.max(1, ...s.revenue.map((r) => r.commission || 0));
    body.innerHTML = html`
      <div class="kpis">
        <div class="card kpi"><small>${t('Utilisateurs', 'Users')}</small><b>${s.users.total}</b><span class="small muted">${s.users.students} ${t('élèves', 'students')} · ${s.users.tutors} ${t('tuteurs', 'tutors')} · ${s.users.parents} parents</span></div>
        <div class="card kpi"><small>${t('Cours', 'Lessons')}</small><b>${s.lessons.total}</b><span class="small muted">${s.lessons.completed} ${t('terminés', 'completed')} · ${s.lessons.upcoming} ${t('à venir', 'upcoming')}</span></div>
        <div class="card kpi"><small>${t('Commissions perçues', 'Commission earned')}</small><b>${money(s.money.commission)}</b><span class="small muted">${t('Taux', 'Rate')} ${s.commission_rate} %</span></div>
        <div class="card kpi"><small>${t('En séquestre', 'In escrow')}</small><b>${money(s.money.escrow)}</b><span class="small muted">${t('Soldes', 'Wallets')} : ${money(s.money.wallets)}</span></div>
      </div>
      <div class="dash-grid two">
        <section class="card"><h3>${t('Commissions par mois', 'Commission per month')}</h3>
          ${s.revenue.length ? html`<div class="bars">${s.revenue.map((r) => html`<div class="bar-col"><div class="bar-v" style="height:${Math.round(((r.commission || 0) / maxR) * 100)}%" title="${money(r.commission)}"></div><small>${r.month.slice(5)}</small></div>`)}</div>` : '—'}
        </section>
        <section class="card"><h3>${t('Flux Mobile Money', 'Mobile Money flows')}</h3>
          <p>${t('Dépôts', 'Deposits')} : <b>${money(s.money.deposits)}</b> · ${t('Retraits', 'Withdrawals')} : <b>${money(s.money.withdrawals)}</b></p>
          ${s.by_operator.map((o) => html`<div class="line row between"><span class="op ${o.operator}">${o.operator === 'mtn' ? 'MTN MoMo' : o.operator === 'orange' ? 'Orange Money' : o.operator}</span><span>${o.n} · ${money(o.amount)}</span></div>`)}
          <form class="row gap" data-rate><label class="field grow"><span>${t('Commission plateforme (%)', 'Platform commission (%)')}</span><input name="rate" type="number" min="0" max="50" value="${s.commission_rate}"></label><button class="btn primary" type="submit">OK</button></form>
        </section>
      </div>`;
    body.querySelector('[data-rate]').onsubmit = async (e) => {
      e.preventDefault();
      await api('/admin/settings', { method: 'PUT', body: { commission_rate: Number(e.target.rate.value) } });
      toast(t('Commission mise à jour', 'Commission updated'), 'success');
    };
  }

  if (tab === 'tutors') {
    const list = await api('/admin/tutors?status=pending');
    body.innerHTML = list.length ? list.map((x) => html`<div class="card line-card"><div class="grow"><b>${x.name}</b> · ${x.email} · ${x.phone || ''}<br><small>${x.headline || '—'}</small><br>
      <small class="muted">🎓 ${x.education || '—'} · ${listOf(x.subjects)} · ${money(x.hourly_rate)}/h${x.video_url ? ' · 🎥 vidéo' : ''}</small>
      <div class="docs">${x.documents.length ? x.documents.map((d) => html`<div class="doc-row"><button class="btn ghost sm" data-doc="${d.id}">📄 ${DOC_LABEL()[d.kind]}${d.label ? ` — ${d.label}` : ''}</button>${statusBadge(d.status)}
        ${d.status === 'pending' ? html`<button class="btn primary sm" data-docok="${d.id}">✓</button><button class="btn ghost sm danger" data-docko="${d.id}">✗</button>` : ''}</div>`)
      : html`<small class="muted">${t('Aucun justificatif envoyé', 'No document uploaded')}</small>`}</div></div>
      <a class="btn ghost sm" href="#/tutor/${x.id}">${t('Voir', 'View')}</a>
      ${x.status === 'approved' ? html`<span class="badge green">${t('Profil publié', 'Live')}</span>`
        : html`<button class="btn primary sm" data-ok="${x.id}">✓ ${t('Approuver', 'Approve')}</button><button class="btn ghost sm danger" data-ko="${x.id}">✗</button>`}</div>`).join('')
      : emptyState('✅', t('Aucun tuteur ni justificatif en attente', 'Nothing pending'), '');
    body.querySelectorAll('[data-doc]').forEach((b) => { b.onclick = () => openPrivateFile(`/tutors/documents/${b.dataset.doc}/file`).catch((e) => toast(e.message, 'error')); });
    body.querySelectorAll('[data-docok]').forEach((b) => { b.onclick = async () => { await api(`/admin/documents/${b.dataset.docok}/approve`, { method: 'POST', body: {} }); reload(); }; });
    body.querySelectorAll('[data-docko]').forEach((b) => { b.onclick = async () => { await api(`/admin/documents/${b.dataset.docko}/reject`, { method: 'POST', body: { note: prompt(t('Motif (envoyé au tuteur)', 'Reason (sent to tutor)')) || '' } }); reload(); }; });
    body.querySelectorAll('[data-ok]').forEach((b) => { b.onclick = async () => { await api(`/admin/tutors/${b.dataset.ok}/approve`, { method: 'POST' }); reload(); }; });
    body.querySelectorAll('[data-ko]').forEach((b) => { b.onclick = async () => { await api(`/admin/tutors/${b.dataset.ko}/reject`, { method: 'POST', body: { reason: prompt(t('Motif du refus', 'Reason')) || '' } }); reload(); }; });
  }

  if (tab === 'disputes') {
    const list = await api('/admin/disputes');
    body.innerHTML = list.length ? list.map((d) => html`<div class="card line-card"><div class="grow"><b>${t('Cours', 'Lesson')} n°${d.id}</b> · ${d.student_name} → ${d.tutor_name} · ${money(d.price)}<br>
      <small class="muted">${fmtDate(d.start_at)}</small><p>${d.dispute_reason}</p></div>
      <button class="btn ghost sm" data-refund="${d.id}">↩ ${t("Rembourser l'élève", 'Refund student')}</button><button class="btn primary sm" data-pay="${d.id}">✓ ${t('Payer le tuteur', 'Pay tutor')}</button></div>`).join('')
      : emptyState('🕊', t('Aucun litige', 'No disputes'), '');
    body.querySelectorAll('[data-refund]').forEach((b) => { b.onclick = async () => { if (await confirmBox(t('Rembourser ?', 'Refund?'))) { await api(`/admin/disputes/${b.dataset.refund}/refund`, { method: 'POST' }); reload(); } }; });
    body.querySelectorAll('[data-pay]').forEach((b) => { b.onclick = async () => { if (await confirmBox(t('Payer le tuteur ?', 'Pay tutor?'))) { await api(`/admin/disputes/${b.dataset.pay}/pay`, { method: 'POST' }); reload(); } }; });
  }

  if (tab === 'transactions') {
    const list = await api('/admin/transactions');
    body.innerHTML = html`<div class="card table-wrap"><table class="table"><thead><tr><th>Date</th><th>${t('Utilisateur', 'User')}</th><th>Type</th><th>${t('Fournisseur', 'Provider')}</th><th>${t('Statut', 'Status')}</th><th class="num">${t('Montant', 'Amount')}</th></tr></thead><tbody>
      ${list.map((x) => html`<tr><td>${fmtDate(x.created_at.replace(' ', 'T') + 'Z')}</td><td>${x.user_name}</td><td>${x.type} ${x.operator ? html`<span class="op ${x.operator} xs">${x.operator}</span>` : ''}</td><td><code class="xs">${x.provider || ''}</code><br><code class="xs muted">${x.reference}</code></td><td>${statusBadge(x.status)}</td><td class="num">${money(x.amount)}</td></tr>`)}
      </tbody></table></div>`;
  }

  if (tab === 'users') {
    body.innerHTML = html`<form class="row gap" data-s><input name="q" placeholder="${t('Nom, e-mail, téléphone', 'Name, email, phone')}" value="${params.q || ''}"><button class="btn primary">🔍</button></form><div data-u class="card table-wrap"></div>`;
    const list = await api(`/admin/users?q=${encodeURIComponent(params.q || '')}`);
    body.querySelector('[data-u]').innerHTML = html`<table class="table"><thead><tr><th>${t('Nom', 'Name')}</th><th>E-mail</th><th>${t('Rôle', 'Role')}</th><th class="num">${t('Solde', 'Balance')}</th><th></th></tr></thead><tbody>
      ${list.map((x) => html`<tr><td>${x.name}</td><td>${x.email}<br><small class="muted">${x.phone || ''}</small></td><td>${x.role}</td><td class="num">${money(x.wallet_balance)}</td><td class="row gap"><button class="btn ghost sm" data-reset="${x.id}" data-name="${x.name}">🔑 ${t('Lien mot de passe', 'Reset link')}</button>${x.role !== 'admin' ? html`<button class="btn ghost sm ${x.is_blocked ? '' : 'danger'}" data-block="${x.id}">${x.is_blocked ? t('Débloquer', 'Unblock') : t('Bloquer', 'Block')}</button>` : ''}</td></tr>`)}
      </tbody></table>`;
    body.querySelector('[data-s]').onsubmit = (e) => { e.preventDefault(); location.hash = `#/admin?tab=users&q=${encodeURIComponent(e.target.q.value)}`; };
    body.querySelectorAll('[data-reset]').forEach((b) => {
      b.onclick = async () => {
        const r = await api(`/admin/users/${b.dataset.reset}/reset-link`, { method: 'POST' });
        modal(html`<h2>${t('Lien de réinitialisation', 'Reset link')}</h2><p class="muted">${t('Envoyez ce lien à', 'Send this link to')} <b>${b.dataset.name}</b> ${t('(WhatsApp, SMS…). Il est valable 1 heure et ne fonctionne qu\'une fois.', '(valid 1 hour, single use).')}</p>
          <input readonly value="${r.url}" data-url><div class="row gap end" style="margin-top:12px"><a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`${t('Votre lien pour choisir un nouveau mot de passe MboaLearn :', 'Your MboaLearn password reset link:')} ${r.url}`)}">WhatsApp</a><button class="btn primary" data-copy>${t('Copier', 'Copy')}</button></div>`);
        const m = document.querySelector('.modal');
        m.querySelector('[data-copy]').onclick = () => { navigator.clipboard?.writeText(r.url); toast(t('Lien copié', 'Link copied'), 'success'); };
        m.querySelector('[data-url]').select();
      };
    });
    body.querySelectorAll('[data-block]').forEach((b) => { b.onclick = async () => { await api(`/admin/users/${b.dataset.block}/block`, { method: 'POST' }); reload(); }; });
  }
}
