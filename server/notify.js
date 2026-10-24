// Notifications persistées + poussées en temps réel via Socket.IO
let io = null;
const { run, get } = require('./db');

function setIO(instance) { io = instance; }

function notify(userId, title, body, link) {
  const r = run('INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)', userId, title, body || null, link || null);
  if (io) io.to(`user:${userId}`).emit('notification', get('SELECT * FROM notifications WHERE id = ?', r.lastInsertRowid));
}

function emitTo(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { setIO, notify, emitTo };
