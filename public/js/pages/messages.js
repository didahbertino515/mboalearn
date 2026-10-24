import { state, api, t, html, avatar, fmtTime, fromNow, toast, fileToDataUrl, loadMe } from '../core.js';
import { emptyState } from '../components.js';
import { renderHeader } from '../app.js';

export default async function messages(app, { args }) {
  const convs = await api('/messages');
  const activeId = Number(args[0]) || null;
  app.innerHTML = html`
  <div class="container page">
    <div class="chat-layout card ${activeId ? 'has-active' : ''}">
      <aside class="conv-list">
        <h2>${t('Messages', 'Messages')}</h2>
        ${convs.length ? convs.map((c) => html`
          <a class="conv ${c.id === activeId ? 'active' : ''}" href="#/messages/${c.id}">
            ${avatar(c.other_name, c.other_avatar, 42)}
            <span class="grow"><b>${c.other_name}</b><small class="muted ellipsis">${c.last_body || '…'}</small></span>
            ${c.unread ? html`<i class="dot static">${c.unread}</i>` : ''}
          </a>`) : html`<p class="muted pad">${t('Aucune conversation. Contactez un tuteur depuis son profil.', 'No conversations yet.')}</p>`}
      </aside>
      <section class="chat" data-chat>${activeId ? '<div class="loader"></div>' : emptyState('💬', t('Sélectionnez une conversation', 'Select a conversation'), '')}</section>
    </div>
  </div>`;
  if (!activeId) return;

  const data = await api(`/messages/${activeId}`);
  await loadMe();
  renderHeader();
  const chat = app.querySelector('[data-chat]');
  chat.innerHTML = html`
    <header class="chat-head"><a href="#/messages" class="back">←</a>${avatar(data.other.name, data.other.avatar, 36)}<b>${data.other.name}</b>
      ${data.other.role === 'tutor' ? html`<a class="btn ghost sm" href="#/tutor/${data.other.id}">${t('Profil', 'Profile')}</a><a class="btn primary sm" href="#/tutor/${data.other.id}?book=regular">${t('Réserver', 'Book')}</a>` : ''}</header>
    <div class="chat-body" data-body></div>
    <form class="chat-form" data-form>
      <label class="icon-btn" title="${t('Joindre un fichier', 'Attach file')}">📎<input type="file" hidden data-file accept="image/*,.pdf,.doc,.docx,.pptx,.txt,audio/*"></label>
      <input name="body" placeholder="${t('Écrire un message…', 'Write a message…')}" autocomplete="off">
      <button class="btn primary" type="submit">➤</button>
    </form>`;
  const body = chat.querySelector('[data-body]');
  const bubble = (m) => {
    const att = m.attachment ? JSON.parse(m.attachment) : null;
    return html`<div class="bubble ${m.sender_id === state.user.id ? 'me' : ''}">${m.body || ''}${att ? html`<a class="att" href="${att.url}" target="_blank" rel="noopener">📄 ${att.name}</a>` : ''}<small>${fmtTime(m.created_at.includes('T') ? m.created_at : m.created_at.replace(' ', 'T') + 'Z')}</small></div>`;
  };
  body.innerHTML = data.messages.map(bubble).join('');
  body.scrollTop = body.scrollHeight;

  const form = chat.querySelector('[data-form]');
  const send = async (payload) => {
    try { await api(`/messages/${activeId}`, { method: 'POST', body: payload }); } catch (e) { toast(e.message, 'error'); }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const text = form.body.value.trim();
    if (!text) return;
    form.body.value = '';
    await send({ body: text });
  };
  chat.querySelector('[data-file]').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) return toast(t('Fichier trop volumineux (10 Mo max)', 'File too large (10 MB max)'), 'error');
    await send({ attachment: { name: f.name, data: await fileToDataUrl(f) } });
  };
  const onMsg = (e) => {
    const m = e.detail;
    if (m.conversation_id !== activeId) return;
    body.insertAdjacentHTML('beforeend', bubble(m));
    body.scrollTop = body.scrollHeight;
    if (m.sender_id !== state.user.id) api(`/messages/${activeId}`).catch(() => {});
  };
  window.addEventListener('chat-message', onMsg);
  return () => window.removeEventListener('chat-message', onMsg);
}
