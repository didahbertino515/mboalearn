import { state, api, t, html, toast, onSubmit, fileToDataUrl, loadMe, avatar, modal, logout, openPrivateFile, SUBJECTS, LEVELS, WEEKDAYS } from '../core.js';
import { statusBadge } from '../components.js';
import { DOC_LABEL } from './admin.js';
import { renderHeader } from '../app.js';

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

export default async function settings(app) {
  await loadMe();
  const u = state.user;
  const p = u.profile;
  const tutorData = u.role === 'tutor' ? await api(`/tutors/${u.id}`) : null;
  const checks = (name, options, selected) => html`<div class="check-grid">${options.map((o) => html`<label class="check"><input type="checkbox" name="${name}" value="${o}" ${selected.includes(o) ? 'checked' : ''}> ${o}</label>`)}</div>`;

  app.innerHTML = html`
  <div class="container page narrow">
    <h1 class="page-title">⚙️ ${t('Paramètres', 'Settings')}</h1>
    <form class="card stack" data-account>
      <h2>${t('Mon compte', 'My account')}</h2>
      <div class="row gap">${avatar(u.name, u.avatar, 72)}<label class="btn ghost sm">${t('Changer la photo', 'Change photo')}<input type="file" accept="image/png,image/jpeg,image/webp" hidden data-avatar></label></div>
      <div class="row gap wrap">
        <label class="field grow"><span>${t('Nom', 'Name')}</span><input name="name" value="${u.name}" required></label>
        <label class="field grow"><span>${t('Téléphone', 'Phone')}</span><div class="phone-input"><span>+237</span><input name="phone" value="${(u.phone || '').replace(/^237/, '')}"></div></label>
      </div>
      <div class="row gap wrap">
        <label class="field grow"><span>${t('Ville', 'City')}</span><input name="city" value="${u.city || ''}"></label>
        <label class="field grow"><span>${t('Pays', 'Country')}</span><input name="country" value="${u.country || ''}"></label>
        <label class="field"><span>${t('Langue', 'Language')}</span><select name="ui_lang"><option value="fr" ${u.ui_lang === 'fr' ? 'selected' : ''}>Français</option><option value="en" ${u.ui_lang === 'en' ? 'selected' : ''}>English</option></select></label>
      </div>
      <label class="field"><span>${t('Nouveau mot de passe (facultatif)', 'New password (optional)')}</span><input name="password" type="password" minlength="8" autocomplete="new-password"></label>
      <button class="btn primary" type="submit">${t('Enregistrer', 'Save')}</button>
    </form>

    ${p ? html`
    <form class="card stack" data-profile>
      <h2>${t('Mon profil de tuteur', 'My tutor profile')} ${p.status === 'approved' ? html`<span class="badge green">${t('Publié', 'Live')}</span>` : html`<span class="badge amber">${t('En vérification', 'Under review')}</span>`}</h2>
      <label class="field"><span>${t('Titre accrocheur', 'Headline')}</span><input name="headline" value="${p.headline || ''}" maxlength="120" required placeholder="${t('Ex : Prof certifié de Maths — Bac C & D', 'e.g. Certified maths teacher')}"></label>
      <label class="field"><span>${t('Présentation', 'About you')}</span><textarea name="bio" rows="6" required>${p.bio || ''}</textarea></label>
      <label class="field"><span>${t('Vidéo de présentation (lien YouTube)', 'Intro video (YouTube link)')}</span><input name="video_url" value="${p.video_url || ''}" placeholder="https://youtu.be/…"></label>
      <div class="row gap wrap">
        <label class="field grow"><span>${t('Tarif horaire (FCFA)', 'Hourly rate (FCFA)')}</span><input name="hourly_rate" type="number" min="1000" step="500" value="${p.hourly_rate}" required></label>
        <label class="field grow"><span>${t("Cours d'essai (FCFA, 0 = gratuit)", 'Trial (FCFA, 0 = free)')}</span><input name="trial_rate" type="number" min="0" step="500" value="${p.trial_rate}"></label>
        <label class="field grow"><span>${t('Catégorie', 'Category')}</span><select name="category">${[['langue', t('Langues', 'Languages')], ['scolaire', t('Soutien scolaire', 'Tutoring')], ['both', t('Les deux', 'Both')]].map(([v, l]) => html`<option value="${v}" ${p.category === v ? 'selected' : ''}>${l}</option>`)}</select></label>
      </div>
      <p class="small muted">${t('Vous recevez', 'You receive')} ${100 - (state.payConfig?.commission_rate ?? 12)} % ${t('du prix de chaque cours, y compris les cours d\'essai.', 'of every lesson price, including trials.')}</p>
      <fieldset><legend>${t('Matières / langues enseignées', 'Subjects taught')}</legend>${checks('subjects', [...new Set([...SUBJECTS.langue, ...SUBJECTS.scolaire])], p.subjects)}</fieldset>
      <fieldset><legend>${t('Niveaux', 'Levels')}</legend>${checks('levels', [...LEVELS.langue, ...LEVELS.scolaire], p.levels)}</fieldset>
      <div class="row gap wrap">
        <label class="field grow"><span>${t('Langues parlées (séparées par des virgules)', 'Languages spoken (comma separated)')}</span><input name="languages" value="${p.languages.join(', ')}"></label>
        <label class="field grow"><span>${t('Langue maternelle', 'Native language')}</span><input name="native_language" value="${p.native_language || ''}"></label>
      </div>
      <label class="field"><span>${t('Spécialités (IELTS, Bac C, concours…)', 'Specialties')}</span><input name="specialties" value="${p.specialties.join(', ')}"></label>
      <div class="row gap wrap">
        <label class="field grow"><span>${t('Formation / diplômes', 'Education')}</span><input name="education" value="${p.education || ''}"></label>
        <label class="field grow"><span>${t('Certificats', 'Certificates')}</span><input name="certificates" value="${p.certificates || ''}"></label>
        <label class="field"><span>${t("Années d'expérience", 'Years of experience')}</span><input name="experience_years" type="number" min="0" max="60" value="${p.experience_years || 0}"></label>
      </div>
      <div class="row gap wrap">
        <label class="field grow"><span>${t('Numéro de versement (MoMo / OM)', 'Payout number (MoMo / OM)')}</span><div class="phone-input"><span>+237</span><input name="payout_phone" value="${(p.payout_phone || '').replace(/^237/, '')}"></div></label>
        <label class="field"><span>${t('Fuseau horaire', 'Time zone')}</span><select name="tz_offset">${[[60, 'Douala / Yaoundé (UTC+1)'], [0, 'UTC / Londres'], [120, 'Paris été (UTC+2)'], [-300, 'New York (UTC-5)'], [-240, 'Montréal été (UTC-4)']].map(([v, l]) => html`<option value="${v}" ${p.tz_offset === v ? 'selected' : ''}>${l}</option>`)}</select></label>
      </div>
      <label class="check"><input type="checkbox" name="instant_book" ${p.instant_book ? 'checked' : ''}> ${t('Réservation instantanée', 'Instant booking')}</label>
      <label class="check"><input type="checkbox" name="home_lessons" ${p.home_lessons ? 'checked' : ''}> ${t('Je propose aussi des cours à domicile dans ma ville', 'I also offer home lessons in my city')}</label>
      <button class="btn primary" type="submit">${t('Enregistrer mon profil', 'Save profile')}</button>
    </form>

    <section class="card stack">
      <h2>${t('Mes disponibilités hebdomadaires', 'Weekly availability')}</h2>
      <p class="small muted">${t('Les élèves ne peuvent réserver que dans ces plages (préavis minimum 2h).', 'Students can only book in these windows (2h notice).')}</p>
      <div data-avail></div>
      <div class="row gap"><button class="btn ghost sm" data-addslot>+ ${t('Ajouter une plage', 'Add a window')}</button><button class="btn primary" data-saveavail>${t('Enregistrer les disponibilités', 'Save availability')}</button></div>
    </section>

    <section class="card stack">
      <h2>🛡 ${t('Vérification du profil', 'Profile verification')}
        ${p.id_verified ? html`<span class="badge green">✔ ${t('Identité vérifiée', 'ID verified')}</span>` : ''}
        ${p.diploma_verified ? html`<span class="badge green">🎓 ${t('Diplôme vérifié', 'Diploma verified')}</span>` : ''}</h2>
      <p class="small muted">${t("Envoyez votre pièce d'identité (CNI, passeport) et vos diplômes. Ils ne sont visibles que par l'équipe de vérification et ne sont jamais publiés. Les profils vérifiés inspirent davantage confiance aux parents.", 'Upload your ID and diplomas. Only the verification team can see them.')}</p>
      <div data-docs></div>
      <form class="row gap wrap" data-docform>
        <select name="kind" class="grow"><option value="id">${DOC_LABEL().id}</option><option value="diploma">${DOC_LABEL().diploma}</option><option value="other">${DOC_LABEL().other}</option></select>
        <input name="label" class="grow" placeholder="${t('Précision (ex : Licence d\'anglais)', 'Details (e.g. English degree)')}">
        <label class="btn ghost">📎 ${t('Choisir le fichier', 'Choose file')}<input type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf" hidden required></label>
        <button class="btn primary" type="submit">${t('Envoyer', 'Upload')}</button>
      </form>
      <small class="muted">${t('PDF ou photo, 5 Mo maximum.', 'PDF or photo, 5 MB max.')}</small>
    </section>` : ''}

    <section class="card stack">
      <h2>🔒 ${t('Mes données', 'My data')}</h2>
      <p class="small muted">${t('Téléchargez une copie de toutes vos données, ou supprimez définitivement votre compte.', 'Download a copy of your data, or permanently delete your account.')} <a href="#/legal/privacy">${t('Politique de confidentialité', 'Privacy policy')}</a></p>
      <div class="row gap wrap">
        <button class="btn ghost" data-export>⬇ ${t('Télécharger mes données', 'Download my data')}</button>
        ${u.role !== 'admin' ? html`<button class="btn ghost danger" data-delete>🗑 ${t('Supprimer mon compte', 'Delete my account')}</button>` : ''}
      </div>
    </section>
  </div>`;

  let avatarData = null;
  app.querySelector('[data-avatar]').onchange = async (e) => { avatarData = await fileToDataUrl(e.target.files[0]); toast(t('Photo prête, cliquez sur Enregistrer', 'Photo ready, click Save')); };
  onSubmit(app.querySelector('[data-account]'), async (d) => {
    if (!d.password) delete d.password;
    if (avatarData) d.avatar_data = avatarData;
    await api('/auth/me', { method: 'PUT', body: d });
    await loadMe();
    state.lang = state.user.ui_lang;
    renderHeader();
    toast(t('Compte mis à jour', 'Account updated'), 'success');
  });

  app.querySelector('[data-export]').onclick = async () => {
    try {
      const res = await fetch('/api/auth/export', { headers: { Authorization: `Bearer ${state.token}` } });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t('Export impossible', 'Export failed'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await res.blob());
      a.download = `mboalearn-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
    } catch (e) { toast(e.message, 'error'); }
  };
  app.querySelector('[data-delete]')?.addEventListener('click', () => {
    const m = modal(html`<h2>${t('Supprimer mon compte', 'Delete my account')}</h2>
      <p>${t('Cette action est définitive. Votre profil, votre vocabulaire, vos favoris et vos notifications seront effacés ; vos cours et paiements passés seront conservés de façon anonyme pour la comptabilité.', 'This is permanent. Your profile and personal data will be erased; past lessons and payments are kept anonymously for accounting.')}</p>
      <p class="small muted">${t('Votre solde doit être à zéro et vous ne devez pas avoir de cours à venir.', 'Your balance must be zero with no upcoming lessons.')}</p>
      <form class="stack" data-f><label class="field"><span>${t('Confirmez avec votre mot de passe', 'Confirm with your password')}</span><input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn primary danger-bg" type="submit">${t('Supprimer définitivement', 'Delete permanently')}</button></form>`);
    onSubmit(m.el.querySelector('[data-f]'), async (d) => {
      await api('/auth/me', { method: 'DELETE', body: d });
      m.close();
      toast(t('Votre compte a été supprimé.', 'Your account has been deleted.'), 'success');
      logout();
    });
  });

  if (!p) return;

  const docsBox = app.querySelector('[data-docs]');
  const drawDocs = async () => {
    const docs = await api('/tutors/me/documents');
    docsBox.innerHTML = docs.length ? docs.map((d) => html`<div class="doc-row">
      <button class="btn ghost sm" data-open="${d.id}">📄 ${DOC_LABEL()[d.kind]}${d.label ? ` — ${d.label}` : ''}</button>${statusBadge(d.status)}
      ${d.note ? html`<small class="muted">${d.note}</small>` : ''}
      ${d.status !== 'approved' ? html`<button class="btn ghost sm danger" data-rmdoc="${d.id}">×</button>` : ''}</div>`).join('')
      : html`<p class="muted small">${t('Aucun justificatif envoyé.', 'No document yet.')}</p>`;
    docsBox.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => openPrivateFile(`/tutors/documents/${b.dataset.open}/file`).catch((e) => toast(e.message, 'error')); });
    docsBox.querySelectorAll('[data-rmdoc]').forEach((b) => { b.onclick = async () => { await api(`/tutors/me/documents/${b.dataset.rmdoc}`, { method: 'DELETE' }); drawDocs(); }; });
  };
  drawDocs();
  const docForm = app.querySelector('[data-docform]');
  docForm.file.onchange = () => { docForm.querySelector('label.btn').firstChild.textContent = `📎 ${docForm.file.files[0]?.name.slice(0, 24) || ''}`; };
  docForm.onsubmit = async (e) => {
    e.preventDefault();
    const f = docForm.file.files[0];
    if (!f) return toast(t('Choisissez un fichier', 'Choose a file'), 'error');
    if (f.size > 5 * 1024 * 1024) return toast(t('Fichier trop volumineux (5 Mo max)', 'File too large (5 MB max)'), 'error');
    try {
      await api('/tutors/me/documents', { method: 'POST', body: { kind: docForm.kind.value, label: docForm.label.value, data: await fileToDataUrl(f) } });
      toast(t('Justificatif envoyé : il sera vérifié rapidement.', 'Document uploaded.'), 'success');
      docForm.reset();
      docForm.querySelector('label.btn').firstChild.textContent = `📎 ${t('Choisir le fichier', 'Choose file')}`;
      drawDocs();
    } catch (err) { toast(err.message, 'error'); }
  };
  const pf = app.querySelector('[data-profile]');
  onSubmit(pf, async (d) => {
    d.subjects = [...pf.querySelectorAll('[name=subjects]:checked')].map((c) => c.value);
    d.levels = [...pf.querySelectorAll('[name=levels]:checked')].map((c) => c.value);
    if (!d.subjects.length) throw new Error(t('Choisissez au moins une matière', 'Pick at least one subject'));
    await api('/tutors/me/profile', { method: 'PUT', body: d });
    toast(t('Profil enregistré', 'Profile saved'), 'success');
  });

  const days = WEEKDAYS();
  let slots = tutorData.availability.map((a) => ({ ...a }));
  const box = app.querySelector('[data-avail]');
  const draw = () => {
    box.innerHTML = slots.length ? slots.map((s, i) => html`<div class="avail-row" data-i="${i}">
      <select data-k="weekday">${[1, 2, 3, 4, 5, 6, 0].map((d) => html`<option value="${d}" ${s.weekday === d ? 'selected' : ''}>${days[d]}</option>`)}</select>
      <input type="time" step="1800" data-k="start_min" value="${hhmm(s.start_min)}"> → <input type="time" step="1800" data-k="end_min" value="${hhmm(s.end_min)}">
      <button class="btn ghost sm danger" data-rm="${i}">×</button></div>`).join('') : html`<p class="muted">${t('Aucune disponibilité', 'No availability')}</p>`;
    box.querySelectorAll('[data-k]').forEach((el) => {
      el.onchange = () => {
        const s = slots[el.closest('[data-i]').dataset.i];
        s[el.dataset.k] = el.dataset.k === 'weekday' ? Number(el.value) : toMin(el.value);
      };
    });
    box.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { slots.splice(Number(b.dataset.rm), 1); draw(); }; });
  };
  draw();
  app.querySelector('[data-addslot]').onclick = () => { slots.push({ weekday: 1, start_min: 17 * 60, end_min: 20 * 60 }); draw(); };
  app.querySelector('[data-saveavail]').onclick = async () => {
    try {
      const r = await api('/tutors/me/availability', { method: 'PUT', body: { slots } });
      toast(`${r.count} ${t('plages enregistrées', 'windows saved')}`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
}
