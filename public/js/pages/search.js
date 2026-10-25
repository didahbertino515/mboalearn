import { api, t, html, qs, SUBJECTS, LEVELS } from '../core.js';
import { tutorCard, bindFavorites, emptyState } from '../components.js';

export default async function search(app, { params }) {
  const category = params.category === 'scolaire' ? 'scolaire' : params.category === 'langue' ? 'langue' : '';
  const subjects = category ? SUBJECTS[category] : [...new Set([...SUBJECTS.langue, ...SUBJECTS.scolaire])];
  const levels = category ? LEVELS[category] : [...LEVELS.langue, ...LEVELS.scolaire];
  const sel = (name, options, label) => html`
    <label class="field"><span>${label}</span><select name="${name}">
      <option value="">${t('Tous', 'All')}</option>
      ${options.map(([v, l]) => html`<option value="${v}" ${params[name] === v ? 'selected' : ''}>${l}</option>`)}
    </select></label>`;

  app.innerHTML = html`
  <div class="container page">
    <div class="tabs">
      <a class="${!category ? 'active' : ''}" href="#/search">${t('Tout', 'All')}</a>
      <a class="${category === 'langue' ? 'active' : ''}" href="#/search?category=langue">🌍 ${t('Langues', 'Languages')}</a>
      <a class="${category === 'scolaire' ? 'active' : ''}" href="#/search?category=scolaire">📚 ${t('Soutien scolaire', 'School tutoring')}</a>
    </div>
    <h1 class="page-title" data-title></h1>
    <div class="search-layout">
      <form class="filters card" data-filters>
        <label class="field"><span>${t('Recherche', 'Search')}</span><input name="q" value="${params.q || ''}" placeholder="${t('Nom, spécialité (IELTS, Bac C…)', 'Name, specialty (IELTS…)')}"></label>
        ${sel('subject', subjects.map((s) => [s, s]), category === 'langue' ? t('Langue à apprendre', 'Language to learn') : t('Matière', 'Subject'))}
        ${sel('level', levels.map((s) => [s, s]), t('Niveau / examen', 'Level / exam'))}
        ${sel('speaks', ['Français', 'Anglais', 'Pidgin', 'Espagnol', 'Allemand', 'Arabe', 'Duala', 'Ewondo', 'Fulfulde', 'Bassa'].map((s) => [s, s]), t('Le tuteur parle', 'Tutor speaks'))}
        <div class="field"><span>${t('Prix par heure (FCFA)', 'Price per hour (FCFA)')}</span>
          <div class="row gap"><input name="min_price" type="number" min="0" step="500" placeholder="Min" value="${params.min_price || ''}"><input name="max_price" type="number" min="0" step="500" placeholder="Max" value="${params.max_price || ''}"></div>
        </div>
        ${sel('when', [['morning', t('Matin (6h-12h)', 'Morning')], ['afternoon', t('Après-midi (12h-18h)', 'Afternoon')], ['evening', t('Soir (18h-24h)', 'Evening')], ['weekend', t('Week-end', 'Weekend')]], t('Disponibilité', 'Availability'))}
        ${sel('city', ['Yaoundé', 'Douala', 'Buea', 'Bamenda', 'Bafoussam', 'Garoua', 'Edéa'].map((s) => [s, s]), t('Ville du tuteur', 'Tutor city'))}
        <label class="check"><input type="checkbox" name="native" ${params.native === '1' ? 'checked' : ''}> ${t('Locuteur natif', 'Native speaker')}</label>
        <label class="check"><input type="checkbox" name="super" ${params.super === '1' ? 'checked' : ''}> ⭐ ${t('Super tuteurs uniquement', 'Super tutors only')}</label>
        <label class="check"><input type="checkbox" name="home" ${params.home === '1' ? 'checked' : ''}> 🏠 ${t('Cours à domicile possibles', 'Home lessons available')}</label>
        ${sel('sort', [['rating', t('Meilleures notes', 'Best rated')], ['price_asc', t('Prix croissant', 'Price: low to high')], ['price_desc', t('Prix décroissant', 'Price: high to low')], ['popular', t('Plus de cours donnés', 'Most lessons')], ['new', t('Nouveaux tuteurs', 'New tutors')]], t('Trier par', 'Sort by'))}
        <button class="btn primary block" type="submit">${t('Appliquer', 'Apply')}</button>
        <a class="btn ghost block" href="#/search${category ? `?category=${category}` : ''}">${t('Réinitialiser', 'Reset')}</a>
      </form>
      <div data-results><div class="loader"></div></div>
    </div>
  </div>`;

  const form = app.querySelector('[data-filters]');
  form.onsubmit = (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    ['native', 'super', 'home'].forEach((k) => { data[k] = form[k].checked ? '1' : ''; });
    location.hash = `#/search?${qs({ category, ...data })}`;
  };
  form.querySelectorAll('select, input[type=checkbox]').forEach((el) => { el.onchange = () => form.requestSubmit(); });

  const PAGE = 20;
  const res = await api(`/tutors?${qs({ ...params, category, limit: PAGE })}`);
  app.querySelector('[data-title]').textContent = `${res.total} ${t('tuteurs', 'tutors')}${params.subject ? ` — ${params.subject}` : ''}`;
  const results = app.querySelector('[data-results]');
  if (!res.items.length) {
    results.innerHTML = emptyState('🔍', t('Aucun tuteur ne correspond', 'No tutor matches'), t('Élargissez vos critères de recherche.', 'Try broadening your filters.'));
    return;
  }
  results.innerHTML = html`<div class="tutor-list" data-list>${res.items.map(tutorCard)}</div><div class="load-more" data-more></div>`;
  const list = results.querySelector('[data-list]');
  const more = results.querySelector('[data-more]');
  let shown = res.items.length;
  const drawMore = () => {
    more.innerHTML = shown < res.total ? html`<button class="btn ghost">${t('Voir plus de tuteurs', 'Show more tutors')} (${res.total - shown})</button>` : '';
    more.querySelector('button')?.addEventListener('click', async (e) => {
      e.target.disabled = true;
      const next = await api(`/tutors?${qs({ ...params, category, limit: PAGE, offset: shown })}`);
      list.insertAdjacentHTML('beforeend', next.items.map(tutorCard).join(''));
      shown += next.items.length;
      bindFavorites(list);
      drawMore();
    });
  };
  drawMore();
  bindFavorites(list);
}
