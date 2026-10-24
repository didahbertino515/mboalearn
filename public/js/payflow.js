// Parcours de recharge : MTN Mobile Money, Orange Money ou carte bancaire
import { state, api, t, html, modal, money, toast, loadMe } from './core.js';
import { renderHeader } from './app.js';

export function openDeposit(suggested = 5000) {
  return new Promise((resolve) => {
    const cfg = state.payConfig || { min_deposit: 500, card_enabled: false, simulator: true };
    let done = false;
    const m = modal(html`
      <h2>${t('Recharger mon portefeuille', 'Top up my wallet')}</h2>
      <p class="muted small">${t('Le solde sert à payer vos cours. Il reste bloqué en séquestre jusqu\'à la fin de chaque cours.', 'Your balance pays for lessons and is held in escrow until each lesson ends.')}</p>
      <form data-dep class="stack">
        <div class="pay-methods">
          <label class="pay-method"><input type="radio" name="method" value="momo" checked><span><b class="op mtn">MTN</b><b class="op orange">Orange</b> Mobile Money</span></label>
          <label class="pay-method ${cfg.card_enabled ? '' : 'disabled'}"><input type="radio" name="method" value="card" ${cfg.card_enabled ? '' : 'disabled'}><span>💳 ${t('Carte bancaire (diaspora)', 'Bank card (diaspora)')}</span></label>
        </div>
        <label class="field"><span>${t('Montant (FCFA)', 'Amount (FCFA)')}</span>
          <input name="amount" type="number" min="${cfg.min_deposit}" step="100" value="${Math.max(suggested, cfg.min_deposit)}" required>
        </label>
        <div class="chips">${[2500, 5000, 10000, 25000, 50000].map((v) => html`<button type="button" class="chip btnchip" data-amt="${v}">${money(v, 'XAF')}</button>`)}</div>
        <label class="field" data-phone-field><span>${t('Numéro Mobile Money', 'Mobile Money number')}</span>
          <div class="phone-input"><span>+237</span><input name="phone" inputmode="tel" placeholder="6XX XX XX XX" value="${(state.user?.phone || '').replace(/^237/, '')}"></div>
          <small data-op class="muted"></small>
        </label>
        ${cfg.simulator ? html`<p class="notice">🧪 ${t('Mode test : aucun argent réel ne sera débité.', 'Test mode: no real money will be charged.')}</p>` : ''}
        <button class="btn primary block" type="submit">${t('Payer', 'Pay')}</button>
      </form>
      <div data-wait hidden class="center stack">
        <div class="loader"></div>
        <h3>${t('Validez le paiement sur votre téléphone', 'Confirm the payment on your phone')}</h3>
        <p class="muted" data-instructions></p>
        <div class="row center gap" data-sim hidden>
          <button class="btn primary" data-ok>✓ ${t('Simuler la validation', 'Simulate approval')}</button>
          <button class="btn ghost" data-ko>✗ ${t('Simuler un refus', 'Simulate failure')}</button>
        </div>
      </div>`, { onClose: () => { if (!done) { done = true; resolve(false); } } });

    const form = m.el.querySelector('[data-dep]');
    const opEl = m.el.querySelector('[data-op]');
    m.el.querySelectorAll('[data-amt]').forEach((b) => { b.onclick = () => { form.amount.value = b.dataset.amt; }; });
    const syncMethod = () => { m.el.querySelector('[data-phone-field]').hidden = form.method.value !== 'momo'; };
    form.querySelectorAll('[name=method]').forEach((r) => { r.onchange = syncMethod; });
    form.phone.oninput = async () => {
      const v = form.phone.value.replace(/\D/g, '');
      if (v.length < 9) { opEl.textContent = ''; return; }
      const r = await api(`/payments/operator?phone=${v}`);
      opEl.innerHTML = r.operator === 'mtn' ? '<b class="op mtn">MTN Mobile Money</b> ✓' : r.operator === 'orange' ? '<b class="op orange">Orange Money</b> ✓' : `<span class="err">${t('Numéro non reconnu', 'Unknown number')}</span>`;
    };
    form.phone.oninput();

    const finish = async (ok) => {
      if (done) return;
      done = true;
      await loadMe();
      renderHeader();
      m.close();
      toast(ok ? t('Recharge réussie !', 'Top-up successful!') : t('Paiement échoué ou annulé', 'Payment failed or cancelled'), ok ? 'success' : 'error');
      resolve(ok);
    };

    form.onsubmit = async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        const r = await api('/payments/deposit', { method: 'POST', body: { amount: Number(form.amount.value), phone: form.phone.value, method: form.method.value } });
        if (r.redirectUrl) { location.href = r.redirectUrl; return; }
        form.hidden = true;
        const wait = m.el.querySelector('[data-wait]');
        wait.hidden = false;
        m.el.querySelector('[data-instructions]').textContent = r.instructions || '';
        if (r.provider === 'simulator') {
          m.el.querySelector('[data-sim]').hidden = false;
          m.el.querySelector('[data-ok]').onclick = async () => { await api(`/payments/simulate/${r.reference}`, { method: 'POST', body: {} }); finish(true); };
          m.el.querySelector('[data-ko]').onclick = async () => { await api(`/payments/simulate/${r.reference}`, { method: 'POST', body: { fail: true } }); finish(false); };
        } else {
          // Interrogation périodique du statut (le webhook peut aussi finaliser)
          const poll = async (n = 0) => {
            if (done) return;
            const s = await api(`/payments/status/${r.reference}`).catch(() => null);
            if (s?.status === 'success') return finish(true);
            if (s?.status === 'failed') return finish(false);
            if (n < 60) setTimeout(() => poll(n + 1), 4000);
          };
          poll();
        }
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
      }
    };
  });
}
