import { state, api, t, html, onSubmit, safeSet, toast } from '../core.js';

export default async function password(app, { args, params }) {
  if (args[0] === 'forgot') {
    app.innerHTML = html`
    <div class="container auth-page"><div class="card auth-card">
      <h1>${t('Mot de passe oublié', 'Forgot password')}</h1>
      <p class="muted">${t('Saisissez l\'e-mail de votre compte : nous vous enverrons un lien pour choisir un nouveau mot de passe (valable 1 heure).', 'Enter your account email and we will send you a reset link (valid 1 hour).')}</p>
      <form class="stack" data-form>
        <label class="field"><span>E-mail</span><input name="email" type="email" required autocomplete="email"></label>
        <button class="btn primary block" type="submit">${t('Envoyer le lien', 'Send link')}</button>
      </form>
      <div data-done hidden class="notice">${t("Si un compte existe avec cet e-mail, un lien vient d'être envoyé. Pensez à vérifier vos spams. Vous ne recevez rien ? Contactez le support : un administrateur peut vous transmettre un lien par WhatsApp.", 'If an account exists, a link has been sent. Check your spam folder.')}</div>
      <p class="center"><a href="#/login">← ${t('Retour à la connexion', 'Back to login')}</a></p>
    </div></div>`;
    const form = app.querySelector('[data-form]');
    onSubmit(form, async (d) => {
      await api('/auth/forgot', { method: 'POST', body: d });
      form.hidden = true;
      app.querySelector('[data-done]').hidden = false;
    });
    return;
  }

  app.innerHTML = html`
  <div class="container auth-page"><div class="card auth-card">
    <h1>${t('Nouveau mot de passe', 'New password')}</h1>
    ${params.token ? html`
    <form class="stack" data-form>
      <label class="field"><span>${t('Nouveau mot de passe (8 caractères minimum)', 'New password (min. 8 characters)')}</span><input name="password" type="password" minlength="8" required autocomplete="new-password"></label>
      <label class="field"><span>${t('Confirmez le mot de passe', 'Confirm password')}</span><input name="confirm" type="password" minlength="8" required autocomplete="new-password"></label>
      <button class="btn primary block" type="submit">${t('Enregistrer et me connecter', 'Save and log in')}</button>
    </form>` : html`<p class="notice err">${t('Lien incomplet.', 'Incomplete link.')} <a href="#/forgot">${t('Refaire une demande', 'Request a new one')}</a></p>`}
  </div></div>`;
  const form = app.querySelector('[data-form]');
  if (!form) return;
  onSubmit(form, async (d) => {
    if (d.password !== d.confirm) throw new Error(t('Les deux mots de passe ne correspondent pas', 'Passwords do not match'));
    const r = await api('/auth/reset', { method: 'POST', body: { token: params.token, password: d.password } });
    state.token = r.token;
    state.user = r.user;
    safeSet('ml_token', r.token);
    window.dispatchEvent(new Event('auth-changed'));
    toast(t('Mot de passe modifié. Vous êtes connecté.', 'Password changed. You are logged in.'), 'success');
    location.hash = '#/dashboard';
  });
}
