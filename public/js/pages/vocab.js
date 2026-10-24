import { api, t, html, toast, onSubmit } from '../core.js';

export default async function vocab(app) {
  const data = await api('/learning/vocab');
  app.innerHTML = html`
  <div class="container page">
    <h1 class="page-title">🧠 ${t('Mon vocabulaire', 'My vocabulary')}</h1>
    <p class="muted">${t('Les mots notés pendant vos cours sont révisés selon la méthode de répétition espacée (Leitner) : vous les revoyez juste avant de les oublier.', 'Words saved during lessons are reviewed with spaced repetition (Leitner).')}</p>
    <div class="dash-grid two">
      <section class="card flash-wrap">
        <h3>${t('Révision du jour', "Today's review")} · <span data-left>${data.due.length}</span></h3>
        <div data-flash></div>
      </section>
      <section class="card">
        <h3>+ ${t('Ajouter un mot', 'Add a word')}</h3>
        <form class="stack" data-add>
          <input name="word" placeholder="${t('Mot ou expression', 'Word or phrase')}" required>
          <input name="translation" placeholder="${t('Traduction', 'Translation')}">
          <input name="example" placeholder="${t('Exemple', 'Example')}">
          <button class="btn primary" type="submit">${t('Ajouter', 'Add')}</button>
        </form>
      </section>
    </div>
    <section class="card"><h3>${t('Tous mes mots', 'All my words')} (${data.items.length})</h3>
      <div class="vocab-grid">${data.items.map((v) => html`<div class="vocab-item"><b>${v.word}</b><span>${v.translation}</span><small class="muted">${t('Boîte', 'Box')} ${v.box}/5</small><button class="x" data-del="${v.id}" aria-label="Supprimer">×</button></div>`)}</div>
    </section>
  </div>`;
  const queue = [...data.due];
  const flash = app.querySelector('[data-flash]');
  const show = () => {
    app.querySelector('[data-left]').textContent = queue.length;
    const v = queue[0];
    if (!v) { flash.innerHTML = html`<div class="empty"><div class="empty-icon">🎉</div><p>${t('Révision terminée pour aujourd\'hui !', 'Done for today!')}</p></div>`; return; }
    flash.innerHTML = html`<div class="flashcard" data-card><div class="front">${v.word}</div><div class="back" hidden><b>${v.translation}</b><small>${v.example}</small></div></div>
      <div class="row center gap"><button class="btn ghost" data-flip>${t('Voir la réponse', 'Show answer')}</button></div>
      <div class="row center gap" data-grade hidden><button class="btn ghost danger" data-k="0">✗ ${t('À revoir', 'Again')}</button><button class="btn primary" data-k="1">✓ ${t('Je savais', 'I knew it')}</button></div>`;
    flash.querySelector('[data-flip]').onclick = () => { flash.querySelector('.back').hidden = false; flash.querySelector('[data-grade]').hidden = false; flash.querySelector('[data-flip]').hidden = true; };
    flash.querySelectorAll('[data-k]').forEach((b) => {
      b.onclick = async () => {
        await api(`/learning/vocab/${v.id}/review`, { method: 'POST', body: { known: b.dataset.k === '1' } });
        queue.shift();
        if (b.dataset.k === '0') queue.push(v);
        show();
      };
    });
  };
  show();
  onSubmit(app.querySelector('[data-add]'), async (d) => { await api('/learning/vocab', { method: 'POST', body: d }); toast(t('Mot ajouté', 'Word added'), 'success'); vocab(app); });
  app.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { await api(`/learning/vocab/${b.dataset.del}`, { method: 'DELETE' }); vocab(app); }; });
}
