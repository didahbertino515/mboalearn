import { state, storedLang, api, t, html, raw, avatar, money, loadMe, logout, safeSet, fromNow, toast } from './core.js';

const routes = [
  [/^\/?$/, 'home'],
  [/^\/search$/, 'search'],
  [/^\/tutor\/(\d+)$/, 'tutor'],
  [/^\/(login|register)$/, 'auth'],
  [/^\/(forgot|reset)$/, 'password'],
  [/^\/legal\/(cgu|privacy)$/, 'legal'],
  [/^\/dashboard$/, 'dashboard', true],
  [/^\/lessons$/, 'lessons', true],
  [/^\/wallet$/, 'wallet', true],
  [/^\/messages(?:\/(\d+))?$/, 'messages', true],
  [/^\/groups$/, 'groups'],
  [/^\/homework$/, 'homework', true],
  [/^\/vocab$/, 'vocab', true],
  [/^\/progress\/(\d+)$/, 'progress', true],
  [/^\/settings$/, 'settings', true],
  [/^\/classroom\/([\w-]+)$/, 'classroom', true],
  [/^\/admin$/, 'admin', true],
];

let cleanup = null;
let installPrompt = null; // évènement « beforeinstallprompt » (Android / Chrome / Edge)

async function router() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  const match = routes.find(([re]) => re.test(path || '/'));
  const app = document.getElementById('app');
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  document.body.classList.toggle('in-classroom', match?.[1] === 'classroom');
  if (!match) { app.innerHTML = html`<div class="container empty-page"><h1>404</h1><p>${t('Page introuvable', 'Page not found')}</p><a class="btn primary" href="#/">${t("Retour à l'accueil", 'Back home')}</a></div>`; return; }
  const [re, page, needsAuth] = match;
  if (needsAuth && !state.user) { location.hash = `#/login?next=${encodeURIComponent(location.hash)}`; return; }
  const args = path.match(re).slice(1);
  app.innerHTML = '<div class="container"><div class="loader" aria-label="Chargement"></div></div>';
  try {
    const mod = await import(`./pages/${page}.js`);
    cleanup = (await mod.default(app, { args, params })) || null;
  } catch (e) {
    console.error(e);
    app.innerHTML = html`<div class="container empty-page"><h2>${t('Oups…', 'Oops…')}</h2><p class="muted">${e.message}</p></div>`;
  }
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
  renderHeader();
}

function navLink(href, label) {
  const active = location.hash.split('?')[0] === href ? 'active' : '';
  return html`<a href="${href}" class="${active}">${label}</a>`;
}

