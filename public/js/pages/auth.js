import { state, api, t, html, onSubmit, safeSet, toast } from '../core.js';

export default async function auth(app, { args, params }) {
  const mode = args[0];
  const role = ['student', 'tutor', 'parent'].includes(params.role) ? params.role : 'student';
  const roles = [
    ['student', '🎓', t('Je veux apprendre', 'I want to learn'), t('Élève, étudiant ou adulte', 'Student or adult learner')],
    ['parent', '👨‍👩‍👧', t('Je suis parent', "I'm a parent"), t('Je paie et je suis mes enfants', 'I pay for and follow my children')],
    ['tutor', '🧑‍🏫', t('Je veux enseigner', 'I want to teach'), t('Professeur, étudiant, natif…', 'Teacher, student, native speaker…')],
  ];
  app.innerHTML = html`
  <div class="container auth-page">
    <div class="card auth-card">
      <h1>${mode === 'login' ? t('Bon retour 👋', 'Welcome back 👋') : t('Créer un compte', 'Create an account')}</h1>
      <form class="stack" data-form>
        ${mode === 'register' ? html`
          <div class="role-pick">${roles.map(([v, icon, l, d]) => html`
            <label class="role-opt"><input type="radio" name="role" value="${v}" ${v === role ? 'checked' : ''}><span><b>${icon} ${l}</b><small>${d}</small></span></label>`)}</div>
          <label class="field"><span>${t('Nom complet', 'Full name')}</span><input name="name" required autocomplete="name"></label>` : ''}
        <label class="field"><span>E-mail</span><input name="email" type="email" required autocomplete="email"></label>
        ${mode === 'register' ? html`
          <label class="field"><span>${t('Téléphone (MTN / Orange)', 'Phone (MTN / Orange)')}</span><div class="phone-input"><span>+237</span><input name="phone" inputmode="tel" placeholder="6XX XX XX XX"></div></label>
          <label class="field"><span>${t('Ville', 'City')}</span><input name="city" placeholder="Yaoundé, Douala, Paris…"></label>` : ''}
        <label class="field"><span>${t('Mot de passe', 'Password')}</span><input name="password" type="password" required minlength="${mode === 'register' ? 8 : 1}" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}"></label>
        ${mode === 'register' ? html`<label class="field"><span>${t('Code de parrainage (facultatif)', 'Referral code (optional)')}</span><input name="referral" value="${params.ref || ''}"></label>` : ''}
        <button class="btn primary block" type="submit">${mode === 'login' ? t('Se connecter', 'Log in') : t('Créer mon compte', 'Create my account')}</button>
      </form>
      <p class="center muted">${mode === 'login'
        ? html`${t('Pas encore de compte ?', 'No account yet?')} <a href="#/register">${t("S'inscrire", 'Sign up')}</a>`
        : html`${t('Déjà inscrit ?', 'Already registered?')} <a href="#/login">${t('Se connecter', 'Log in')}</a>`}</p>
      ${mode === 'login' ? html`<div class="demo-box"><b>${t('Comptes de démonstration', 'Demo accounts')}</b> (${t('mot de passe', 'password')} <code>demo1234</code>)
        <div class="chips">${[['eleve', t('Élève', 'Student')], ['tuteur', t('Tuteur', 'Tutor')], ['parent', 'Parent'], ['admin', 'Admin']].map(([e, l]) => html`<button class="chip btnchip" data-demo="${e}@mboalearn.cm">${l}</button>`)}</div></div>` : ''}
    </div>
  </div>`;

  const form = app.querySelector('[data-form]');
  app.querySelectorAll('[data-demo]').forEach((b) => {
    b.onclick = () => { form.email.value = b.dataset.demo; form.password.value = 'demo1234'; form.requestSubmit(); };
  });
  onSubmit(form, async (data) => {
    if (mode === 'register') data.ui_lang = state.lang;
    const r = await api(`/auth/${mode}`, { method: 'POST', body: data });
    state.token = r.token;
    state.user = r.user;
    safeSet('ml_token', r.token);
    window.dispatchEvent(new Event('auth-changed'));
    toast(mode === 'login' ? `${t('Bonjour', 'Hello')} ${r.user.name} !` : t('Bienvenue sur MboaLearn !', 'Welcome to MboaLearn!'), 'success');
    const next = params.next && params.next.startsWith('#/') ? params.next : null;
    location.hash = next || (r.user.role === 'tutor' && mode === 'register' ? '#/settings' : r.user.role === 'admin' ? '#/admin' : '#/dashboard');
  });
}
