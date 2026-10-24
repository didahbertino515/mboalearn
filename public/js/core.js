// Noyau de l'application : état, API, i18n, utilitaires d'interface
export const state = {
  token: safeGet('ml_token'),
  user: null,
  lang: safeGet('ml_lang') || 'fr',
  currency: safeGet('ml_currency') || 'XAF',
  payConfig: null,
  socket: null,
};

export const storedLang = safeGet('ml_lang');
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function safeSet(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* stockage indisponible */ } }

// Traduction inline : t('Bonjour', 'Hello')
export const t = (fr, en) => (state.lang === 'en' && en ? en : fr);

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.token && !path.startsWith('/auth/login')) {
    logout(false);
  }
  if (!res.ok) throw Object.assign(new Error(data.error || t('Une erreur est survenue', 'Something went wrong')), { status: res.status, data });
  return data;
}

export function logout(redirect = true) {
  state.token = null;
  state.user = null;
  safeSet('ml_token', null);
  state.socket?.disconnect();
  state.socket = null;
  if (redirect) location.hash = '#/';
  window.dispatchEvent(new Event('auth-changed'));
}

export async function loadMe() {
  if (!state.token) { state.user = null; return null; }
  try { state.user = await api('/auth/me'); } catch { state.user = null; }
  return state.user;
}

// ------------------------------------------------------------ Formatage
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };

// Gabarit HTML avec échappement automatique des valeurs interpolées
export function html(strings, ...values) {
  return new Raw(strings.reduce((out, s, i) => {
    if (i === 0) return s;
    const v = values[i - 1];
    const val = v instanceof Raw ? v.v : Array.isArray(v) ? v.map((x) => (x instanceof Raw ? x.v : esc(x))).join('') : esc(v);
    return out + val + s;
  }, ''));
}
// Fragment HTML déjà sûr (non ré-échappé lorsqu'il est imbriqué)
class Raw { constructor(v) { this.v = v; } toString() { return this.v; } }
export const raw = (v) => new Raw(v);

export function money(xaf, currency = state.currency) {
  const n = Number(xaf) || 0;
  if (currency === 'XAF' || !state.payConfig) return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
  const v = n * state.payConfig.rates[currency];
  return v.toLocaleString(state.lang === 'en' ? 'en-US' : 'fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 });
}

const locale = () => (state.lang === 'en' ? 'en-GB' : 'fr-FR');
export const fmtDate = (iso, opts = { dateStyle: 'medium', timeStyle: 'short' }) => new Date(iso).toLocaleString(locale(), opts);
export const fmtDay = (iso) => new Date(iso).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
export function fromNow(iso) {
  const diff = (Date.parse(iso) - Date.now()) / 60000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  const a = Math.abs(diff);
  if (a < 60) return rtf.format(Math.round(diff), 'minute');
  if (a < 1440) return rtf.format(Math.round(diff / 60), 'hour');
  return rtf.format(Math.round(diff / 1440), 'day');
}

const COLORS = ['#0b7a4b', '#c2410c', '#1d4ed8', '#7c3aed', '#be123c', '#0f766e', '#a16207', '#4338ca'];
export function avatar(name, url, size = 40) {
  if (url) return html`<img class="avatar" src="${url}" alt="" style="width:${size}px;height:${size}px">`;
  const initials = String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const color = COLORS[[...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
  return html`<span class="avatar" style="width:${size}px;height:${size}px;background:${color};font-size:${Math.round(size * 0.38)}px">${initials}</span>`;
}

export const stars = (r) => {
  const n = Math.round(Number(r) || 0);
  return raw(`<span class="stars" aria-label="${Number(r) || 0}/5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`);
};

// ------------------------------------------------------------ Interface
export function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 4200);
}

export function modal(content, { wide = false, onClose } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Fermer">×</button><div class="modal-body"></div></div>`;
  const body = wrap.querySelector('.modal-body');
  if (content instanceof Node) body.append(content); else body.innerHTML = String(content);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('.modal-x')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(wrap);
  return { el: body, close };
}

export function confirmBox(message) {
  return new Promise((resolve) => {
    const m = modal(html`<p class="confirm-msg">${message}</p><div class="row end gap"><button class="btn ghost" data-no>${t('Annuler', 'Cancel')}</button><button class="btn primary" data-yes>${t('Confirmer', 'Confirm')}</button></div>`, { onClose: () => resolve(false) });
    m.el.querySelector('[data-yes]').onclick = () => { resolve(true); m.close(); };
    m.el.querySelector('[data-no]').onclick = () => m.close();
  });
}

// Lier un formulaire : récupère les champs, gère le bouton et les erreurs
export function onSubmit(form, handler) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const data = Object.fromEntries(new FormData(form).entries());
    form.querySelectorAll('input[type=checkbox]').forEach((c) => { if (c.name) data[c.name] = c.checked; });
    btn && (btn.disabled = true);
    try { await handler(data); } catch (err) { toast(err.message, 'error'); } finally { btn && (btn.disabled = false); }
  });
}

export const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = reject;
  r.readAsDataURL(file);
});

export const qs = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null)).toString();

export const SUBJECTS = {
  langue: ['Anglais', 'Français', 'Espagnol', 'Allemand', 'Chinois', 'Arabe', 'Italien', 'Portugais', 'Duala', 'Ewondo', 'Fulfulde', 'Bassa', 'Ghomala', 'Pidgin'],
  scolaire: ['Mathématiques', 'Physique-Chimie', 'SVT', 'Biology', 'Chemistry', 'Informatique', 'Philosophie', 'Français', 'Histoire-Géographie', 'Économie', 'Comptabilité', 'Primaire (toutes matières)'],
};
export const LEVELS = {
  langue: ['Débutant', 'Intermédiaire', 'Avancé'],
  scolaire: ['SIL - CP', 'CE1 - CE2', 'CM1 - CM2 (CEP / Concours 6ème)', '6ème - 5ème', '4ème', '3ème (BEPC)', 'Seconde', 'Première (Probatoire)', 'Terminale (Bac)', 'GCE O Level', 'GCE A Level', 'Université', 'Professionnel'],
};
export const WEEKDAYS = () => (state.lang === 'en' ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']);