export function renderHeader() {
  const u = state.user;
  const el = document.getElementById('topbar');
  const publicLinks = [
    navLink('#/search?category=langue', t('Langues', 'Languages')),
    navLink('#/search?category=scolaire', t('Soutien scolaire', 'Tutoring')),
    navLink('#/groups', t('Cours collectifs', 'Group classes')),
  ];
  el.innerHTML = html`
  <div class="container topbar-inner">
    <a href="#/" class="logo" aria-label="MboaLearn">
      <svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true"><rect width="64" height="64" rx="14" fill="#0b7a4b"/><path d="M14 46V18l18 16 18-16v28" fill="none" stroke="#f5b700" stroke-width="7" stroke-linejoin="round"/></svg>
      <span>Mboa<b>Learn</b></span>
    </a>
    <button class="burger" aria-label="Menu" data-burger>☰</button>
    <nav class="nav" data-nav>
      ${publicLinks}
      ${!u || u.role === 'student' || u.role === 'parent' ? '' : navLink('#/dashboard', t('Tableau de bord', 'Dashboard'))}
      ${u?.role === 'admin' ? navLink('#/admin', 'Admin') : ''}
      ${!u ? navLink('#/register?role=tutor', t('Devenir tuteur', 'Become a tutor')) : ''}
    </nav>
    <div class="top-actions">
      ${installPrompt ? html`<button class="btn accent sm" data-install title="${t("Installer l'application sur cet appareil", 'Install the app on this device')}">📲 <span class="hide-sm">${t("Installer l'app", 'Install app')}</span></button>` : ''}
      <select class="mini-select" data-currency aria-label="Devise">
        ${['XAF', 'EUR', 'USD'].map((c) => raw(`<option ${state.currency === c ? 'selected' : ''}>${c}</option>`))}
      </select>
      <button class="mini-btn" data-lang title="Langue / Language">${state.lang === 'fr' ? 'EN' : 'FR'}</button>
      ${u ? html`
        <a class="icon-btn" href="#/messages" title="${t('Messages', 'Messages')}">💬${u.unread_messages ? html`<i class="dot">${u.unread_messages}</i>` : ''}</a>
        <button class="icon-btn" data-notif title="Notifications">🔔${u.unread_notifications ? html`<i class="dot">${u.unread_notifications}</i>` : ''}</button>
        <div class="user-menu">
          <button class="user-btn" data-menu>${avatar(u.name, u.avatar, 34)}<span class="hide-sm">${money(u.wallet_balance)}</span></button>
          <div class="dropdown" data-dropdown hidden>
            <div class="dropdown-head"><b>${u.name}</b><small class="muted">${roleLabel(u.role)}</small></div>
            <a href="#/dashboard">🏠 ${t('Mon espace', 'My space')}</a>
            <a href="#/lessons">📅 ${t('Mes cours', 'My lessons')}</a>
            <a href="#/wallet">💰 ${t('Portefeuille', 'Wallet')}</a>
            <a href="#/homework">📝 ${t('Devoirs & quiz', 'Homework & quizzes')}</a>
            ${u.role === 'student' ? html`<a href="#/vocab">🧠 ${t('Mon vocabulaire', 'My vocabulary')}</a><a href="#/progress/${u.id}">📈 ${t('Ma progression', 'My progress')}</a>` : ''}
            <a href="#/settings">⚙️ ${t('Paramètres', 'Settings')}</a>
            <button data-logout>🚪 ${t('Déconnexion', 'Log out')}</button>
          </div>
        </div>` : html`
        <a class="btn ghost sm" href="#/login">${t('Connexion', 'Log in')}</a>
        <a class="btn primary sm" href="#/register">${t("S'inscrire", 'Sign up')}</a>`}
    </div>
  </div>`;

  el.querySelector('[data-install]')?.addEventListener('click', async () => {
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === 'accepted') toast(t('Application installée 🎉', 'App installed 🎉'), 'success');
    installPrompt = null;
    renderHeader();
  });
  el.querySelector('[data-burger]').onclick = () => el.querySelector('[data-nav]').classList.toggle('open');
  el.querySelector('[data-lang]').onclick = async () => {
    state.lang = state.lang === 'fr' ? 'en' : 'fr';
    safeSet('ml_lang', state.lang);
    document.documentElement.lang = state.lang;
    if (state.user) api('/auth/me', { method: 'PUT', body: { ui_lang: state.lang } }).catch(() => {});
    renderFooter();
    router();
  };
  el.querySelector('[data-currency]').onchange = (e) => { state.currency = e.target.value; safeSet('ml_currency', state.currency); router(); };
  const menuBtn = el.querySelector('[data-menu]');
  if (menuBtn) {
    const dd = el.querySelector('[data-dropdown]');
    menuBtn.onclick = (e) => { e.stopPropagation(); dd.hidden = !dd.hidden; };
    document.addEventListener('click', () => { dd.hidden = true; }, { once: true });
    el.querySelector('[data-logout]').onclick = () => logout();
  }
  el.querySelector('[data-notif]')?.addEventListener('click', showNotifications);
}

export const roleLabel = (r) => ({ student: t('Élève / Apprenant', 'Student'), tutor: t('Tuteur', 'Tutor'), parent: t('Parent', 'Parent'), admin: 'Admin' }[r]);

async function showNotifications(e) {
  e.stopPropagation();
  document.querySelector('.notif-panel')?.remove();
  const list = await api('/auth/notifications');
  const panel = document.createElement('div');
  panel.className = 'notif-panel';
  panel.innerHTML = html`<div class="notif-head"><b>Notifications</b></div>${list.length ? list.map((n) => html`
    <a class="notif ${n.read_at ? '' : 'unread'}" href="${n.link || '#/dashboard'}"><b>${n.title}</b><span>${n.body || ''}</span><small>${fromNow(n.created_at.replace(' ', 'T') + 'Z')}</small></a>`)
    : html`<p class="muted pad">${t('Aucune notification', 'No notifications')}</p>`}`;
  document.body.append(panel);
  const close = (ev) => { if (!panel.contains(ev.target) || ev.target.closest('a')) { panel.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close));
  await api('/auth/notifications/read', { method: 'POST' });
  state.user.unread_notifications = 0;
}

function renderFooter() {
  document.getElementById('footer').innerHTML = html`
  <div class="container footer-grid">
    <div>
      <div class="logo light"><span>Mboa<b>Learn</b></span></div>
      <p>${t("La plateforme camerounaise de cours de langues et de soutien scolaire en ligne. Du CP au Bac, du BEPC au GCE, de l'anglais au Duala.", 'The Cameroonian platform for online language lessons and school tutoring.')}</p>
      <p class="pay-logos"><span class="op mtn">MTN MoMo</span><span class="op orange">Orange Money</span><span class="op card">Visa / Mastercard</span></p>
    </div>
    <div><h4>${t('Apprendre', 'Learn')}</h4>
      <a href="#/search?category=langue&subject=Anglais">${t('Cours d\'anglais', 'English lessons')}</a>
      <a href="#/search?category=scolaire&subject=Math%C3%A9matiques">${t('Cours de maths', 'Maths tutoring')}</a>
      <a href="#/search?category=scolaire&level=Terminale%20(Bac)">${t('Préparation au Bac', 'Bac preparation')}</a>
      <a href="#/search?category=scolaire&level=GCE%20A%20Level">GCE O/A Level</a>
      <a href="#/groups">${t('Cours collectifs', 'Group classes')}</a>
    </div>
    <div><h4>${t('Enseigner', 'Teach')}</h4>
      <a href="#/register?role=tutor">${t('Devenir tuteur', 'Become a tutor')}</a>
      <a href="#/register?role=parent">${t('Espace parents', 'Parents')}</a>
    </div>
    <div><h4>${t('Garanties', 'Guarantees')}</h4>
      <a href="#/legal/cgu">${t("Conditions d'utilisation", 'Terms of use')}</a>
      <a href="#/legal/privacy">${t('Confidentialité', 'Privacy')}</a>
      <p class="small">✔ ${t('Paiement sécurisé en séquestre', 'Escrow-protected payments')}<br>✔ ${t('Annulation gratuite jusqu\'à 12h avant', 'Free cancellation up to 12h before')}<br>✔ ${t('Remboursement si le cours n\'a pas eu lieu', 'Refund if the lesson did not happen')}<br>✔ ${t('Tuteurs vérifiés manuellement', 'Manually verified tutors')}</p>
    </div>
  </div>
  <div class="container copyright">© ${new Date().getFullYear()} MboaLearn — Yaoundé · Douala · Buea · ${t('diaspora', 'diaspora')}</div>`;
}

function connectSocket() {
  if (!state.token || state.socket || !window.io) return;
  state.socket = window.io({ auth: { token: state.token } });
  state.socket.on('notification', (n) => {
    toast(`${n.title}${n.body ? ' — ' + n.body : ''}`, 'info');
    if (state.user) { state.user.unread_notifications++; renderHeader(); }
  });
  state.socket.on('message', (m) => {
    if (m.sender_id !== state.user?.id && !location.hash.startsWith(`#/messages/${m.conversation_id}`)) {
      state.user.unread_messages++;
      renderHeader();
    }
    window.dispatchEvent(new CustomEvent('chat-message', { detail: m }));
  });
}

window.addEventListener('auth-changed', async () => {
  await loadMe();
  connectSocket();
  renderHeader();
});
window.addEventListener('hashchange', router);

// Application installable (PWA)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; renderHeader(); });
window.addEventListener('appinstalled', () => { installPrompt = null; renderHeader(); });
window.addEventListener('offline', () => toast(t('Connexion perdue : certaines actions sont indisponibles.', 'You are offline.'), 'error'));
window.addEventListener('online', () => { toast(t('Connexion rétablie', 'Back online'), 'success'); router(); });

(async function start() {
  document.documentElement.lang = state.lang;
  state.payConfig = await api('/payments/config').catch(() => null);
  await loadMe();
  if (state.user?.ui_lang && !storedLang) state.lang = state.user.ui_lang;
  connectSocket();
  renderFooter();
  renderHeader();
  router();
})();
