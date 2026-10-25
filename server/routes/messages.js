const express = require('express');
const { get, all, run } = require('../db');
const { requireAuth } = require('../auth');
const { emitTo, notify } = require('../notify');
const { saveDataUrl } = require('../uploads');
const { str, wrap } = require('../util');
const { limit, byUser } = require('../ratelimit');

const r = express.Router();

function conversationWith(a, b) {
  const [x, y] = a < b ? [a, b] : [b, a];
  run('INSERT OR IGNORE INTO conversations (a_id, b_id) VALUES (?, ?)', x, y);
  return get('SELECT * FROM conversations WHERE a_id = ? AND b_id = ?', x, y);
}

r.get('/', requireAuth(), (req, res) => {
  const me = req.user.id;
  res.json(all(`SELECT c.id, c.last_at, u.id AS other_id, u.name AS other_name, u.avatar AS other_avatar, u.role AS other_role,
      (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1) AS last_body,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read_at IS NULL) AS unread
    FROM conversations c JOIN users u ON u.id = CASE WHEN c.a_id = ? THEN c.b_id ELSE c.a_id END
    WHERE c.a_id = ? OR c.b_id = ? ORDER BY c.last_at DESC`, me, me, me, me));
});

r.post('/with/:userId', requireAuth(), (req, res) => {
  const other = get('SELECT id FROM users WHERE id = ?', Number(req.params.userId));
  if (!other || other.id === req.user.id) return res.status(400).json({ error: 'Destinataire invalide' });
  res.json(conversationWith(req.user.id, other.id));
});

function loadConv(req) {
  const c = get('SELECT * FROM conversations WHERE id = ?', Number(req.params.id));
  if (!c || (c.a_id !== req.user.id && c.b_id !== req.user.id)) throw Object.assign(new Error('Conversation introuvable'), { status: 404 });
  return c;
}

r.get('/:id', requireAuth(), (req, res) => {
  const c = loadConv(req);
  run("UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL", c.id, req.user.id);
  const otherId = c.a_id === req.user.id ? c.b_id : c.a_id;
  res.json({
    conversation: c,
    other: get('SELECT id, name, avatar, role FROM users WHERE id = ?', otherId),
    messages: all('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 200', c.id).reverse(),
  });
});

r.post('/:id', requireAuth(), limit('msg', 30, 60 * 1000, byUser), wrap(async (req, res) => {
  const c = loadConv(req);
  const body = str(req.body.body, 4000);
  const attachment = req.body.attachment ? JSON.stringify({ url: saveDataUrl(req.body.attachment.data), name: str(req.body.attachment.name, 120) }) : null;
  if (!body && !attachment) return res.status(400).json({ error: 'Message vide' });
  const id = run('INSERT INTO messages (conversation_id, sender_id, body, attachment) VALUES (?, ?, ?, ?)', c.id, req.user.id, body, attachment).lastInsertRowid;
  run("UPDATE conversations SET last_at = datetime('now') WHERE id = ?", c.id);
  const msg = get('SELECT * FROM messages WHERE id = ?', id);
  const otherId = c.a_id === req.user.id ? c.b_id : c.a_id;
  emitTo(otherId, 'message', msg);
  emitTo(req.user.id, 'message', msg);
  // Notification seulement pour le premier message non lu
  if (get('SELECT COUNT(*) n FROM messages WHERE conversation_id = ? AND sender_id = ? AND read_at IS NULL', c.id, req.user.id).n === 1) {
    notify(otherId, `Message de ${req.user.name}`, body.slice(0, 120), `#/messages/${c.id}`);
  }
  res.json(msg);
}));

module.exports = { router: r };
