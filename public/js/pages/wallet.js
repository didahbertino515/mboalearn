import { state, api, t, html, money, fmtDate, toast, modal, loadMe } from '../core.js';
import { statusBadge, emptyState } from '../components.js';
import { openDeposit } from '../payflow.js';
import { renderHeader } from '../app.js';

const TYPE_LABEL = () => ({
  deposit: t('Recharge', 'Top-up'), withdrawal: t('Retrait', 'Withdrawal'), payment: t('Paiement cours', 'Lesson payment'),
  refund: t('Remboursement', 'Refund'), earning: t('Gain', 'Earning'), bonus: t('Bonus', 'Bonus'),
});

export default async function wallet(app, { params }) {
  if (params.ref) await api(`/payments/status/${params.ref}`).catch(() => null);
  const w = await api('/payments/wallet');
  const u = state.user;
  const isTutor = u.role === 'tutor' || u.role === 'admin';
  const labels = TYPE_LABEL();
  app.innerHTML = html`
  <div class="container page">
    <h1 class="page-title">💰 ${t('Portefeuille', 'Wallet')}</h1>
    <div class="kpis">
      <div class="card kpi highlight"><small>${t('Solde disponible', 'Available balance')}</small><b>${money(w.wallet_balance, 'XAF')}</b>${state.currency !== 'XAF' ? html`<span class="small">≈ ${money(w.wallet_balance)}</span>` : ''}
        <div class="row gap"><button class="btn accent sm" data-dep>+ ${t('Recharger', 'Top up')}</button>${isTutor ? html`<button class="btn ghost sm light" data-wd>↗ ${t('Retirer', 'Withdraw')}</button>` : ''}</div></div>
      ${isTutor ? html`
        <div class="card kpi"><small>${t('Gains ce mois', 'Earned this month')}</small><b>${money(w.earned_month)}</b></div>
        <div class="card kpi"><small>${t('Gains totaux', 'Total earned')}</small><b>${money(w.earned)}</b></div>
        <div class="card kpi"><small>${t('Déjà retiré', 'Withdrawn')}</small><b>${money(w.withdrawn)}</b></div>`
      : html`<div class="card kpi"><small>${t('En séquestre', 'In escrow')}</small><b>${money(w.held_balance)}</b><span class="small muted">${t('Versé au tuteur après chaque cours', 'Released after each lesson')}</span></div>`}
    </div>
    <div class="card pay-info">
      <div><b class="op mtn">MTN Mobile Money</b><small>${t('Validation par *126#', 'Approve via *126#')}</small></div>
      <div><b class="op orange">Orange Money</b><small>${t('Validation par #150*50#', 'Approve via #150*50#')}</small></div>
      <div><b class="op card">Visa / Mastercard</b><small>${state.payConfig?.card_enabled ? t('Pour la diaspora', 'For the diaspora') : t('Bientôt disponible', 'Coming soon')}</small></div>
      <div><b>🔒 ${t('Séquestre', 'Escrow')}</b><small>${t('Votre argent est protégé jusqu\'à la fin du cours', 'Protected until the lesson ends')}</small></div>
    </div>
    <section class="card">
      <h3>${t('Historique des transactions', 'Transaction history')}</h3>
      ${w.transactions.length ? html`<div class="table-wrap"><table class="table">
        <thead><tr><th>${t('Date', 'Date')}</th><th>${t('Type', 'Type')}</th><th>${t('Détails', 'Details')}</th><th>${t('Statut', 'Status')}</th><th class="num">${t('Montant', 'Amount')}</th></tr></thead>
        <tbody>${w.transactions.map((x) => html`<tr>
          <td>${fmtDate(x.created_at.replace(' ', 'T') + 'Z')}</td>
          <td>${labels[x.type] || x.type}${x.operator === 'mtn' ? html` <span class="op mtn xs">MTN</span>` : x.operator === 'orange' ? html` <span class="op orange xs">OM</span>` : ''}</td>
          <td class="small">${x.description || ''}<br><code class="muted xs">${x.reference}</code></td>
          <td>${statusBadge(x.status)}</td>
          <td class="num ${['withdrawal', 'payment'].includes(x.type) || x.amount < 0 ? 'neg' : 'pos'}">${['withdrawal'].includes(x.type) ? '−' : x.amount > 0 ? '+' : ''}${money(Math.abs(x.amount), 'XAF')}</td></tr>`)}
        </tbody></table></div>` : emptyState('🧾', t('Aucune transaction', 'No transactions'), '')}
    </section>
  </div>`;
  const refresh = async () => { await loadMe(); renderHeader(); wallet(app, { params: {} }); };
  app.querySelector('[data-dep]').onclick = async () => { if (await openDeposit()) refresh(); };
  app.querySelector('[data-wd]')?.addEventListener('click', () => withdrawModal(w, refresh));
}

function withdrawModal(w, done) {
  const p = state.user.profile || {};
  const m = modal(html`
    <h2>${t('Retirer mes gains', 'Withdraw earnings')}</h2>
    <p class="muted">${t('Disponible', 'Available')} : <b>${money(w.wallet_balance, 'XAF')}</b> · ${t('minimum', 'minimum')} ${money(state.payConfig?.min_withdrawal || 1000, 'XAF')}</p>
    <form class="stack" data-f>
      <label class="field"><span>${t('Montant (FCFA)', 'Amount (FCFA)')}</span><input name="amount" type="number" min="1000" max="${w.wallet_balance}" value="${w.wallet_balance}" required></label>
      <label class="field"><span>${t('Numéro MTN MoMo / Orange Money', 'MTN MoMo / Orange Money number')}</span><div class="phone-input"><span>+237</span><input name="phone" required value="${(p.payout_phone || state.user.phone || '').replace(/^237/, '')}"></div></label>
      <p class="small muted">${t("Le transfert est immédiat. Les frais de l'opérateur sont pris en charge par MboaLearn.", 'Transfers are instant. Operator fees are covered by MboaLearn.')}</p>
      <button class="btn primary" type="submit">${t('Retirer', 'Withdraw')}</button>
    </form>`);
  m.el.querySelector('[data-f]').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const r = await api('/payments/withdraw', { method: 'POST', body: { amount: Number(e.target.amount.value), phone: e.target.phone.value } });
      m.close();
      toast(r.status === 'success' ? t('Retrait effectué !', 'Withdrawal completed!') : t('Retrait en cours de traitement', 'Withdrawal processing'), 'success');
      done();
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  };
}
